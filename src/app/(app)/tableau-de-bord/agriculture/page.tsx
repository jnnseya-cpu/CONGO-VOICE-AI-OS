import { redirect } from "next/navigation";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { AccessNotice } from "@client/components/dashboard/Common";
import { ModuleDashboard } from "@client/components/dashboard/ModuleDashboard";

export const metadata = { title: "Tableau de bord Agriculture" };
export const dynamic = "force-dynamic";

export default async function AgriDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/tableau-de-bord/agriculture");
  if (!hasPermission(session.role, "dashboard:agri"))
    return <AccessNotice title="Tableau de bord Agriculture" hint="Cet écran est réservé aux agents agricoles, aux ONG partenaires et aux administrations agricoles." />;
  return <ModuleDashboard module="agriculture" />;
}
