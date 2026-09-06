/**
 * USSD gateway webhook (Africa's Talking format).
 *
 * Unauthenticated by design: the operator posts form-encoded fields and expects
 * "CON …" (keep the session) or "END …" (close it) as text/plain.
 *
 * Two levels (FR-CH-20): module → the five most common questions of that module.
 * The answer itself is far too long for a USSD screen, so it is delivered by SMS in the
 * citizen's language within the 180 s budget (FR-CH-21).
 */
import type { LanguageCode, ModuleType } from "@server/db/schema";
import { localise } from "@server/ai/agents/language";
import { runInBackground } from "@server/channels/background";
import { menuQuestions, questionLabel } from "@server/channels/menus";
import { sendSms } from "@server/channels/sms";
import {
  detectOptOut,
  applyOptOut,
  patchState,
  readState,
  runTurn,
  settleTurn,
  setSessionLanguage,
  setSessionModule,
  startOrResume,
} from "@server/channels/session";
import { LANGUAGE_BY_DIGIT, LANGUAGE_NAMES, MODULE_BY_DIGIT, moduleLabel, t } from "@server/channels/strings";

export const dynamic = "force-dynamic";

/** A USSD session must be finished inside three minutes. */
const USSD_BUDGET_MS = 180_000;

function con(text: string): Response {
  return new Response(`CON ${text}`, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
function end(text: string): Response {
  return new Response(`END ${text}`, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function languageMenuText(): string {
  return `CONGO VOICE\n${Object.entries(LANGUAGE_BY_DIGIT)
    .map(([digit, code]) => `${digit}. ${LANGUAGE_NAMES[code]}`)
    .join("\n")}`;
}

function moduleMenuText(language: LanguageCode): string {
  return `${t("chooseModule", language)}\n${t("moduleMenu", language)}`;
}

function questionMenuText(module: ModuleType, language: LanguageCode): string {
  const list = menuQuestions(module)
    .map((q, i) => `${i + 1}. ${questionLabel(q, language)}`)
    .join("\n");
  return `${moduleLabel(module, language)}\n${list}\n${t("otherQuestion", language)}`;
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  const phoneNumber = form.get("phoneNumber") ?? "";
  const providerSessionId = form.get("sessionId") ?? "";
  const text = (form.get("text") ?? "").trim();
  if (!phoneNumber) return end("Numéro inconnu.");

  const { session, identity } = await startOrResume({ channel: "ussd", kind: "msisdn", identifier: phoneNumber });
  let state = readState(session);
  // The 180 s budget belongs to the operator's USSD session, not to our 24 h one.
  if (state.ussd?.providerSessionId !== providerSessionId) {
    const updated = await patchState(session.id, {
      ussd: {
        startedAt: new Date().toISOString(),
        providerSessionId,
        module: state.ussd?.module,
        // Whether this dial starts with the language menu is decided once, at its first
        // screen: the digit offset of every later screen depends on it.
        askedLanguage: !identity.languageConfirmed,
      },
    });
    state = readState(updated);
  }
  const askedLanguage = state.ussd?.askedLanguage === true;
  let language: LanguageCode | null = askedLanguage ? null : session.language ?? identity.language;

  // Opt-out typed at any level (FR-CH-14).
  if (detectOptOut(text.split("*").pop() ?? "")) {
    const ack = await applyOptOut(session, language ?? "fr");
    return end(ack);
  }

  // 180 s budget.
  const startedAt = state.ussd?.startedAt ? Date.parse(state.ussd.startedAt) : Date.now();
  if (Number.isFinite(startedAt) && Date.now() - startedAt > USSD_BUDGET_MS) {
    return end(t("sessionExpired", language ?? "fr"));
  }

  const parts = text ? text.split("*").filter((p) => p !== "") : [];
  let index = 0;

  // Level 0 (only when this dial started without a known language).
  if (askedLanguage) {
    if (parts.length === 0) return con(languageMenuText());
    const chosen = LANGUAGE_BY_DIGIT[parts[0]];
    if (!chosen) return con(`${t("invalidChoice", "fr")}\n${languageMenuText()}`);
    if (session.language !== chosen) await setSessionLanguage(session, chosen);
    language = chosen;
    index = 1;
  }
  if (!language) language = "fr";

  // Level 1 — module.
  const modulePart = parts[index];
  if (modulePart === undefined) return con(moduleMenuText(language));
  const chosenModule = MODULE_BY_DIGIT[modulePart];
  if (!chosenModule) return con(`${t("invalidChoice", language)}\n${moduleMenuText(language)}`);
  if (session.module !== chosenModule) await setSessionModule(session, chosenModule);

  // Level 2 — the five most common questions.
  const questionPart = parts[index + 1];
  if (questionPart === undefined) return con(questionMenuText(chosenModule, language));

  const questions = menuQuestions(chosenModule);
  if (questionPart === "0") {
    await patchState(session.id, { step: "await_sms_question", lastModule: chosenModule });
    const chosenLanguage = language;
    runInBackground(
      sendSms({
        to: phoneNumber,
        userId: session.userId,
        language: chosenLanguage,
        type: "follow_up",
        text: t("welcomeText", chosenLanguage),
      }),
    );
    return end(t("smsSent", language));
  }

  const question = questions[Number(questionPart) - 1];
  if (!question) return con(`${t("invalidChoice", language)}\n${questionMenuText(chosenModule, language)}`);

  // The answer is produced after the USSD session closes and delivered by SMS.
  const answerLanguage = language;
  runInBackground(
    (async () => {
      const result = await runTurn({
        session: { ...session, language: answerLanguage, module: chosenModule },
        text: question.questionFr,
        moduleHint: chosenModule,
        wantsAudio: false,
        chunk: false,
      });
      await settleTurn(result);
      // The catalogue question is French; the reply must reach the citizen in their language.
      const answerFr = result.fullText || result.text;
      const answerText =
        result.language === answerLanguage ? answerFr : await localise(answerFr, answerLanguage, result.interactionId ?? undefined);
      await sendSms({
        to: phoneNumber,
        userId: session.userId,
        language: answerLanguage,
        type: result.emergency ? "escalation" : "follow_up",
        title: "CONGO VOICE",
        text: answerText,
        payload: { sessionId: session.id, interactionId: result.interactionId, source: "ussd" },
      });
    })(),
  );

  return end(t("smsSent", language));
}
