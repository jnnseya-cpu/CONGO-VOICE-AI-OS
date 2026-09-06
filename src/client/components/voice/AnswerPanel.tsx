"use client";
import { useState } from "react";
import type { InteractionResult } from "@shared/types";
import { useLanguage } from "../shell/LanguageProvider";
import { IconCheck, IconPhone, IconStop, IconThumbDown, IconThumbUp, IconVolume } from "../icons";

const RISK_CLS = { low: "tag-health", medium: "tag-warn", high: "tag-danger", critical: "tag-danger" } as const;

export function AnswerPanel({ result, speaking, onSpeak, onStop, onFollowUp, onFeedback }: { result: InteractionResult; speaking: boolean; onSpeak: () => void; onStop: () => void; onFollowUp: (q: string) => void; onFeedback: (body: Record<string, unknown>) => void }) {
  const { t } = useLanguage();
  const [sent, setSent] = useState(false);
  const a = result.answerLocalised;
  const critical = a.risk.level === "critical";
  return (
    <div className={`card overflow-hidden ${critical ? "border-danger/40" : ""}`}>
      {critical && (
        <div className="flex items-center gap-2 bg-danger px-4 py-2 text-[13px] font-semibold text-white">
          <IconPhone size={16} /> {t("risk_critical")} — {a.escalation.to ? `${t("escalation")} : ${a.escalation.to}` : ""}
        </div>
      )}
      <div className="space-y-4 p-4 sm:p-5">
        {result.status === "failed" ? (
          <p className="text-[14px] text-ink">{result.responseText}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("youSaid")} value={result.transcript || a.asking} />
              <Field label={t("weUnderstood")} value={a.understanding} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{t("action")}</span>
                <button type="button" onClick={speaking ? onStop : onSpeak} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${speaking ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}>
                  {speaking ? <IconStop size={14} /> : <IconVolume size={14} />} {speaking ? t("stopListening") : t("listen")}
                </button>
              </div>
              <p className="text-[15px] leading-relaxed text-ink">{a.action}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`tag ${RISK_CLS[a.risk.level]}`}>
                {t("risk")} : {t(`risk_${a.risk.level}` as const)}
              </span>
              <span className={`tag ${a.escalation.required ? "tag-case" : "tag-muted"}`}>{a.escalation.required ? t("escalated") : t("notEscalated")}</span>
              <span className={`tag ${a.confidence.low ? "tag-warn" : "tag-muted"}`}>
                {t("confidence")} {Math.round(a.confidence.score * 100)}%
              </span>
              {result.caseId && <span className="tag tag-case">Cas #{result.caseId.slice(0, 8)}</span>}
            </div>
            {a.confidence.low && <p className="text-[12.5px] text-warn">{t("lowConfidence")}</p>}
            {result.followUpQuestions.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">{t("followUp")}</div>
                <div className="flex flex-wrap gap-2">
                  {result.followUpQuestions.map((q) => (
                    <button key={q} type="button" onClick={() => onFollowUp(q)} className="chip border-line bg-surface-2 text-ink-2 hover:bg-brand-soft hover:text-brand">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="hairline flex flex-wrap items-center gap-2 pt-3 text-[12.5px] text-muted">
              {sent ? (
                <span className="inline-flex items-center gap-1 text-ok">
                  <IconCheck size={14} /> {t("thanks")}
                </span>
              ) : (
                <>
                  <span>{t("wasUseful")}</span>
                  <button type="button" onClick={() => { onFeedback({ useful: true, rating: 5, speechRating: 4 }); setSent(true); }} className="inline-flex items-center gap-1 rounded-full bg-health-soft px-2.5 py-1 font-semibold text-health"><IconThumbUp size={14} /> {t("yes")}</button>
                  <button type="button" onClick={() => { onFeedback({ useful: false, rating: 2 }); setSent(true); }} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-ink-2"><IconThumbDown size={14} /> {t("no")}</button>
                  <button type="button" onClick={() => { onFeedback({ useful: false, misunderstood: true }); setSent(true); }} className="rounded-full bg-warn-soft px-2.5 py-1 font-semibold text-warn">{t("notUnderstood")}</button>
                </>
              )}
              <span className="ml-auto text-[11px] text-muted-2">{t("summarySaved")} · {result.latencyMs} ms</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[13.5px] text-ink">{value}</div>
    </div>
  );
}
