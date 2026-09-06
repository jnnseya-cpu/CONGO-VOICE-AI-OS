import { redirect } from "next/navigation";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { AccessNotice } from "@client/components/dashboard/Common";
import { ModuleDashboard } from "@client/components/dashboard/ModuleDashboard";

export const metadata = { title: "Tableau de bord Éducation" };
export const dynamic = "force-dynamic";

export default async function EduDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/tableau-de-bord/education");
  if (!hasPermission(session.role, "dashboard:edu"))
    return <AccessNotice title="Tableau de bord Éducation" hint="Cet écran est réservé aux enseignants, aux ONG partenaires et aux administrations de l’éducation." />;
  return <ModuleDashboard module="education" />;
}
