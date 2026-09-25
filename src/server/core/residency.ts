/**
 * Where a citizen's words are allowed to travel.
 *
 * The programme's position is that everything should stay in the Democratic
 * Republic of the Congo. There is no cloud region in the country, so the pilot
 * runs from the nearest available one and migrates when an in-country option
 * exists. That is a defensible decision and a temporary one — what is not
 * defensible is a platform that *says* one thing while an environment variable
 * quietly does another.
 *
 * So the rule here is not "data stays in the DRC". It is: **a deployment
 * declares the jurisdictions it permits, and the platform refuses to send
 * citizen data anywhere else.** A provider outside the declared set is not
 * merely logged — it is never put in the chain, so there is no path by which
 * the bytes leave.
 *
 * Two consequences worth stating plainly, because both will bite:
 *
 *   1. Moving the container does not move the model. A voice recording sent to
 *      a transcription service abroad has left the country whether the server
 *      is in Johannesburg or in Kinshasa. The providers are the residency
 *      question; the hosting is the smaller half of it.
 *   2. A strict policy degrades the platform rather than breaking it. With
 *      every remote provider refused, the offline rules provider still triages
 *      by protocol, still detects danger signs and still speaks the fixed
 *      emergency scripts — it just stops understanding free speech. That is a
 *      different product, and it is the honest one under that constraint.
 */
import "server-only";

/** ISO 3166-1 alpha-2, plus "XX" for a destination whose location is not declared. */
export type Jurisdiction = string;

export const DRC: Jurisdiction = "CD";
/** Where a destination's location has not been declared. Never permitted under a policy. */
export const UNDECLARED: Jurisdiction = "XX";

export type DestinationKind = "self" | "ai_provider" | "channel" | "infrastructure";

export interface Destination {
  /** The identifier the rest of the platform uses: an AI provider key, a channel name. */
  id: string;
  kind: DestinationKind;
  /** Plain description of what actually leaves, in the terms a reviewer would ask about. */
  sends: string;
  /** Who operates it, for the record that a legal review will need. */
  operator: string;
  /**
   * Where the processing happens, as declared by the operator.
   *
   * A function rather than a value: several of these are read from the
   * environment, and a module-level array would freeze whatever was set at
   * import time. That reads as working — the environment rarely changes under a
   * running process — right up until a deployment reports a jurisdiction it is
   * no longer configured for.
   */
  jurisdictions: () => Jurisdiction[];
  /** True when the platform's deterministic safety path depends on it. */
  onSafetyPath: boolean;
  /** What is lost if the policy forbids it. */
  ifRefused: string;
}

/**
 * Every destination a citizen's data can reach. A provider that is not in this
 * list cannot be enabled: `tests/residency.test.ts` walks the gateway's own
 * provider keys and fails if one of them is undeclared, so adding a vendor
 * without saying where it sends data is not possible by accident.
 */
