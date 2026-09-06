import { runScheduler } from "@/lib/core/scheduler";

runScheduler()
  .then((r) => {
    console.log(
      [
        `Rappels envoyés : ${r.reminders.fired} (annulés ${r.reminders.cancelled}, échecs ${r.reminders.failed})`,
        `Notifications différées envoyées : ${r.deferredNotificationsSent}`,
        `Délais SLA dépassés : ${r.slaBreaches}`,
        `Cas bloqués relancés : ${r.blockedCases}`,
        `Rapports programmés produits : ${r.reportsGenerated} (expirés : ${r.reportsExpired})`,
        `Chaîne d'audit ${r.auditChain?.date ?? "—"} : ${r.auditChain ? (r.auditChain.ok ? "intègre" : "COMPROMISE") : "non vérifiée"}`,
        `Alertes de plafond ACU : ${r.acuAlerts}`,
        `Demandes de données en retard : ${r.overdueDataRequests}`,
        `Durée : ${r.durationMs} ms`,
      ].join("\n"),
    );
    if (r.errors.length) console.error("Étapes en échec :", r.errors);
    process.exit(r.auditChain && !r.auditChain.ok ? 2 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
