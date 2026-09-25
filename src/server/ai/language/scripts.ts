/**
 * Fixed scripts, and why they are not generated.
 *
 * A handful of sentences must never depend on a model being reachable: who we
 * are, what to do when someone is dying, what we are not. These are written
 * once, approved once, and spoken from a recording when one exists (FR-LG-08).
 *
 * This is what makes NFR-A-01 achievable. The emergency path has to stay
 * available when every AI provider is down, which means the words are constants
 * and the audio is a file on disk, not a synthesis call that can fail at the
 * only moment it matters.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { LanguageCode } from "@server/db/schema";
import { DISCLAIMERS, EMERGENCY_INSTRUCTIONS, EMERGENCY_MESSAGES } from "../safety";

export type ScriptKey =
  | "identity"
  | "emergency_alert"
  | "emergency_instructions"
  | "disclaimer"
  | "consent"
  | "no_understanding"
  | "human_handover";

/** One female and one male voice per language (FR-LG-07); the module decides which. */
export type VoiceGender = "female" | "male";

/**
 * The identity statement, said once at the start of a session (AI-14). It names
 * the service and what it is not, because a citizen who believes they are
 * speaking to a doctor will act on the answer differently.
 */
const IDENTITY: Record<LanguageCode, string> = {
  fr: "Ici le service vocal CONGO VOICE AI OS. Je ne suis ni médecin, ni agronome, ni enseignant. Je vous oriente et je peux alerter une personne.",
  ln: "Oyo ezali service ya mongongo CONGO VOICE AI OS. Nazali monganga te, agronome te, molakisi te. Nakopesa yo nzela mpe nakoki kobenga moto.",
  kg: "Yayi kele kisalu ya ndinga CONGO VOICE AI OS. Mono kele munganga ve, agronome ve, nlongi ve. Mono ke songa nge nzila mpe ke bokila muntu.",
  sw: "Hii ni huduma ya sauti CONGO VOICE AI OS. Mimi si daktari, si mtaalam wa kilimo, si mwalimu. Ninakuelekeza na ninaweza kumwita mtu.",
  lua: "Eu udi mudimu wa dîyi CONGO VOICE AI OS. Meme tshiena munganga, tshiena mumanyi wa madimi, tshiena mulongeshi. Ndi nkuleja njila ne ndi mua kubikila muntu.",
};

const NO_UNDERSTANDING: Record<LanguageCode, string> = {
  fr: "Je n'ai pas bien compris. Redites-le plus près du téléphone, ou demandez à parler à une personne.",
  ln: "Nayoki malamu te. Loba lisusu pene ya telefone, to senga kosolola na moto.",
  kg: "Mono wa ve mbote. Tuba diaka pene-pene ya telefone, to lomba kusolula ti muntu.",
  sw: "Sikuelewa vizuri. Sema tena karibu na simu, au omba kuzungumza na mtu.",
  lua: "Tshivua mumvue bimpe. Amba kabidi pabuipi ne telefone, anyi lomba kuakula ne muntu.",
};

const HUMAN_HANDOVER: Record<LanguageCode, string> = {
  fr: "Je transmets votre demande à une personne. Elle vous rappellera.",
  ln: "Nazali kotinda likambo na yo epai ya moto. Akobenga yo.",
  kg: "Mono ke tinda diambu na nge na muntu. Yandi ta bokila nge.",
  sw: "Ninapeleka ombi lako kwa mtu. Atakupigia simu.",
  lua: "Ndi ntuma lukonko luebe kudi muntu. Neakubikile.",
};

const CONSENT: Record<LanguageCode, string> = {
  fr: "Vos réponses sont enregistrées pour vous aider et pour alerter un agent si nécessaire. Acceptez-vous ? Dites oui ou non.",
  ln: "Biyano na yo ekobombama mpo na kosalisa yo mpe kobenga moto soki esengeli. Ondimi? Loba ee to te.",
  kg: "Mvutu na nge ke bumbana sambu na kusadisa nge mpe kubokila muntu kana yo mfunu. Nge ndima? Tuba ee to ve.",
  sw: "Majibu yako yanahifadhiwa ili kukusaidia na kumwita mhudumu ikihitajika. Unakubali? Sema ndiyo au hapana.",
  lua: "Mandamuna ebe adi alama bua kukuambuluisha ne kubikila muntu bikala bikengela. Udi witaba? Amba eyowa anyi tò.",
};

/** The approved wording for every fixed script, in every platform language. */
export const FIXED_SCRIPTS: Record<ScriptKey, Record<LanguageCode, string>> = {
  identity: IDENTITY,
  emergency_alert: EMERGENCY_MESSAGES,
  emergency_instructions: EMERGENCY_INSTRUCTIONS,
  disclaimer: DISCLAIMERS,
  consent: CONSENT,
  no_understanding: NO_UNDERSTANDING,
  human_handover: HUMAN_HANDOVER,
};

export function scriptText(key: ScriptKey, language: LanguageCode): string {
  return FIXED_SCRIPTS[key][language] ?? FIXED_SCRIPTS[key].fr;
}

/**
 * Where a recording lives once the language panel has produced it:
 * `public/audio/scripts/<language>/<key>.<voice>.mp3`, served at the same path.
 * Nothing breaks while the directory is empty; the platform speaks the same
 * words through text-to-speech instead.
 */
export function scriptAudioPath(key: ScriptKey, language: LanguageCode, voice: VoiceGender = "female"): string {
  return `/audio/scripts/${language}/${key}.${voice}.mp3`;
}

function publicFile(webPath: string): string {
  return path.resolve(process.cwd(), "public", webPath.replace(/^\//, ""));
}

/** True when a human-recorded take of this script has been published. */
export function hasRecordedScript(key: ScriptKey, language: LanguageCode, voice: VoiceGender = "female"): boolean {
  try {
    return fs.statSync(publicFile(scriptAudioPath(key, language, voice))).size > 0;
  } catch {
    return false;
  }
}

export interface ScriptDelivery {
  key: ScriptKey;
  language: LanguageCode;
  text: string;
  /** Set when a recording exists; the channel plays this instead of synthesising. */
  audioUrl: string | null;
  source: "recorded" | "synthesis_required";
}

/**
 * Resolves a fixed script to what the channel should actually deliver. The text
 * is always returned, so a channel with no audio at all still says the right
 * thing, and the emergency path never depends on a provider being up.
 */
export function deliverScript(key: ScriptKey, language: LanguageCode, voice: VoiceGender = "female"): ScriptDelivery {
  const recorded = hasRecordedScript(key, language, voice);
  return {
    key,
    language,
    text: scriptText(key, language),
    audioUrl: recorded ? scriptAudioPath(key, language, voice) : null,
    source: recorded ? "recorded" : "synthesis_required",
  };
}

/**
 * Which recordings are still missing. Surfaced in the administration console so
 * the gap is visible rather than discovered during an emergency call.
 */
export function missingRecordings(voice: VoiceGender = "female"): Array<{ key: ScriptKey; language: LanguageCode }> {
  const languages: LanguageCode[] = ["fr", "ln", "kg", "sw", "lua"];
  const out: Array<{ key: ScriptKey; language: LanguageCode }> = [];
  for (const key of Object.keys(FIXED_SCRIPTS) as ScriptKey[]) {
    for (const language of languages) if (!hasRecordedScript(key, language, voice)) out.push({ key, language });
  }
  return out;
}
