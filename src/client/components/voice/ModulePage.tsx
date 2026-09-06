import type { ReactNode } from "react";
import type { ModuleType } from "@shared/types";
import { VoiceConsole } from "./VoiceConsole";

export function ModulePage({ module, accent, title, subtitle, examples, icon, tips, aside }: { module: ModuleType; accent: "health" | "agri" | "edu"; title: string; subtitle: string; examples: string[]; icon: ReactNode; tips: string[]; aside?: ReactNode }) {
  const tile = { health: "bg-health-soft text-health", agri: "bg-agri-soft text-agri", edu: "bg-edu-soft text-edu" }[accent];
  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="mb-5 flex items-start gap-4">
        <span className={`icon-tile h-14 w-14 rounded-2xl ${tile}`}>{icon}</span>
        <div>
          <h1 className="text-[22px] font-bold text-ink">{title}</h1>
          <p className="mt-1 max-w-[720px] text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <VoiceConsole module={module} accent={accent} examples={examples} />
        <div className="space-y-4">
          {aside}
          <section className="card p-5">
            <h2 className="section-title">Conseils</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
              {tips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-brand" />
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
