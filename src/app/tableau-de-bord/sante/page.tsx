import { redirect } from "next/navigation";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { AccessNotice } from "@client/components/dashboard/Common";
import { ModuleDashboard } from "@client/components/dashboard/ModuleDashboard";

export const metadata = { title: "Tableau de bord Santé" };
export const dynamic = "force-dynamic";

export default async function HealthDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/tableau-de-bord/sante");
  if (!hasPermission(session.role, "dashboard:health"))
    return <AccessNotice title="Tableau de bord Santé" hint="Cet écran est réservé aux agents de santé communautaires, aux ONG partenaires et aux administrations sanitaires." />;
  return <ModuleDashboard module="health" />;
}
