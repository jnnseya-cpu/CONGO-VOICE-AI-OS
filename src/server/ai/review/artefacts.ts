/**
 * What a review board actually signs.
 *
 * AI-10 names four kinds of artefact that may not ship without sign-off: a
 * health protocol version, an emergency script, a knowledge-base document and
 * the health system prompt. Each lives somewhere different in this repository,
 * so this module is the one place that knows how to read the live content of
 * each and reduce it to a digest.
 *
 * The digest is the whole point. A sign-off that says "Dr X approved the fever
 * protocol" is worth nothing if the fever protocol changed afterwards; a
 * sign-off bound to a digest either matches what is running or it does not.
 */
import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { ReviewArtefactKind } from "@server/db/schema";
import { HEALTH_PROTOCOLS, getProtocol } from "../protocols/definitions";
import { FIXED_SCRIPTS, type ScriptKey } from "../language/scripts";
import * as PROMPTS from "../prompts";

/** The prompts a board signs, by the name the submission carries. */
export const REVIEWABLE_PROMPTS: Record<string, { body: string; module: "health" | "agriculture" | "education" }> = {
  health_agent: { body: PROMPTS.HEALTH_AGENT_SYSTEM, module: "health" },
  health_entities: { body: PROMPTS.HEALTH_ENTITY_SYSTEM, module: "health" },
  health_protocol_answers: { body: PROMPTS.HEALTH_PROTOCOL_ANSWERS_SYSTEM, module: "health" },
  health_explanation: { body: PROMPTS.HEALTH_EXPLANATION_SYSTEM, module: "health" },
  safeguarding: { body: PROMPTS.SAFEGUARDING_SYSTEM, module: "health" },
  agriculture_agent: { body: PROMPTS.AGRICULTURE_AGENT_SYSTEM, module: "agriculture" },
  education_agent: { body: PROMPTS.EDUCATION_AGENT_SYSTEM, module: "education" },
};

/**
 * JSON with its object keys in a fixed order, so the same content always
 * produces the same digest. Without this, a reordered field in a protocol
 * definition would silently invalidate every sign-off on it.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function digestOf(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export interface Artefact {
  kind: ReviewArtefactKind;
  artefactId: string;
  version: string;
  title: string;
  module: "health" | "agriculture" | "education";
  digest: string;
  /** The content itself, for the reviewer to read before signing. */
  content: unknown;
}

function protocolArtefact(protocolId: string): Artefact | null {
  const definition = getProtocol(protocolId);
  if (!definition) return null;
  return {
    kind: "protocol_version",
    artefactId: definition.id,
    version: definition.version,
    title: definition.title,
    module: "health",
    digest: digestOf(definition),
    content: definition,
  };
}

function scriptArtefact(key: string): Artefact | null {
  const script = FIXED_SCRIPTS[key as ScriptKey];
  if (!script) return null;
  const digest = digestOf(script);
  return {
    kind: "emergency_script",
    artefactId: key,
    // A fixed script carries no version number of its own; its content is its
    // version, which is exactly the property a sign-off needs.
    version: digest.slice(0, 12),
    title: `Script fixe : ${key}`,
    module: "health",
    digest,
    content: script,
  };
}

function promptArtefact(name: string): Artefact | null {
  const prompt = REVIEWABLE_PROMPTS[name];
  if (!prompt) return null;
  return {
    kind: "system_prompt",
    artefactId: name,
    // A prompt has no version of its own; its digest is its version.
    version: digestOf(prompt.body).slice(0, 12),
    title: `Invite système : ${name}`,
    module: prompt.module,
    digest: digestOf(prompt.body),
    content: prompt.body,
  };
}

async function kbArtefact(docId: string): Promise<Artefact | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.docId, docId));
  if (!row) return null;
  return {
    kind: "kb_document",
    artefactId: row.docId,
    version: row.version,
    title: row.title,
    module: row.module === "general" ? "health" : (row.module as "health" | "agriculture" | "education"),
    digest: row.checksum ?? digestOf(row.body),
    content: { authority: row.authority, source: row.source, evidenceGrade: row.evidenceGrade, body: row.body },
  };
}

/** The live artefact as it would ship right now, or null if there is no such thing. */
export async function readArtefact(kind: ReviewArtefactKind, artefactId: string): Promise<Artefact | null> {
  switch (kind) {
    case "protocol_version":
      return protocolArtefact(artefactId);
    case "emergency_script":
      return scriptArtefact(artefactId);
    case "system_prompt":
      return promptArtefact(artefactId);
    case "kb_document":
      return kbArtefact(artefactId);
  }
}

/** Everything a board could be asked to sign, for the review queue. */
export async function listArtefacts(module?: "health" | "agriculture" | "education"): Promise<Artefact[]> {
  const db = await getDb();
  const kb = await db.select().from(schema.kbDocuments);
  const all: Artefact[] = [
    ...HEALTH_PROTOCOLS.map((p) => protocolArtefact(p.id)!),
    ...Object.keys(FIXED_SCRIPTS).map((k) => scriptArtefact(k)!),
    ...Object.keys(REVIEWABLE_PROMPTS).map((n) => promptArtefact(n)!),
    ...kb.map((row) => ({
      kind: "kb_document" as const,
      artefactId: row.docId,
      version: row.version,
      title: row.title,
      module: (row.module === "general" ? "health" : row.module) as "health" | "agriculture" | "education",
      digest: row.checksum ?? digestOf(row.body),
      content: { authority: row.authority, source: row.source, evidenceGrade: row.evidenceGrade, body: row.body },
    })),
  ];
  return module ? all.filter((a) => a.module === module) : all;
}
