# Languages: coverage, learning loop and review

| Code | Language | UI strings | Voice in (STT) | Voice out (TTS) | Understanding / translation |
|------|----------|-----------|----------------|-----------------|-----------------------------|
| fr   | Français (fr-CD) | reference | OpenAI Whisper-family → Gemini | Google TTS (fr-FR) → OpenAI TTS → device | Claude → Gemini → OpenAI |
| ln   | Lingala | translated, to validate | Whisper (weak) → Gemini audio | OpenAI TTS (best effort) → device | Claude → Gemini → OpenAI, with verified examples + lexicon |
| kg   | Kikongo / Kituba | translated, to validate | Gemini audio | OpenAI TTS → device | same, corpus-driven |
| sw   | Swahili (sw-CD) | translated, to validate | Whisper → Gemini | Google TTS (sw-KE) → OpenAI → device | same |
| lua  | Tshiluba | translated, to validate | Gemini audio | OpenAI TTS → device | same, corpus-driven |

## How the platform learns each language
1. Every conversation is captured as a corpus sample: what was heard, the French meaning, the audio, province, intent, module and the system's confidence (`language_corpus`).
2. Citizens can flag "the system did not understand me" and rate the spoken answer (1–5).
3. Native-speaking officers review the queue in **Langues & Apprentissage**: verify, correct (transcript, meaning, language) or reject, and add lexicon entries with pronunciation hints (`language_lexicon`).
4. Verified samples and lexicon entries are retrieved for every new message and injected into the Language Agent prompt (in-context learning), so understanding and localisation improve immediately, without retraining.
5. Verified audio/transcript pairs are exportable as JSONL datasets (`GET /api/v1/language/export`) to fine-tune speech models (Whisper/MMS-class) and TTS voices — this is the path to native-level listening and speaking.
6. Proficiency is measured continuously per language (listening, understanding, speaking, level) from verification, correction and citizen ratings (`GET /api/v1/language/proficiency`).

## Quality gates before a language goes live in a module
WER ≤ 20 % clean / ≤ 30 % field audio, intent accuracy ≥ 90 % (health) / ≥ 85 % (agri, edu), emergency recall ≥ 98 %, TTS intelligibility MOS ≥ 3.8, language ID ≥ 95 %. A language below the gate is served in scripted/DTMF-guided mode.

## Native-speaker review of UI strings
`src/shared/i18n/index.ts` holds the UI dictionary. Lingala, Kikongo, Swahili and Tshiluba strings were drafted for the MVP and must be reviewed by the linguists on retainer (two per language) before pilot launch; corrections are plain edits to that file.
