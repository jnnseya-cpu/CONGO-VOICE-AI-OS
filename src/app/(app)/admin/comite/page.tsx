import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@server/core/auth";
import { hasPermission } from "@server/core/rbac";
import { PageHeader } from "@client/components/ui";
import { AccessNotice, Notice } from "@client/components/dashboard/Common";
import { ReviewBoardConsole } from "@client/components/admin/ReviewBoardConsole";
import { composition } from "@server/ai/review/board";
import { approvalSummary } from "@server/ai/review/gate";
import { deploymentStage } from "@server/core/status";

export const metadata = { title: "Comité de revue" };
export const dynamic = "force-dynamic";

export default async function ReviewBoardPage() {
  const session = await getSession();
  if (!session) redirect("/connexion?next=/admin/comite");
  if (!hasPermission(session.role, "review:read"))
    return <AccessNotice title="Comité de revue" hint="Cet espace est réservé aux membres des comités de revue et aux administrations qui les nomment." />;

  const crb = await composition("crb");
  const summary = await approvalSummary("health");
  const serving = ["pilot", "prod"].includes(deploymentStage());

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title="Comités de revue"
        subtitle="Aucun contenu clinique n'est utilisé pour évaluer la situation d'un citoyen sans la signature du comité compétent."
        actions={
          <Link href="/admin" className="btn btn-ghost">
            Administration
          </Link>
        }
      />

      {!crb?.constituted && (
        <Notice tone={serving ? "danger" : "warn"}>
          Le Comité de Revue Clinique n&apos;est pas constitué ({crb?.missing.join(", ") ?? "aucun siège pourvu"}).
          {serving
            ? " Cette instance sert des citoyens : la plateforme oriente vers une personne au lieu d'évaluer, et le contrôle de disponibilité signale une dégradation."
            : " Sur un environnement de développement la plateforme continue d'évaluer, en le signalant ; en pilote ou en production elle ne le ferait pas."}
        </Notice>
      )}

      {crb?.constituted && summary.unsigned > 0 && (
        <Notice tone="warn">
          {summary.unsigned} contenu(s) clinique(s) sur {summary.total} attendent encore une signature.
        </Notice>
      )}

      <ReviewBoardConsole canSubmit={hasPermission(session.role, "review:submit")} />
    </div>
  );
}
