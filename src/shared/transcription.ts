/**
 * Telling speech from what a speech model invents when it hears none.
 *
 * A citizen spoke into the health module and the platform showed them, as their
 * own words, "Sous-titrage ST' 501". Another spoke and was shown "Je vous
 * remercie pour votre attention et je vous remercie pour votre appropriation de
 * la saison." Neither said anything of the kind.
 *
 * Both are Whisper's known failure mode. It was trained on subtitle tracks, so
 * when it is handed audio with no speech it can recognise — silence, wind, a
 * crowded room, a language it was never taught — it emits the most likely
 * subtitle-shaped text instead of nothing: a broadcaster's caption credit, a
 * sign-off to an audience, a thank-you. It emits these with high internal
 * confidence, because as text they are perfectly ordinary.
 *
 * Downstream, nothing could tell the difference. The transcript was non-empty,
 * so it went to the agents as the citizen's words; the answer explained that the
 * message contained no health information, opened a case, alerted a community
 * health worker, and asked the citizen to confirm that they had said "ST' 501".
 * A scarce human was sent a fabricated referral, and a sick person was asked to
 * validate noise.
 *
 * This is decided here, in code, before any model sees the text — the same rule
 * as every other safety threshold in this platform. A model asked "did you make
 * this up?" is the wrong instrument: it is the thing that made it up.
 *
 * Shared rather than server-only so the handset can apply it to on-device
 * recognition too, and so it is testable without a database.
 */

/**
 * Phrases Whisper produces from audio containing no usable speech.
 *
 * Collected from the artefacts this platform has actually produced plus the
 * widely reported ones, in French because that is the model's default here, and
 * in English because it falls back to English on unfamiliar audio. Matched after
 * folding case and accents, so "Sous-titrage" and "sous titrage" are one entry.
 *
 * They are matched as substrings on purpose. The model pads them — "ST' 501",
 * a channel name, a year — and the padding is not a reason to treat the line as
 * speech.
 */
export const TRANSCRIPTION_ARTEFACTS: readonly string[] = [
  // Caption and subtitle credits.
  "sous titrage",
  "sous titres",
  "sous titres realises par la communaute",
  "sous titrage realise par",
  "soustitrage",
  "soustitres",
  "amara.org",
  "sous-titrage société radio-canada",
  "subtitles by",
  "subtitled by",
  "captioning by",
  "transcription by",
  "synchronized by",
  "corrected by",
  // Sign-offs to an audience that does not exist.
  "merci d'avoir regarde",
  "merci d avoir regarde",
  "merci de votre attention",
  "merci pour votre attention",
  "je vous remercie de votre attention",
  "je vous remercie pour votre attention",
  "merci a tous et a bientot",
  "thanks for watching",
  "thank you for watching",
  "see you next time",
  "see you in the next video",
  // Channel promotion.
  "abonnez vous",
  "n'oubliez pas de vous abonner",
  "n oubliez pas de vous abonner",
  "please subscribe",
  "like and subscribe",
  // Bracketed sound descriptions, which are caption conventions, not speech.
  "[musique]",
  "[applaudissements]",
  "(musique)",
  "[music]",
  "[applause]",
  "[silence]",
  "[bruit]",
];

/**
 * A word as it is compared: accents folded, case dropped.
 *
 * Comparison happens word by word rather than over the raw string because the
 * punctuation is not stable. Whisper writes "Sous-titrage" with a hyphen,
 * "sous titrage" without one, and "Sous-titres" with neither spelling matching
 * a substring search for the other — the first version of this file missed the
 * exact artefact it was written for, for that reason.
 */
