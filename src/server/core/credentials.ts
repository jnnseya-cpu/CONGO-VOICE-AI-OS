/**
 * Vendor credentials, set from the administration console.
 *
 * Until now a key reached the platform one way: an operator put it in Secret
 * Manager with `scripts/set-ai-keys.sh` and redeployed, because a running
 * revision keeps the secret version it started with. That is a sound way to run
 * a service and a poor way to open a pilot: wiring an alert channel — the thing
 * standing between an escalation and a person — needed the cloud console, the
 * CLI and a deploy.
 *
 * So a platform administrator can set them here instead. What that costs, said
 * plainly rather than discovered later:
 *
 *  - A key in the database is readable by anyone who can read the database *and*
 *    holds the data key. That is the same boundary as a citizen's recording, and
 *    it is wider than Secret Manager, which the container mounts without the
 *    database being involved. The value is encrypted at rest under its own
 *    purpose, never returned to any client, and every write is audited.
 *  - It takes effect at once on the instance that served the request. Other
 *    instances pick it up at their next scheduler run, or immediately after a
 *    redeploy. For a pilot on one or two instances that is effectively
 *    immediate; it is not a cluster-wide atomic switch and is not described as
 *    one.
 *  - The environment still wins nothing and loses nothing: a value stored here
 *    overrides the deployment's variable, and clearing it falls back to whatever
 *    the deployment set. Nothing has to be removed from Secret Manager first.
 *
 * What cannot be set here, and why, is the important half of this module. The
 * secrets that protect the console are not on the allow-list: an administrator
 * who could rewrite them from inside a session could lock everyone out, make the
 * stored credentials unreadable, or mint themselves a permanent way back in.
 */
import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { decryptValue, encryptValue } from "./crypto";
import { audit } from "./audit";
import { safeLog } from "./redact";

export type CredentialGroup = "ai" | "sms" | "voice" | "whatsapp" | "routing";

export interface CredentialSpec {
  /** The environment variable the platform already reads. */
  name: string;
  group: CredentialGroup;
  /** Shown in the console, in French, to the person doing the wiring. */
  label: string;
  /** What stops working without it. */
  purpose: string;
  /** False for an identifier (a sender id, an account id) that may be read back. */
  secret: boolean;
  /**
   * The complete set of values, when there is one. A selector with three
   * possible answers should be offered as three choices rather than as a text
   * box an administrator has to spell "africastalking" into correctly.
   */
  options?: readonly string[];
  /** A shape check, so a pasted mistake is caught at the door. */
  looksValid?: (value: string) => boolean;
}

const nonEmpty = (v: string) => v.trim().length > 0;
const oneOf = (allowed: readonly string[]) => (v: string) => allowed.includes(v.toLowerCase());

/*
 * The drivers the platform actually implements. A name that is not here is not
 * a configuration mistake to be discovered when an alert fails to arrive: it is
 * refused at the door, because `smsMode()` would silently fall back to "log".
 */
const SMS_DRIVERS = ["log", "africastalking", "twilio"] as const;
const VOICE_DRIVERS = ["log", "twilio"] as const;
const WHATSAPP_DRIVERS = ["log", "meta", "twilio"] as const;

/**
 * The allow-list. Adding a name here makes it settable from the console; that is
 * the whole mechanism, and it is deliberately a short list of vendor
 * credentials.
 */
