import Link from "next/link";
import type { Finding, OperatingBrief as Brief } from "@server/ai/os/brief";
import { Panel } from "./Common";
import { IconAlert, IconShield, IconChart } from "@client/components/icons";

/**
 * The brief, at the top of a supervisor's screen.
 *
 * The ordering is the design: most severe first, because this is read from the
 * top and often only from the top. Each finding carries its owner, its deadline
 * and how well the data supports it, so the reader can decide whether to act now
 * or to look closer — which is the decision a bare number never helps with.
 *
 * The "clear" list matters as much as the findings. A panel that shows only
 * problems is indistinguishable from a panel whose checks silently failed to
 * run, and that ambiguity is how a quiet dashboard becomes a false reassurance.
 */

const SEVERITY: Record<Finding["severity"], { tag: string; label: string }> = {
  critical: { tag: "tag tag-danger", label: "Critique" },
  warning: { tag: "tag tag-warn", label: "À surveiller" },
  info: { tag: "tag tag-muted", label: "Information" },
};

const CONFIDENCE_FR: Record<Finding["confidence"], string> = {
  high: "Confiance élevée",
  medium: "Confiance moyenne",
  low: "Confiance faible",
};

const OWNER_FR: Record<string, string> = {
  citizen: "Citoyen",
  chw: "Agent de santé",
  agri_officer: "Agent agricole",
  teacher: "Enseignant",
  ngo: "Partenaire",
  gov_admin: "Administration",
  platform_admin: "Administrateur plateforme",
};

export function OperatingBrief({ brief }: { brief: Brief }) {
  const { findings, counts, clear } = brief;

  return (
    <Panel
      title="Ce qui demande une décision aujourd'hui"
      hint={
        counts.critical > 0
          ? `${counts.critical} point(s) critique(s), ${counts.warning} à surveiller.`
          : counts.warning > 0
            ? `${counts.warning} point(s) à surveiller. Rien de critique.`
            : "Rien ne demande de décision. Les contrôles ci-dessous sont passés."
      }
    >
      {findings.length === 0 ? (
        <div className="px-5 py-5">
          <p className="flex items-center gap-2 text-[14px] font-medium text-ok">
            <IconShield size={18} /> Aucun point bloquant.
          </p>
          <ul className="mt-3 space-y-1.5">
            {clear.map((c) => (
              <li key={c} className="text-[13px] text-muted">
                · {c}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {findings.map((f) => (
            <li key={f.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={SEVERITY[f.severity].tag}>{SEVERITY[f.severity].label}</span>
                <span className="text-[15px] font-semibold text-ink">{f.situation}</span>
              </div>

              <dl className="mt-2.5 space-y-2 text-[13.5px] leading-relaxed">
                <div>
                  <dt className="inline font-semibold text-ink-2">Ce que cela signifie. </dt>
                  <dd className="inline text-ink-2">{f.insight}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-danger">Risque. </dt>
                  <dd className="inline text-ink-2">{f.risk}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-ink-2">Recommandation. </dt>
                  <dd className="inline text-ink-2">{f.recommendation}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
                <span>
                  <span className="font-semibold text-ink-2">Responsable :</span> {OWNER_FR[f.owner] ?? f.owner}
                </span>
                <span>
                  <span className="font-semibold text-ink-2">Échéance :</span> {f.deadline ?? "Immédiat"}
                </span>
                <span title="Indique la solidité des données, pas la force de l'avis.">{CONFIDENCE_FR[f.confidence]}</span>
              </div>

              <div className="mt-3">
                {f.href ? (
                  <Link href={f.href} className="btn btn-primary px-3 py-1.5 text-[13px]">
                    {f.nextAction}
                  </Link>
                ) : (
                  <p className="text-[13px] font-medium text-ink">{f.nextAction}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {findings.length > 0 && clear.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
            <IconChart size={13} /> Contrôles passés
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {clear.map((c) => (
              <li key={c} className="text-[12.5px] text-muted">
                · {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** A compact header strip, for pages where the full brief would crowd the page. */
export function BriefSummary({ brief }: { brief: Brief }) {
  const { counts } = brief;
  if (counts.critical === 0 && counts.warning === 0) return null;
  return (
    <Link
      href="/tableau-de-bord"
      className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-2.5 text-[13.5px] text-danger hover:opacity-90"
    >
      <IconAlert size={16} />
      <span className="font-medium">
        {counts.critical > 0
          ? `${counts.critical} point(s) critique(s) demandent une décision`
          : `${counts.warning} point(s) à surveiller`}
      </span>
    </Link>
  );
}