function canon(word: string): string {
  return word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

interface Token {
  word: string;
  start: number;
  end: number;
}

/** Every run of letters or digits, with where it sits in the original text. */
function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    tokens.push({ word: canon(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Words, for the length and repetition measures. */
function words(text: string): string[] {
  return tokenise(text).map((t) => t.word);
}

/** An artefact phrase reduced to the words it is matched by. */
function phraseWords(phrase: string): string[] {
  return phrase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Where each artefact phrase occurs, as a half-open range of token indices. */
function findArtefacts(tokens: Token[]): Array<{ phrase: string; from: number; to: number }> {
  const hits: Array<{ phrase: string; from: number; to: number }> = [];
  for (const phrase of TRANSCRIPTION_ARTEFACTS) {
    const needle = phraseWords(phrase);
    if (needle.length === 0) continue;
    for (let i = 0; i + needle.length <= tokens.length; i += 1) {
      let match = true;
      for (let j = 0; j < needle.length; j += 1) {
        if (tokens[i + j].word !== needle[j]) {
          match = false;
          break;
        }
      }
      if (match) hits.push({ phrase, from: i, to: i + needle.length });
    }
  }
  return hits;
}

/**
 * How much of the text is repetition of something already said.
 *
 * Whisper's other failure mode is a loop: it re-emits the same clause until the
 * audio runs out. "Est-ce qu'il y a des problèmes dans la salle, ou est-ce
 * qu'il y a des problèmes dans la salle en général" is one, and a citizen
 * describing symptoms does not talk like that. Measured over three-word windows,
 * which catches a repeated clause without firing on the ordinary repetition of
 * single words like "de" or "la".
 *
 * Returns 0 for text too short to judge, so a brief answer is never penalised.
 */
export function repetitionRatio(text: string): number {
  const w = words(text);
  if (w.length < 9) return 0;
  const windows: string[] = [];
  for (let i = 0; i + 3 <= w.length; i += 1) windows.push(w.slice(i, i + 3).join(" "));
  return 1 - new Set(windows).size / windows.length;
}

/**
 * One long sentence, said again and again, and nothing else.
 *
 * A farmer asked about his field and was shown, as his own words:
 *
 *   "Les enfants de la République démocratique du Congo ont besoin d'un
 *    soutien médical et d'un soutien sanitaire." — four times, verbatim.
 *
 * repetitionRatio caught it and capped the confidence, which was right but not
 * enough: the text still went to the agents as the citizen's message, and they
 * answered it. There is nothing in there to answer. A decoder that has locked
 * onto one clause and emitted it until the audio ran out has told us only that
 * it could not hear.
 *
 * The rule is narrow on purpose. A long sentence — eight words or more —
 * repeated word for word three times or more, with nothing else in the
 * transcript. Somebody genuinely repeating themselves says short things
 * ("aidez-moi, aidez-moi"), varies the wording, or says something else as
 * well, and all three keep them out of this.
 */
function isDecoderLoop(text: string): boolean {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (sentences.length < 3) return false;
  const distinct = new Set(sentences.map((t) => words(t).join(" ")));
  if (distinct.size !== 1) return false;
  return words(sentences[0]).length >= 8;
}

/** What the transcript turned out to be. */
export type TranscriptVerdict = "usable" | "artefact" | "repetitive";

export interface TranscriptAssessment {
  verdict: TranscriptVerdict;
  /** The artefact phrases found, for the audit record. */
  artefacts: string[];
  /** Repetition measured over three-word windows. */
  repetition: number;
  /** The text with artefact phrases removed; empty when nothing else remained. */
  cleaned: string;
}

/**
 * Words that can remain after the artefacts are removed and still mean nothing.
 *
 * Whisper pads a caption credit with a channel name or a number — "ST' 501" —
 * and what is left once the credit is stripped is that padding. Requiring real
 * words, not merely characters, keeps a stray digit from passing as a question.
 */
const MIN_MEANINGFUL_WORDS = 3;

/**
 * Words that carry nothing on their own.
 *
 * Counted out before deciding whether anything survived the artefacts, because
 * what a caption credit leaves behind is exactly this: "Abonnez-vous à la
 * chaîne" minus its artefact is "à la chaîne", three words and no message.
 * Without this the leftovers of a credit pass as a citizen's question.
 */
const FILLER: ReadonlySet<string> = new Set([
  "a", "au", "aux", "ce", "ces", "cet", "cette", "d", "de", "des", "du", "en", "et", "eux", "ici", "il", "ils",
  "j", "je", "l", "la", "le", "les", "leur", "lui", "m", "ma", "mais", "me", "mes", "moi", "mon", "n", "ne",
  "nos", "notre", "nous", "on", "ou", "par", "pas", "pour", "qu", "que", "qui", "s", "sa", "se", "ses", "son",
  "sur", "t", "ta", "te", "tes", "toi", "ton", "tous", "tout", "tu", "un", "une", "vos", "votre", "vous", "y",
  "the", "and", "to", "of", "in", "for", "on", "this", "that", "it", "is", "are", "my", "your", "you", "we",
  "chaine", "video", "communaute", "org", "com", "www",
]);

/** Words that would still mean something if the rest were removed. */
function meaningfulWords(text: string): string[] {
  return words(text).filter((w) => !FILLER.has(w) && !/^\d+$/.test(w));
}

/**
 * Decide whether a transcript is the citizen speaking.
 *
 * Deliberately conservative about `artefact`: a real message that happens to
 * contain a polite "merci pour votre attention" keeps everything else it said,
 * and is only rejected when the artefacts were all there was. Getting this wrong
 * in the other direction would discard a genuine description of symptoms, which
 * is far worse than one unnecessary request to repeat.
 */
export function assessTranscript(text: string): TranscriptAssessment {
  const tokens = tokenise(text);
  const hits = findArtefacts(tokens);
  const artefacts = [...new Set(hits.map((h) => h.phrase))];

  // Cut the matched ranges out of the original, back to front so the earlier
  // offsets stay valid, which keeps the citizen's own accents and punctuation.
  const removed = new Set<number>();
  for (const hit of hits) for (let i = hit.from; i < hit.to; i += 1) removed.add(i);
  let cleaned = text;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (removed.has(i)) cleaned = cleaned.slice(0, tokens[i].start) + " " + cleaned.slice(tokens[i].end);
  }
  /**
   * Tidy only where something was cut.
   *
   * French puts a space before ? ! : and ;, so a blanket punctuation clean-up
   * rewrites sentences this function never touched — it turned "comment la
   * rattraper ?" into "comment la rattraper?" in a citizen's own question. When
   * nothing was removed, nothing is changed.
   */
  cleaned = cleaned.replace(/[♪♫]/g, " ");
  if (hits.length > 0) {
    cleaned = cleaned
      .replace(/\s+([,.])/g, "$1")
      .replace(/[[\](){}]/g, " ")
      .replace(/^[\s,.;:!?'"«»\-]+/, "");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const repetition = repetitionRatio(text);
  // One sentence looped is not a short message; it is no message.
  if (isDecoderLoop(text)) return { verdict: "artefact", artefacts, repetition, cleaned: "" };
  if (artefacts.length > 0 && meaningfulWords(cleaned).length < MIN_MEANINGFUL_WORDS) {
    return { verdict: "artefact", artefacts, repetition, cleaned: "" };
  }
  /**
   * Text with no artefact in it and no real words either — the musical notes
   * Whisper emits for music, or a lone token like "501" left by a credit whose
   * wording is not in the list above. Nothing here is a question.
   */
  if (words(text).length === 0) return { verdict: "artefact", artefacts, repetition, cleaned: "" };
  // A transcript that is two thirds repetition of the same clause is a loop, not
  // a person. Kept rather than discarded — it usually contains the real clause
  // once — but marked so confidence is capped and no number in it is read back.
  if (repetition >= 0.65) return { verdict: "repetitive", artefacts, repetition, cleaned };
  return { verdict: "usable", artefacts, repetition, cleaned };
}