export const CREDENTIALS: CredentialSpec[] = [
  // ── Intelligence artificielle ──────────────────────────────────────────────
  {
    name: "ANTHROPIC_API_KEY",
    group: "ai",
    label: "Clé Anthropic",
    purpose: "Compréhension et rédaction des réponses, et lecture des photos.",
    secret: true,
    looksValid: (v) => v.startsWith("sk-ant-") && v.length > 30,
  },
  {
    name: "GEMINI_API_KEY",
    group: "ai",
    label: "Clé Google Gemini",
    purpose: "Deuxième fournisseur de compréhension, et transcription de secours.",
    secret: true,
    looksValid: (v) => v.length > 20,
  },
  {
    name: "OPENAI_API_KEY",
    group: "ai",
    label: "Clé OpenAI",
    purpose: "Transcription des messages vocaux, et troisième fournisseur de rédaction.",
    secret: true,
    looksValid: (v) => v.startsWith("sk-") && v.length > 20,
  },
  {
    name: "GOOGLE_TTS_API_KEY",
    group: "ai",
    label: "Clé Google Text-to-Speech",
    purpose: "Voix de synthèse. Sans elle, la réponse est lue par la voix du téléphone.",
    secret: true,
    looksValid: (v) => v.length > 20,
  },

  // ── SMS et USSD (Africa's Talking) ─────────────────────────────────────────
  { name: "AFRICASTALKING_USERNAME", group: "sms", label: "Identifiant Africa's Talking", purpose: "Compte de l'opérateur pour les SMS et l'USSD.", secret: false, looksValid: nonEmpty },
  { name: "AFRICASTALKING_API_KEY", group: "sms", label: "Clé Africa's Talking", purpose: "Envoi des SMS. Sans elle, les messages sont écrits dans le journal au lieu d'être envoyés.", secret: true, looksValid: (v) => v.length > 20 },
  { name: "AFRICASTALKING_SENDER", group: "sms", label: "Expéditeur SMS", purpose: "Nom ou numéro affiché à la réception. Doit être enregistré chez l'opérateur.", secret: false, looksValid: nonEmpty },

  // ── Voix et SMS (Twilio) ───────────────────────────────────────────────────
  { name: "TWILIO_ACCOUNT_SID", group: "voice", label: "Identifiant de compte Twilio", purpose: "Appels entrants et sortants du serveur vocal.", secret: false, looksValid: (v) => v.startsWith("AC") && v.length > 20 },
  { name: "TWILIO_AUTH_TOKEN", group: "voice", label: "Jeton Twilio", purpose: "Signature des appels entrants et téléchargement des enregistrements. Sans lui, un appel non signé est refusé en production.", secret: true, looksValid: (v) => v.length > 20 },
  { name: "TWILIO_FROM", group: "voice", label: "Numéro appelant", purpose: "Numéro depuis lequel le service rappelle un citoyen.", secret: false, looksValid: nonEmpty },

  // ── WhatsApp (Meta) ────────────────────────────────────────────────────────
  { name: "WHATSAPP_PHONE_NUMBER_ID", group: "whatsapp", label: "Identifiant du numéro WhatsApp", purpose: "Numéro professionnel qui envoie et reçoit les messages.", secret: false, looksValid: nonEmpty },
  { name: "WHATSAPP_ACCESS_TOKEN", group: "whatsapp", label: "Jeton d'accès WhatsApp", purpose: "Envoi des messages et téléchargement des médias reçus.", secret: true, looksValid: (v) => v.length > 20 },
  { name: "WHATSAPP_APP_SECRET", group: "whatsapp", label: "Secret d'application WhatsApp", purpose: "Vérification de la signature des messages entrants. Sans lui, un message non signé est refusé en production.", secret: true, looksValid: (v) => v.length > 10 },
  { name: "WHATSAPP_VERIFY_TOKEN", group: "whatsapp", label: "Jeton de vérification WhatsApp", purpose: "Poignée de main initiale que Meta exige pour enregistrer le webhook.", secret: true, looksValid: nonEmpty },

  /*
   * ── Routage des canaux ────────────────────────────────────────────────────
   *
   * Not secrets, and the reason the rest of this page is not enough on its own.
   * Each channel asks two questions before it sends anything: which driver, and
   * are its credentials present. A key without a driver leaves the channel in
   * "log" mode — the message is written down instead of sent — which is exactly
   * the half-configured state that makes an escalation reach nobody while
   * everything looks set. So the driver is chosen here too.
   */
  { name: "SMS_PROVIDER", group: "routing", label: "Opérateur SMS", purpose: "Avec « log », les SMS sont écrits dans le journal et ne partent pas.", secret: false, options: SMS_DRIVERS, looksValid: oneOf(SMS_DRIVERS) },
  { name: "VOICE_PROVIDER", group: "routing", label: "Opérateur vocal", purpose: "Décide si un rappel sortant est réellement passé.", secret: false, options: VOICE_DRIVERS, looksValid: oneOf(VOICE_DRIVERS) },
  { name: "WHATSAPP_PROVIDER", group: "routing", label: "Opérateur WhatsApp", purpose: "Avec « log », les messages WhatsApp ne partent pas.", secret: false, options: WHATSAPP_DRIVERS, looksValid: oneOf(WHATSAPP_DRIVERS) },
];

