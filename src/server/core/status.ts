import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@server/db/client";

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
  checks: ReadinessCheck[];
}

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
  const prod = process.env.NODE_ENV === "production";

  const smsReal = (process.env.SMS_PROVIDER ?? "log") !== "log";
  const waReal = (process.env.WHATSAPP_PROVIDER ?? "log") !== "log";
  const voiceReal = (process.env.VOICE_PROVIDER ?? "log") !== "log";
  checks.push({
    id: "escalation_delivery",
    ok: !prod || smsReal || waReal || voiceReal,
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

  checks.push({
    id: "public_origin",
    ok: !prod || Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    detail: process.env.NEXT_PUBLIC_SITE_URL ? "Origine publique configurée." : "NEXT_PUBLIC_SITE_URL absente : liens et médias sortants incorrects.",
  });

  return { ok: checks.every((c) => c.ok), checks };
}
