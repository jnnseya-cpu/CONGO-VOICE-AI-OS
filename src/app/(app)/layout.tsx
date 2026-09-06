import { AppShell } from "@client/components/shell/AppShell";
import type { SessionUser } from "@shared/types";
import { getSession } from "@server/core/auth";
import { unreadNotificationCount } from "@server/core/unread";
import { systemOk } from "@server/core/status";

/** Chrome for the operating system itself: sidebar, top bar, notifications. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user: SessionUser | null = session
    ? { id: session.userId, name: session.name ?? null, role: session.role, language: session.language, province: session.province ?? null, anonymous: session.anonymous }
    : null;
  const unread = session ? await unreadNotificationCount(session.userId) : 0;
  const healthy = await systemOk();
  return (
    <AppShell user={user} unread={unread} healthy={healthy}>
      <div id="contenu">{children}</div>
    </AppShell>
  );
}