/**
 * Never settable from a session, whatever the role.
 *
 * `DATA_ENCRYPTION_KEY` encrypts the rows in this very table, so storing it
 * here is circular and one mistake makes every credential and every recording
 * unreadable. `SESSION_SECRET` authenticates the administrator making the
 * change. `CRON_SECRET` is the scheduler's identity, and a wrong value stops
 * reminders, retention and audit verification silently. `BOOTSTRAP_TOKEN` and
 * `ADMIN_RECOVERY_TOKEN` are break-glass doors that exist only while a
 * deployment arms them — an administrator who could set one could leave himself
 * a permanent way in. `OIDC_CLIENT_SECRET` is the institutional sign-in itself.
 *
 * Each of these is changed where it belongs: in the deployment, by someone with
 * the cloud project.
 */
export const NEVER_SETTABLE = [
  "DATA_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "CRON_SECRET",
  "BOOTSTRAP_TOKEN",
  "ADMIN_RECOVERY_TOKEN",
  "OIDC_CLIENT_SECRET",
  "DATABASE_URL",
  "DATABASE_CA_CERT",
] as const;

export function specFor(name: string): CredentialSpec | null {
  if ((NEVER_SETTABLE as readonly string[]).includes(name)) return null;
  return CREDENTIALS.find((c) => c.name === name) ?? null;
}

const PURPOSE = "provider_key";
const SYNC_TTL_MS = 60_000;
let lastSync = 0;
let lastVersion = "";

/**
 * Copies the stored credentials into the process environment.
 *
 * Every reader in the platform — the AI gateway, the SMS client, the WhatsApp
 * adapter, the readiness checks — already reads `process.env`, synchronously, in
 * dozens of places. Hydrating the environment in one place is what makes a key
 * set in the console work everywhere without rewriting those call sites, and
 * without a second notion of "where a key comes from" that could disagree with
 * the first.
 *
 * Returns the version string, so a caller can tell whether anything moved.
 */
export async function syncCredentials(force = false): Promise<string> {
  const now = Date.now();
  if (!force && now - lastSync < SYNC_TTL_MS) return lastVersion;
  lastSync = now;
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.providerCredentials).orderBy(desc(schema.providerCredentials.updatedAt));
    const version = rows.length === 0 ? "" : `${rows.length}:${rows[0].updatedAt.toISOString()}`;
    for (const row of rows) {
      if (!specFor(row.name)) continue; // the allow-list shrank since it was written
      try {
        process.env[row.name] = decryptValue(row.value, PURPOSE);
      } catch {
        // Written under a different data key: say so once, and leave whatever
        // the deployment set rather than clobbering it with nothing.
        safeLog.error("credentials", `${row.name} could not be decrypted; the data key does not match the one it was written with`);
      }
    }
    lastVersion = version;
    return version;
  } catch (err) {
    safeLog.warn("credentials", "stored credentials unavailable; using the deployment's environment", err);
    return lastVersion;
  }
}

/**
 * Forgets when the last sync happened, so the next call reads the table again.
 *
 * The time-to-live is what keeps the hydration at the edges cheap, and it is
 * also what makes the staleness window testable: a test that wants to prove an
 * edge hydrates has to stand where a real instance stands a minute after its
 * last read.
 */
export function resetCredentialSyncForTests(): void {
  lastSync = 0;
  lastVersion = "";
}