export const DESTINATIONS: Destination[] = [
  {
    id: "self",
    kind: "self",
    sends: "Everything: transcripts, translations, case notes, recordings, photographs, phone numbers (encrypted), safeguarding records.",
    operator: "The programme, on the host it deploys to",
    jurisdictions: () => [deploymentJurisdiction()],
    onSafetyPath: true,
    ifRefused: "Nothing runs. This is the deployment itself.",
  },
  {
    id: "mock",
    kind: "ai_provider",
    sends: "Nothing. The offline rules provider runs in the same process and makes no network call.",
    operator: "The programme",
    jurisdictions: () => [deploymentJurisdiction()],
    onSafetyPath: true,
    ifRefused: "The platform has no fallback and cannot answer at all.",
  },
  {
    id: "anthropic",
    kind: "ai_provider",
    sends: "The French pivot of what the citizen said, and the protocol context, for understanding and explanation.",
    operator: "Anthropic PBC",
    jurisdictions: () => ["US"],
    onSafetyPath: false,
    ifRefused: "Understanding of free speech degrades to the offline rules provider. Danger-sign detection and severity are unaffected — they never used a model.",
  },
  {
    id: "gemini",
    kind: "ai_provider",
    sends: "The citizen's words for understanding, and voice recordings for transcription.",
    operator: "Google LLC",
    jurisdictions: () => ["US"],
    onSafetyPath: false,
    ifRefused: "One fewer understanding and transcription provider in the chain.",
  },
  {
    id: "openai",
    kind: "ai_provider",
    sends: "Voice recordings for transcription, the citizen's words for understanding, and text for speech synthesis.",
    operator: "OpenAI, L.L.C. — or a self-hosted endpoint when OPENAI_BASE_URL is set",
    jurisdictions: () => selfHostedSpeechJurisdictions(),
    onSafetyPath: false,
    ifRefused: "No transcription: a voice call falls back to the fixed scripts and the keypad menu, and free speech is not understood.",
  },
  {
    id: "google_tts",
    kind: "ai_provider",
    sends: "The French or localised answer text, to be spoken.",
    operator: "Google LLC",
    jurisdictions: () => ["US"],
    onSafetyPath: false,
    ifRefused: "Answers are spoken by the next configured synthesiser, or read from a recording where one exists.",
  },
  {
    id: "twilio",
    kind: "channel",
    sends: "The citizen's telephone number, call audio, SMS text, and WhatsApp messages where Twilio carries them.",
    operator: "Twilio Inc.",
    jurisdictions: () => ["US"],
    onSafetyPath: true,
    ifRefused: "No voice, and no SMS or WhatsApp through this carrier. An escalation cannot reach a worker by telephone.",
  },
  {
    id: "meta",
    kind: "channel",
    sends: "The citizen's telephone number, their messages, voice notes and photographs.",
    operator: "Meta Platforms, Inc.",
    jurisdictions: () => ["US"],
    onSafetyPath: true,
    ifRefused: "No WhatsApp channel.",
  },
  {
    id: "africastalking",
    kind: "channel",
    sends: "The citizen's telephone number and the text of reminders, answers and escalation notices.",
    operator: "Africa's Talking — declared base of operations, to be confirmed in procurement",
    jurisdictions: () => [process.env.AFRICASTALKING_JURISDICTION?.trim().toUpperCase() || "KE"],
    onSafetyPath: true,
    ifRefused: "No SMS. Reminders and escalation notices cannot be delivered by message.",
  },
  {
    id: "log",
    kind: "channel",
    sends: "Nothing. A message is written to this deployment's own log instead of being delivered.",
    operator: "The programme",
    jurisdictions: () => [deploymentJurisdiction()],
    onSafetyPath: false,
    ifRefused: "Nothing; a deployment that serves citizens already reports log-only delivery as a failure.",
  },
];

/**
 * Where this deployment itself runs. Declared rather than guessed: a region
 * name is not a jurisdiction, and mapping one to the other in code would be a
 * guess that reads like a fact.
 */
export function deploymentJurisdiction(): Jurisdiction {
  return (process.env.DEPLOYMENT_JURISDICTION ?? UNDECLARED).trim().toUpperCase() || UNDECLARED;
}

/**
 * A self-hosted transcription endpoint is wherever its operator put it, which
 * only they can say. Undeclared means undeclared, not "probably fine".
 */
function selfHostedSpeechJurisdictions(): Jurisdiction[] {
  if (!process.env.OPENAI_BASE_URL) return ["US"];
  const declared = process.env.AI_SELF_HOSTED_JURISDICTION?.trim().toUpperCase();
  return [declared || UNDECLARED];
}



/** A destination with its jurisdictions resolved against the environment now. */
export interface ResolvedDestination extends Omit<Destination, "jurisdictions"> {
  jurisdictions: Jurisdiction[];
}

export function destinations(): ResolvedDestination[] {
  return DESTINATIONS.map((d) => ({ ...d, jurisdictions: d.jurisdictions() }));
}

export function destination(id: string): ResolvedDestination | null {
  const found = DESTINATIONS.find((d) => d.id === id);
  return found ? { ...found, jurisdictions: found.jurisdictions() } : null;
}

/* ── The policy ────────────────────────────────────────────────────────────── */

export interface ResidencyPolicy {
  /** Empty means unrestricted: every destination is permitted. */
  permitted: Jurisdiction[];
  restricted: boolean;
  /** What the programme is aiming at, recorded so the gap is visible. */
  intent: Jurisdiction;
}

/**
 * `DATA_RESIDENCY` is a comma-separated list of permitted jurisdictions.
 * Unset means unrestricted, which is right on a laptop and a decision anywhere
 * else — the readiness probe says so in a deployment that serves citizens.
 */
export function residencyPolicy(): ResidencyPolicy {
  const raw = (process.env.DATA_RESIDENCY ?? "").trim();
  const permitted = raw
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  return { permitted, restricted: permitted.length > 0, intent: DRC };
}

export interface Verdict {
  permitted: boolean;
  /** Which declared jurisdictions of the destination the policy does not allow. */
  offending: Jurisdiction[];
  reason: "unrestricted" | "permitted" | "outside_policy" | "undeclared_jurisdiction" | "unknown_destination";
}

