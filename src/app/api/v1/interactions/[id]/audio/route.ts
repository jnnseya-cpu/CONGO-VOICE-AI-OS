import { and, eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { forbidden, notFound } from "@server/core/errors";
import { hasPermission } from "@server/core/rbac";
import { audit } from "@server/core/audit";
import { storage, storeUpload } from "@server/core/storage";
import { schema } from "@server/db/client";
import { aiGateway } from "@server/ai/gateway";
import { toSpokenText } from "@server/ai/language/voice";

/**
 * The spoken answer, made when it is asked for rather than before.
 *
 * Synthesis and the upload that follows it used to sit inside the turn, between
 * the citizen's question and their answer. A turn measured at thirty-eight
 * seconds was spending several of them producing audio that the page had not
 * yet asked to play — and every one of those seconds was spent with somebody
 * watching a spinner, after speech recognition and the specialist agent had
 * already had theirs.
 *
 * Moving it here does not change what is kept. The file row is still written
 * the first time the audio is produced, so the record of what was said to a
 * citizen is the same record it was; it is written a moment later and only for
 * the turns where somebody listens. The page requests this URL as soon as the
 * answer arrives, so the audio still follows the answer by about the time it
 * always did — the difference is that the text no longer waits behind it.
 *
 * A turn whose audio cannot be produced returns 204, and the page falls back to
 * the browser's own speech synthesis. Silence is never the outcome: for someone
 * who cannot read, the spoken answer is the answer.
 */
export const GET = handle<{ id: string }>({ auth: true }, async ({ db, user, params }) => {
  const [interaction] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, params.id));
  if (!interaction) throw notFound();
  if (interaction.userId !== user.userId && !hasPermission(user.role, "case:read")) throw forbidden();

  /**
   * Already made, on an earlier request or an earlier listen.
   *
   * Checked first so that pressing "Écouter" twice, or two health workers
   * opening the same case, costs one synthesis rather than one each.
   */
  const [existing] = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.interactionId, params.id), eq(schema.files.kind, "audio")));
  if (existing && existing.storageKey) {
    const data = await storage().get(existing.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": existing.mimeType,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // French is the canonical language of every answer, so it is also the safe
  // reading for a row whose language was never resolved.
  const language = interaction.language ?? "fr";
  const text = toSpokenText(interaction.response ?? "", language);
  if (!text.trim()) return new Response(null, { status: 204 });

  try {
    const speech = await aiGateway().synthesize({ text, language }, { interactionId: params.id });
    if (!speech) return new Response(null, { status: 204 });

    const stored = await storeUpload(speech.audio, speech.mimeType, "tts");
    await db.insert(schema.files).values({
      userId: interaction.userId,
      interactionId: params.id,
      kind: "audio",
      storageKey: stored.key,
      mimeType: speech.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
    });
    return new Response(new Uint8Array(speech.audio), {
      headers: {
        "Content-Type": speech.mimeType,
        "Content-Length": String(speech.audio.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    /**
     * Recorded, then handed back to the browser to speak.
     *
     * A platform that has gone quiet must not look like one that is working,
     * which is why this is audited rather than swallowed — but the citizen is
     * not told about a provider. They get the answer read by their own phone.
     */
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[audio] the spoken answer could not be produced or stored:", reason);
    await audit({
      action: "interaction.audio_unavailable",
      actorUserId: user.userId,
      entityType: "interaction",
      entityId: params.id,
      systemEvent: "tts_or_storage_failure",
      after: { reason: reason.slice(0, 200) },
    });
    return new Response(null, { status: 204 });
  }
});