export interface CredentialStatus extends Omit<CredentialSpec, "looksValid"> {
  /** "console" when stored here, "deployment" when only an environment variable, "none" when absent. */
  source: "console" | "deployment" | "none";
  /** Last four characters of a secret, or the whole value of an identifier. */
  hint: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** What the console shows. Never a secret, in any field. */
export async function credentialStatus(): Promise<CredentialStatus[]> {
  await syncCredentials();
  const db = await getDb();
  const stored = new Map((await db.select().from(schema.providerCredentials)).map((r) => [r.name, r]));
  return CREDENTIALS.map((spec) => {
    const row = stored.get(spec.name);
    const env = process.env[spec.name]?.trim();
    const value = row ? safeDecrypt(row.value) : env || null;
    return {
      name: spec.name,
      group: spec.group,
      label: spec.label,
      purpose: spec.purpose,
      secret: spec.secret,
      options: spec.options,
      source: row ? "console" : env ? "deployment" : "none",
      hint: value ? (spec.secret ? `…${value.slice(-4)}` : value) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

function safeDecrypt(envelope: string): string | null {
  try {
    return decryptValue(envelope, PURPOSE);
  } catch {
    return null;
  }
}

export class CredentialRefused extends Error {}

/** Stores one credential. The value never leaves the server after this call. */
export async function setCredential(name: string, value: string, actor: { userId: string; role: string; ip?: string | null }): Promise<CredentialStatus> {
  const spec = specFor(name);
  if (!spec) throw new CredentialRefused(`${name} ne peut pas être défini depuis la console.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new CredentialRefused("Valeur vide.");
  if (trimmed.length > 4096) throw new CredentialRefused("Valeur trop longue.");
  if (spec.looksValid && !spec.looksValid(trimmed)) {
    throw new CredentialRefused(`Cette valeur ne ressemble pas à « ${spec.label} ». Vérifiez que vous avez copié la bonne ligne.`);
  }

  const db = await getDb();
  const [before] = await db.select().from(schema.providerCredentials).where(eq(schema.providerCredentials.name, name));
  await db
    .insert(schema.providerCredentials)
    .values({ name, value: encryptValue(trimmed, PURPOSE), secret: spec.secret, updatedBy: actor.userId })
    .onConflictDoUpdate({
      target: schema.providerCredentials.name,
      set: { value: encryptValue(trimmed, PURPOSE), secret: spec.secret, updatedBy: actor.userId, updatedAt: new Date() },
    });

  /*
   * The audit record carries that it changed, who changed it and the last four
   * characters — never the value, and never the old value. An audit trail that
   * holds the keys is a second copy of the keys.
   */
  await audit({
    action: before ? "credential.rotated" : "credential.set",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "provider_credential",
    entityId: name,
    after: { hint: spec.secret ? `…${trimmed.slice(-4)}` : trimmed, group: spec.group },
    purpose: "provider_configuration",
    ip: actor.ip ?? null,
  });

  await syncCredentials(true);
  const { reloadGateway } = await import("@server/ai/gateway");
  reloadGateway();
  const status = await credentialStatus();
  return status.find((s) => s.name === name)!;
}

/** Removes a stored credential; the deployment's own variable applies again. */
export async function clearCredential(name: string, actor: { userId: string; role: string; ip?: string | null }): Promise<CredentialStatus> {
  const spec = specFor(name);
  if (!spec) throw new CredentialRefused(`${name} n'est pas géré depuis la console.`);
  const db = await getDb();
  const removed = await db.delete(schema.providerCredentials).where(eq(schema.providerCredentials.name, name)).returning();
  if (removed.length > 0) {
    await audit({
      action: "credential.cleared",
      actorUserId: actor.userId,
      actorRole: actor.role,
      entityType: "provider_credential",
      entityId: name,
      purpose: "provider_configuration",
      ip: actor.ip ?? null,
    });
  }
  /*
   * Deleting the row does not unset the variable this process already has: the
   * environment is a copy, and the platform must not keep using a credential an
   * administrator has just withdrawn. So it is cleared here and the deployment's
   * own value, if there is one, is restored by the next sync.
   */
  delete process.env[name];
  await syncCredentials(true);
  const { reloadGateway } = await import("@server/ai/gateway");
  reloadGateway();
  return (await credentialStatus()).find((s) => s.name === name)!;
}
