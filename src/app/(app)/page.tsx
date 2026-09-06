import fs from "node:fs";
import path from "node:path";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { commandStats, importantAlerts, insightOfTheDay, recentActivity } from "@server/ai/agents/reporting";
import { Hero } from "@client/components/home/Hero";
import { ModuleCards } from "@client/components/home/ModuleCards";
import { LiveActivity } from "@client/components/home/LiveActivity";
import { Alerts } from "@client/components/home/Alerts";
import { QuickActions } from "@client/components/home/QuickActions";
import { RecentActivity, type ActivityItem } from "@client/components/home/RecentActivity";
import { Insight } from "@client/components/home/Insight";
import { HowItWorks } from "@client/components/home/HowItWorks";
import { Footer } from "@client/components/home/Footer";
import { PublicBand } from "@client/components/home/PublicBand";

export const dynamic = "force-dynamic";

/** Server render time, passed to client components so relative times hydrate identically. */
function serverNow(): number {
  return Date.now();
}

const WHO: Record<string, string> = { health: "un utilisateur", agriculture: "un agriculteur", education: "un élève", general: "un citoyen" };
const PREFIX: Record<string, string> = { health: "Consultation santé", agriculture: "Question agricole", education: "Session d'apprentissage", general: "Demande" };

function activityTitle(a: { module: string; channel: string; understanding: string | null; summary: string | null; intent: string | null; escalated: boolean }): string {
  const body = (a.understanding ?? a.summary ?? a.intent ?? "").replace(/^\[[^\]]+\]\s*/, "").replace(/^(La personne signale|Le producteur décrit|L'apprenant demande|Demande générale)\s*:\s*/i, "").trim();
  const short = body.length > 70 ? body.slice(0, 67).replace(/\s+\S*$/, "") + "…" : body;
  if (a.escalated) return `Cas escaladé : ${short}`;
  if (a.channel === "image") return `Photo reçue : ${short}`;
  return `${PREFIX[a.module] ?? "Demande"} : ${short}`;
}

export default async function HomePage() {
  const session = await getSession();
  const institutional = !!session && hasPermission(session.role, "case:read");
  const now = serverNow();
  const photo = fs.existsSync(path.join(process.cwd(), "public", "hero", "congo-river.jpg"));

  const [stats, activity, alerts, insight] = await Promise.all([
    commandStats().catch(() => null),
    recentActivity(5).catch(() => []),
    institutional ? importantAlerts(4).catch(() => []) : Promise.resolve([]),
    institutional ? insightOfTheDay().catch(() => null) : Promise.resolve(null),
  ]);

  const live = {
    activeUsersToday: stats?.activeUsersToday ?? { value: 0, deltaPct: null },
    voiceInteractionsToday: stats?.voiceInteractionsToday ?? { value: 0, deltaPct: null },
    casesNeedingFollowUp: stats?.casesNeedingFollowUp ?? { value: 0, deltaPct: null },
    criticalAlerts: stats?.criticalAlerts ?? { value: 0, deltaPct: null },
  };
  const modules = {
    health: { today: stats?.modules.health.today ?? 0, urgent: stats?.modules.health.urgent ?? 0 },
    agriculture: { today: stats?.modules.agriculture.today ?? 0, alerts: stats?.modules.agriculture.alerts ?? 0 },
    education: { today: stats?.modules.education.today ?? 0, topics: stats?.modules.education.topics ?? 0 },
  };
  const items: ActivityItem[] = activity.map((a) => ({
    id: a.id,
    module: a.module,
    channel: a.channel,
    title: activityTitle(a),
    who: a.escalated ? "un agent de santé" : WHO[a.module] ?? "un citoyen",
    province: a.province,
    escalated: a.escalated,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-4">
          <Hero photo={photo} />
          <ModuleCards stats={modules} />
          {!session && <PublicBand />}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <RecentActivity items={items} now={now} href={institutional ? "/tableau-de-bord#activite" : "/historique"} />
            {institutional && insight ? <Insight insight={insight} /> : <HowItWorks />}
          </div>
        </div>
        <div className="space-y-4">
          <LiveActivity stats={live} canOpenDashboard={institutional} />
          {institutional ? <Alerts alerts={alerts.map((a) => ({ ...a, at: a.at.toISOString() }))} now={now} /> : null}
          <QuickActions />
        </div>
      </div>
      <Footer year={new Date(now).getUTCFullYear()} />
    </div>
  );
}
