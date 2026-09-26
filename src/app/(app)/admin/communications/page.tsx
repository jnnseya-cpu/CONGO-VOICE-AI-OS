import { redirect } from "next/navigation";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import {
  AUDIENCE_FR,
  CATEGORIES,
  CHANNEL_FR,
  EVENTS,
  channelCoverage,
  eventsInCategory,
  mandatoryEvents,
  type EventSeverity,
} from "@server/notify/catalogue";
import { channelActivity, eventActivity, recentDeliveries } from "@server/notify/emit";
import { PageHeader } from "@client/components/ui";
import { AccessNotice, BarList, Panel, SHARE_COLORS, ShareBar, StatTile, TableShell, Td, Th, dateTimeFr, fmt } from "@client/components/dashboard/Common";
import { IconAlert, IconChart, IconShield, IconMic } from "@client/components/icons";

export const metadata = { title: "Communications" };
export const dynamic = "force-dynamic";

const SEVERITY_FR: Record<EventSeverity, string> = {
  info: "Information",
  success: "Confirmation",
  warning: "Avertissement",
  critical: "Critique",
};

const SEVERITY_TAG: Record<EventSeverity, string> = {
  info: "tag tag-muted",
  success: "tag tag-ok",
  warning: "tag tag-warn",
  critical: "tag tag-danger",
};

export default async function CommunicationsPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/admin/communications");
  if (!hasPermission(session.role, "dashboard:admin")) {
    return (
      <AccessNotice
        title="Architecture des communications"
        hint="Le catalogue des notifications est réservé aux administrateurs de la plateforme."
      />
    );
  }

  const [coverage, activity, byChannel, deliveries] = await Promise.all([
    Promise.resolve(channelCoverage()),
    eventActivity(),
    channelActivity(),
    recentDeliveries(24),
  ]);

  const mandatory = mandatoryEvents();
  const everFired = [...activity.values()].reduce((s, a) => s + a.sent, 0);
  const failed = [...activity.values()].reduce((s, a) => s + a.failed, 0);
  const wired = byChannel.filter((c) => c.sent > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Architecture des communications"
        subtitle={`Un catalogue unique : ${EVENTS.length} notices réparties sur ${CATEGORIES.length} catégories, diffusées sur ${coverage.length} canaux.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Notices au catalogue" value={fmt(EVENTS.length)} hint={`${CATEGORIES.length} catégories`} tone="brand" icon={<IconChart size={18} />} />
        <StatTile
          label="Notices obligatoires"
          value={fmt(mandatory.length)}
          hint="ignorent les préférences et les heures calmes"
          tone="danger"
          icon={<IconShield size={18} />}
        />
        <StatTile label="Messages partis" value={fmt(everFired)} hint={failed > 0 ? `${fmt(failed)} en échec` : "aucun échec"} tone={failed > 0 ? "warn" : "ok"} icon={<IconMic size={18} />} />
        <StatTile label="Canaux utilisés" value={`${wired} / ${coverage.length}`} hint={coverage.map((c) => c.label).join(" · ")} tone="navy" icon={<IconAlert size={18} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Couverture par canal" hint="Combien de notices du catalogue partent sur chaque canal par défaut.">
          <BarList rows={coverage.map((c) => ({ label: c.label, value: c.events }))} tone="brand" />
        </Panel>
        <Panel title="Messages réellement partis" hint="Le catalogue décrit une intention ; ceci est ce qui est sorti.">
          <ShareBar
            rows={byChannel
              .filter((c) => c.sent > 0)
              .map((c, i) => ({ label: CHANNEL_FR[c.channel], value: c.sent, color: SHARE_COLORS[i % SHARE_COLORS.length] }))}
          />
        </Panel>
      </div>

      <Panel
        title="Notices obligatoires"
        hint="Elles passent outre le refus d'un destinataire, les heures calmes et le plafond de fréquence. Chacune doit dire pourquoi."
      >
        <TableShell head={<tr><Th>Notice</Th><Th>Identifiant</Th><Th>Pourquoi elle ne peut pas être désactivée</Th></tr>} label="Notices obligatoires">
          {mandatory.map((e) => (
            <tr key={e.id}>
              <Td>
                <span className="font-medium text-ink">{e.title}</span>
                <span className="ml-2 tag tag-danger">Obligatoire</span>
              </Td>
              <Td className="whitespace-nowrap font-mono text-[12px] text-muted">{e.id}</Td>
              <Td className="text-[12.5px] text-ink-2">{e.mandatoryBecause}</Td>
            </tr>
          ))}
        </TableShell>
      </Panel>

      <Panel title="Dernières diffusions" hint="Chaque notice, son canal et l'issue de la remise.">
        {deliveries.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">
            Aucune diffusion enregistrée. Le catalogue est prêt ; rien n&apos;a encore été déclenché sur ce déploiement.
          </p>
        ) : (
          <TableShell head={<tr><Th>Notice</Th><Th>Canal</Th><Th>Statut</Th><Th>Quand</Th></tr>} label="Dernières diffusions">
            {deliveries.map((d) => (
              <tr key={d.id}>
                <Td>
                  <span className="text-ink">{d.event?.title ?? d.title}</span>
                  {d.templateKey && <span className="ml-2 font-mono text-[11.5px] text-muted">{d.templateKey}</span>}
                </Td>
                <Td className="whitespace-nowrap">{CHANNEL_FR[d.channel] ?? d.channel}</Td>
                <Td>
                  <span className={d.status === "failed" ? "tag tag-danger" : d.status === "sent" ? "tag tag-ok" : "tag tag-muted"}>
                    {d.status === "failed" ? (d.failureReason ?? "échec") : d.status === "sent" ? "remis" : d.status}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-muted">{dateTimeFr(d.sentAt ?? d.createdAt)}</Td>
              </tr>
            ))}
          </TableShell>
        )}
      </Panel>

      {CATEGORIES.map((category) => {
        const events = eventsInCategory(category.id);
        return (
          <Panel key={category.id} title={`${category.label} — ${events.length} notices`} hint={category.description}>
            <TableShell
              head={<tr><Th>Notice</Th><Th>Destinataire</Th><Th>Gravité</Th><Th>Canaux</Th><Th>Parties</Th></tr>}
              label={category.label}
            >
              {events.map((e) => {
                const stats = activity.get(e.id);
                return (
                  <tr key={e.id}>
                    <Td>
                      <span className="block font-medium text-ink">{e.title}</span>
                      <span className="block font-mono text-[11.5px] text-muted">{e.id}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-2">{e.body}</span>
                      {e.mandatory && <span className="mt-1 inline-block tag tag-danger">Obligatoire</span>}
                    </Td>
                    <Td className="whitespace-nowrap">{AUDIENCE_FR[e.audience]}</Td>
                    <Td className="whitespace-nowrap">
                      <span className={SEVERITY_TAG[e.severity]}>{SEVERITY_FR[e.severity]}</span>
                    </Td>
                    <Td className="text-[12.5px] text-ink-2">{e.channels.map((c) => CHANNEL_FR[c]).join(" · ")}</Td>
                    <Td className="whitespace-nowrap text-muted">
                      {stats ? `${fmt(stats.sent)}${stats.failed ? ` · ${fmt(stats.failed)} en échec` : ""}` : "—"}
                    </Td>
                  </tr>
                );
              })}
            </TableShell>
          </Panel>
        );
      })}
    </div>
  );
}