/** May citizen data be sent to this destination under the running policy? */
export function permits(destinationId: string, policy: ResidencyPolicy = residencyPolicy()): Verdict {
  const target = destination(destinationId);
  if (!target) {
    // A destination nobody declared is refused under a policy and reported
    // without one: the whole point is that nothing travels unexamined.
    return { permitted: !policy.restricted, offending: [], reason: "unknown_destination" };
  }
  if (!policy.restricted) return { permitted: true, offending: [], reason: "unrestricted" };

  const offending = target.jurisdictions.filter((j) => !policy.permitted.includes(j));
  if (offending.includes(UNDECLARED)) return { permitted: false, offending, reason: "undeclared_jurisdiction" };
  if (offending.length > 0) return { permitted: false, offending, reason: "outside_policy" };
  return { permitted: true, offending: [], reason: "permitted" };
}

/** The destination ids a policy allows, from a candidate list. */
export function permittedOf(ids: string[], policy: ResidencyPolicy = residencyPolicy()): string[] {
  return ids.filter((id) => permits(id, policy).permitted);
}

export interface ResidencyReport {
  policy: ResidencyPolicy;
  /** Destinations that are configured and reachable right now. */
  active: Array<{ id: string; kind: DestinationKind; jurisdictions: Jurisdiction[]; permitted: boolean; reason: Verdict["reason"] }>;
  /** Configured destinations the policy forbids: these are refused, not used. */
  refused: Array<{ id: string; jurisdictions: Jurisdiction[]; ifRefused: string }>;
  /** True when every active destination is inside the policy. */
  compliant: boolean;
  /** Jurisdictions citizen data can actually reach, given what is configured. */
  reach: Jurisdiction[];
  /** True when the reach is exactly the programme's stated intent. */
  meetsIntent: boolean;
}

/**
 * What a deployment would have to admit if asked. `configured` is supplied by
 * the caller, because only the gateway and the channel layer know what is
 * actually switched on.
 */
export function residencyReport(configured: string[], policy: ResidencyPolicy = residencyPolicy()): ResidencyReport {
  const ids = ["self", ...configured.filter((id) => id !== "self")];
  const active: ResidencyReport["active"] = [];
  const refused: ResidencyReport["refused"] = [];

  for (const id of ids) {
    const target = destination(id);
    const verdict = permits(id, policy);
    const jurisdictions = target?.jurisdictions ?? [UNDECLARED];
    if (verdict.permitted) {
      active.push({ id, kind: target?.kind ?? "ai_provider", jurisdictions, permitted: true, reason: verdict.reason });
    } else {
      refused.push({ id, jurisdictions, ifRefused: target?.ifRefused ?? "Unknown destination; nothing is sent to it." });
    }
  }

  const reach = [...new Set(active.flatMap((a) => a.jurisdictions))].sort();
  return {
    policy,
    active,
    refused,
    compliant: refused.length === 0,
    reach,
    meetsIntent: reach.length === 1 && reach[0] === policy.intent,
  };
}

/* ── Readiness ─────────────────────────────────────────────────────────────── */

/** Stages where an undeclared or unrestricted residency posture is a finding. */
const SERVING = new Set(["pilot", "prod"]);

/**
 * Three things a deployment that serves citizens should not be able to hide:
 * that it never declared a policy, that something configured is outside the one
 * it did declare, and that it never said where it is running.
 *
 * None of these is "data left the country" — the guard makes that impossible by
 * construction. They are the ways the *claim* and the *configuration* drift
 * apart, which is the failure a ministry would actually be lied to by.
 */
export function residencyReadiness(configured: string[], stage: string): Array<{ id: string; ok: boolean; detail: string }> {
  const serving = SERVING.has(stage);
  const policy = residencyPolicy();
  const report = residencyReport(configured, policy);
  const checks: Array<{ id: string; ok: boolean; detail: string }> = [];

  checks.push({
    id: "residency_policy_declared",
    ok: !serving || policy.restricted,
    detail: policy.restricted
      ? `Juridictions autorisées : ${policy.permitted.join(", ")}.`
      : "DATA_RESIDENCY non défini : aucune restriction n'est appliquée sur les destinations des données.",
  });

  checks.push({
    id: "deployment_jurisdiction_declared",
    ok: !serving || deploymentJurisdiction() !== UNDECLARED,
    detail:
      deploymentJurisdiction() === UNDECLARED
        ? "DEPLOYMENT_JURISDICTION non défini : le pays d'hébergement n'est pas déclaré."
        : `Hébergement déclaré : ${deploymentJurisdiction()}.`,
  });

  checks.push({
    id: "residency_configuration_consistent",
    ok: report.compliant,
    detail: report.compliant
      ? `Destinations actives conformes à la politique. Portée réelle : ${report.reach.join(", ") || "aucune"}.`
      : `Configuré mais refusé par la politique : ${report.refused.map((r) => `${r.id} (${r.jurisdictions.join(", ")})`).join(", ")}.`,
  });

  return checks;
}
