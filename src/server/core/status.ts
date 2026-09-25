import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@server/db/client";
import { unreadablePhoneCount } from "./phone";

/** Cheap liveness probe for the status badge in the top bar. Never throws. */
export async function systemOk(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export interface ReadinessCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface Readiness {
  ok: boolean;
  /** Which kind of deployment this is judged as. */
  stage: DeploymentStage;
  checks: ReadinessCheck[];
}

/**
 * A staging environment genuinely has no telephony and no citizens. Judging it
 * by the same rule as a live province would either make the probe useless there
 * or tempt someone to configure a fake provider, which is worse. So the stage
 * is declared, and only a stage that serves citizens must be able to reach one.
 */
export type DeploymentStage = "dev" | "staging" | "pilot" | "prod";

export function deploymentStage(): DeploymentStage {
  const declared = (process.env.DEPLOYMENT_STAGE ?? "").toLowerCase();
  if (declared === "dev" || declared === "staging" || declared === "pilot" || declared === "prod") return declared;
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

/** Stages where a citizen may be told a person has been alerted. */
const SERVES_CITIZENS: DeploymentStage[] = ["pilot", "prod"];

/**
 * Whether the platform can keep the promises it makes to a citizen.
 *
 * The build being green says nothing about this. "Un agent a été alerté et vous
 * recontactera" is a promise that needs a configured provider at the other end,
 * a key that can decrypt what was recorded, and a session secret that survives
 * a restart. Each of these has a failure mode where everything looks fine and
 * nothing arrives, so each is checked and named.
 */
export function readiness(): Readiness {
  // Read the environment as it is now rather than as it was at import time, so
  // this reports the running configuration and can be exercised in a test.
  const checks: ReadinessCheck[] = [];
  const stage = deploymentStage();
  const prod = process.env.NODE_ENV === "production";
  const serving = SERVES_CITIZENS.includes(stage);

  const smsReal = (process.env.SMS_PROVIDER ?? "log") !== "log";
  const waReal = (process.env.WHATSAPP_PROVIDER ?? "log") !== "log";
  const voiceReal = (process.env.VOICE_PROVIDER ?? "log") !== "log";
  checks.push({
    id: "escalation_delivery",
    ok: !serving || smsReal || waReal || voiceReal,
    detail: smsReal || waReal || voiceReal
      ? `Canaux d'alerte configurés : ${[smsReal && "SMS", waReal && "WhatsApp", voiceReal && "appel"].filter(Boolean).join(", ")}.`
      : "Aucun fournisseur d'alerte configuré : une escalade vers un agent n'atteindrait personne.",
  });

  checks.push({
    id: "data_encryption_key",
    ok: !prod || Boolean(process.env.DATA_ENCRYPTION_KEY),
    detail: process.env.DATA_ENCRYPTION_KEY ? "Clé de chiffrement des données présente." : "DATA_ENCRYPTION_KEY absente : enregistrements et secrets d'authentification illisibles.",
  });

  checks.push({
    id: "session_secret",
    ok: !prod || Boolean(process.env.SESSION_SECRET),
    detail: process.env.SESSION_SECRET ? "Secret de session présent." : "SESSION_SECRET absent : toutes les sessions tomberaient au redémarrage.",
  });

  // Rotating or restoring the wrong data key does not stop the platform, but it
  // does stop every alert finding its destination, so it must be visible.
  const unreadable = unreadablePhoneCount();
  checks.push({
    id: "stored_data_readable",
    ok: unreadable === 0,
    detail: unreadable === 0 ? "Les données chiffrées se relisent correctement." : `${unreadable} numéro(s) illisibles : la clé de chiffrement ne correspond pas à celle qui a servi à les écrire.`,
  });

  checks.push({
    id: "public_origin",
    ok: !prod || Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    detail: process.env.NEXT_PUBLIC_SITE_URL ? "Origine publique configurée." : "NEXT_PUBLIC_SITE_URL absente : liens et médias sortants incorrects.",
  });

  return { ok: checks.every((c) => c.ok), stage, checks };
}
