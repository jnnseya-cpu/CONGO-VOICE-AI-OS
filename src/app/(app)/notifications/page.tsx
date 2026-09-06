import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, isNull, or } from "drizzle-orm";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { getDb, schema } from "@server/db/client";
import { PageHeader } from "@client/components/ui";
import { NotificationList, type NotificationItem } from "@client/components/notifications/NotificationList";
import { Panel, StatTile, fmt } from "@client/components/dashboard/Common";
import { IconBell, IconCheck, IconUsers } from "@client/components/icons";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/notifications");

  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(or(eq(schema.notifications.userId, session.userId), isNull(schema.notifications.userId)))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(100);

  const items: NotificationItem[] = rows
    .map((n) => ({
      id: n.id,
      type: n.type,
      channel: n.channel,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      read: !!n.readAt,
      mine: n.userId === session.userId,
      caseId: typeof n.payload?.caseId === "string" ? (n.payload.caseId as string) : null,
    }))
    .sort((a, b) => Number(a.read) - Number(b.read) || (a.createdAt < b.createdAt ? 1 : -1));

  const unread = items.filter((i) => !i.read).length;
  const queue = items.filter((i) => !i.mine).length;
  const canBroadcast = hasPermission(session.role, "notification:broadcast");

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Vos messages et la file commune de votre équipe : escalades, rappels, suivis et diffusions."
        actions={
          canBroadcast ? (
            <Link href="/notifications/envoyer" className="btn btn-primary">
              Diffuser un message
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Non lues" value={fmt(unread)} hint="Messages en attente de lecture." icon={<IconBell size={16} />} tone={unread > 0 ? "warn" : "muted"} />
        <StatTile label="File commune" value={fmt(queue)} hint="Messages adressés à toute l'équipe." icon={<IconUsers size={16} />} tone="brand" />
        <StatTile label="Total reçus" value={fmt(items.length)} hint="Cent derniers messages." icon={<IconCheck size={16} />} tone="health" />
      </div>

      <Panel>
        <NotificationList items={items} />
      </Panel>
    </div>
  );
}
