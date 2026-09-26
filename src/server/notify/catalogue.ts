import "server-only";

/**
 * Every notice the platform can send, in one catalogue.
 *
 * Before this, each notice was a `notify()` call with its French text written
 * inline at the site that raised it. That works until somebody asks the
 * questions an operator actually asks: which notices exist, which reach a
 * citizen rather than staff, which survive an opt-out, and which channel
 * carries each one. None of those could be answered without reading the whole
 * server, and none could be tested.
 *
 * So the catalogue is data. A call site names an event and supplies its
 * variables; the catalogue decides the wording, the channels, the severity and
 * whether a person may switch it off. That also makes the set reviewable by
 * somebody who does not read TypeScript — which matters, because a national
 * health programme's notices are a ministry's words, not an engineer's.
 *
 * Every event here corresponds to something the platform genuinely does. An
 * event nobody emits is worse than a gap: it tells an operator a signal exists
 * that will never arrive.
 */

export type EventSeverity = "info" | "success" | "warning" | "critical";

/**
 * `voice` is a call-back, not an app notification. It is the channel of last
 * resort and of first importance: a citizen who cannot read still needs to know
 * that a health worker is coming.
 */
export type EventChannel = "in_app" | "sms" | "whatsapp" | "voice" | "email";

export const CHANNELS: EventChannel[] = ["in_app", "sms", "whatsapp", "voice", "email"];

export const CHANNEL_FR: Record<EventChannel, string> = {
  in_app: "Dans l'application",
  sms: "SMS",
  whatsapp: "WhatsApp",
  voice: "Appel vocal",
  email: "E-mail",
};

/** Who the notice is for. It decides the register of the text, not the routing. */
export type Audience = "citizen" | "field" | "partner" | "state";

export const AUDIENCE_FR: Record<Audience, string> = {
  citizen: "Citoyen",
  field: "Agent de terrain",
  partner: "Partenaire",
  state: "Administration",
};

export interface CommsEvent {
  /** Stable identifier, `domain.thing_that_happened`. Never renamed: it is in the audit log. */
  id: string;
  category: CategoryId;
  audience: Audience;
  severity: EventSeverity;
  /** French canonical. Other languages come from the Language Agent at send time. */
  title: string;
  body: string;
  /** Where it goes by default. A person may narrow this, unless it is mandatory. */
  channels: EventChannel[];
  /**
   * Survives an opt-out, quiet hours and the frequency cap.
   *
   * Reserved for notices whose absence is itself a harm: a danger sign that
   * needs a human, a safeguarding referral, a lockout somebody must know about,
   * an erasure that has completed. Marketing a service more loudly is never a
   * reason.
   */
  mandatory?: boolean;
  /** Required whenever `mandatory` is set, and shown in the console. */
  mandatoryBecause?: string;
  /** Placeholders the call site must supply, as `{{name}}`. */
  vars?: string[];
}

export type CategoryId =
  | "account"
  | "security"
  | "clinical_safety"
  | "cases"
  | "review_board"
  | "protocols"
  | "language"
  | "agriculture"
  | "education"
  | "privacy"
  | "oversight"
  | "platform";

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
}

export const CATEGORIES: Category[] = [
  { id: "account", label: "Compte et identité", description: "Création, activation, rôle et fin de vie d'un compte." },
  { id: "security", label: "Connexion et sécurité", description: "Authentification, verrouillage, appareils et sessions." },
  { id: "clinical_safety", label: "Sécurité clinique", description: "Signes de danger, gravité 4, escalades et urgences. Le cœur du service." },
  { id: "cases", label: "Cas et suivi", description: "Attribution, délais, relances et clôture des cas ouverts." },
  { id: "review_board", label: "Comité de revue clinique", description: "Quorum, signatures, suspensions et contenus en attente." },
  { id: "protocols", label: "Protocoles et contenu", description: "Versions, déploiements progressifs et retraits." },
  { id: "language", label: "Langues et qualité", description: "Portes de qualité, passages en mode scripté et revues d'échanges." },
  { id: "agriculture", label: "Agriculture", description: "Alertes phytosanitaires, foyers détectés et maladies à déclaration." },
  { id: "education", label: "Éducation", description: "Parcours, révisions et échéances d'examen." },
  { id: "privacy", label: "Données personnelles", description: "Consentement, accès, effacement et conservation." },
  { id: "oversight", label: "Supervision et conformité", description: "Objectifs de service, audit et enquêtes." },
  { id: "platform", label: "Plateforme", description: "Maintenance, indisponibilités, tâches planifiées et capacité." },
];

const IN_APP: EventChannel[] = ["in_app"];
const REACHES_A_PHONE: EventChannel[] = ["in_app", "sms", "whatsapp"];
const REACHES_ANYONE: EventChannel[] = ["in_app", "sms", "whatsapp", "voice"];
const STAFF: EventChannel[] = ["in_app", "email"];
const STAFF_URGENT: EventChannel[] = ["in_app", "email", "sms"];

export const EVENTS: CommsEvent[] = [
  /* ── Compte et identité ─────────────────────────────────────────────── */
  { id: "account.created", category: "account", audience: "citizen", severity: "success", title: "Votre compte est créé", body: "Bienvenue sur CONGO VOICE. Vous pouvez poser vos questions et retrouver vos échanges.", channels: REACHES_A_PHONE },
  { id: "account.staff_created", category: "account", audience: "field", severity: "info", title: "Votre compte {{role}} a été créé", body: "{{actor}} vous a créé un compte. Connectez-vous avec votre numéro et le code PIN qui vous a été remis, puis changez-le.", channels: STAFF, vars: ["role", "actor"] },
  { id: "account.role_changed", category: "account", audience: "field", severity: "info", title: "Votre rôle a changé", body: "Votre rôle est désormais : {{role}}. Vos accès ont été mis à jour.", channels: STAFF, vars: ["role"] },
  { id: "account.suspended", category: "account", audience: "field", severity: "warning", title: "Votre compte est suspendu", body: "Motif : {{reason}}. Contactez votre superviseur.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Une personne empêchée de travailler doit savoir pourquoi, et ne peut pas l'apprendre dans l'application à laquelle elle n'a plus accès.", vars: ["reason"] },
  { id: "account.reactivated", category: "account", audience: "field", severity: "success", title: "Votre compte est réactivé", body: "Vous pouvez de nouveau vous connecter.", channels: STAFF },
  { id: "account.pin_reset_required", category: "account", audience: "field", severity: "warning", title: "Changez votre code PIN", body: "Votre code PIN doit être changé à la prochaine connexion.", channels: STAFF },

  /* ── Connexion et sécurité ──────────────────────────────────────────── */
  { id: "security.locked_out", category: "security", audience: "citizen", severity: "critical", title: "Compte temporairement bloqué", body: "Trop de tentatives de connexion. Réessayez dans {{minutes}} minutes. Si ce n'était pas vous, prévenez votre superviseur.", channels: REACHES_A_PHONE, mandatory: true, mandatoryBecause: "C'est le seul signal qu'une personne reçoit lorsqu'un tiers tente d'entrer dans son compte.", vars: ["minutes"] },
  { id: "security.pin_changed", category: "security", audience: "citizen", severity: "success", title: "Votre code PIN a été changé", body: "Si vous n'êtes pas à l'origine de ce changement, prévenez immédiatement votre superviseur.", channels: REACHES_A_PHONE, mandatory: true, mandatoryBecause: "Un changement de code que la personne n'a pas demandé est une prise de contrôle du compte." },
  { id: "security.new_device", category: "security", audience: "field", severity: "warning", title: "Nouvelle connexion détectée", body: "Une connexion a eu lieu depuis un appareil inhabituel, le {{date}}.", channels: STAFF, vars: ["date"] },
  { id: "security.sessions_revoked", category: "security", audience: "field", severity: "warning", title: "Vos sessions ont été fermées", body: "Toutes vos sessions actives ont été fermées. Reconnectez-vous.", channels: STAFF, mandatory: true, mandatoryBecause: "Une déconnexion forcée sans explication ressemble à une panne ; la personne doit savoir que c'est délibéré." },
  { id: "security.mfa_enabled", category: "security", audience: "field", severity: "success", title: "Double authentification activée", body: "Conservez vos codes de secours en lieu sûr.", channels: STAFF },
  { id: "security.mfa_disabled", category: "security", audience: "field", severity: "warning", title: "Double authentification désactivée", body: "Si vous n'êtes pas à l'origine de cette action, prévenez immédiatement l'administration.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Désactiver la double authentification est la première chose que fait quelqu'un qui a pris un compte." },

  /* ── Sécurité clinique ──────────────────────────────────────────────── */
  { id: "clinical.danger_sign", category: "clinical_safety", audience: "citizen", severity: "critical", title: "Rendez-vous au centre de santé maintenant", body: "D'après ce que vous avez décrit, la situation peut être grave. Allez au centre de santé le plus proche sans attendre. Un agent de santé a été prévenu.", channels: REACHES_ANYONE, mandatory: true, mandatoryBecause: "Un signe de danger non transmis est le seul échec de cette plateforme qui coûte une vie. Aucune préférence ne peut le désactiver." },
  { id: "clinical.escalated_to_worker", category: "clinical_safety", audience: "field", severity: "critical", title: "Escalade gravité {{severity}} — {{province}}", body: "{{summary}}. Ouvrez le cas {{caseRef}} et contactez la personne.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "L'escalade est la promesse faite au citoyen qu'un humain est prévenu. Elle ne peut pas dépendre des préférences d'un agent.", vars: ["severity", "province", "summary", "caseRef"] },
  { id: "clinical.escalation_unacknowledged", category: "clinical_safety", audience: "state", severity: "critical", title: "Escalade non prise en charge depuis {{minutes}} min", body: "Le cas {{caseRef}} ({{province}}) n'a été repris par personne. Réattribuez-le.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Une escalade que personne ne prend est indiscernable d'une escalade traitée, sauf si quelqu'un est prévenu.", vars: ["minutes", "caseRef", "province"] },
  { id: "clinical.safeguarding_referral", category: "clinical_safety", audience: "state", severity: "critical", title: "Signalement de protection", body: "Un échange a déclenché une procédure de protection. Accès restreint : {{caseRef}}.", channels: ["in_app"], mandatory: true, mandatoryBecause: "Un signalement de protection doit atteindre la personne habilitée, et seulement elle — d'où le canal unique.", vars: ["caseRef"] },
  { id: "clinical.follow_up_due", category: "clinical_safety", audience: "citizen", severity: "info", title: "Comment allez-vous aujourd'hui ?", body: "Vous nous aviez parlé de {{subject}}. Répondez pour nous dire si cela va mieux.", channels: REACHES_ANYONE, vars: ["subject"] },
  { id: "clinical.emergency_script_served", category: "clinical_safety", audience: "state", severity: "warning", title: "Script d'urgence utilisé", body: "Le service a servi un script d'urgence sans passer par un modèle, pour {{reason}}.", channels: STAFF, vars: ["reason"] },

  /* ── Cas et suivi ───────────────────────────────────────────────────── */
  { id: "case.assigned", category: "cases", audience: "field", severity: "info", title: "Cas {{caseRef}} vous est attribué", body: "{{summary}}", channels: STAFF, vars: ["caseRef", "summary"] },
  { id: "case.reassigned", category: "cases", audience: "field", severity: "info", title: "Cas {{caseRef}} réattribué", body: "Le cas a été confié à {{assignee}}.", channels: IN_APP, vars: ["caseRef", "assignee"] },
  { id: "case.sla_warning", category: "cases", audience: "field", severity: "warning", title: "Cas {{caseRef}} : délai bientôt dépassé", body: "Il reste {{minutes}} minutes avant l'échéance.", channels: STAFF, vars: ["caseRef", "minutes"] },
  { id: "case.sla_breached", category: "cases", audience: "state", severity: "critical", title: "Délai dépassé sur le cas {{caseRef}}", body: "Le cas est ouvert depuis {{hours}} heures sans résolution.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Un objectif de service non tenu qui n'est signalé à personne n'est pas un objectif.", vars: ["caseRef", "hours"] },
  { id: "case.resolved", category: "cases", audience: "citizen", severity: "success", title: "Votre demande a été traitée", body: "{{resolution}}", channels: REACHES_A_PHONE, vars: ["resolution"] },
  { id: "case.note_added", category: "cases", audience: "field", severity: "info", title: "Nouvelle note sur {{caseRef}}", body: "{{actor}} a ajouté une note.", channels: IN_APP, vars: ["caseRef", "actor"] },

  /* ── Comité de revue clinique ───────────────────────────────────────── */
  { id: "review.signature_requested", category: "review_board", audience: "partner", severity: "warning", title: "Signature demandée : {{artefact}}", body: "Un contenu clinique attend votre validation.", channels: STAFF, vars: ["artefact"] },
  { id: "review.quorum_incomplete", category: "review_board", audience: "state", severity: "critical", title: "Comité incomplet : {{missing}}", body: "Aucune évaluation clinique ne sera rendue tant que le comité n'est pas constitué.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Sans quorum le service n'est pas cliniquement couvert, et il continue de répondre aux citoyens.", vars: ["missing"] },
  { id: "review.artefact_signed", category: "review_board", audience: "state", severity: "success", title: "{{artefact}} validé", body: "Signé par {{signatory}}.", channels: STAFF, vars: ["artefact", "signatory"] },
  { id: "review.artefact_suspended", category: "review_board", audience: "state", severity: "critical", title: "{{artefact}} suspendu", body: "Motif : {{reason}}. Le service cesse immédiatement de rassurer sur ce contenu.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Une suspension clinique change le comportement du service pour tous les citoyens à l'instant où elle est prononcée.", vars: ["artefact", "reason"] },
  { id: "review.content_unsigned", category: "review_board", audience: "state", severity: "warning", title: "{{count}} contenus cliniques sans signature", body: "Le service oriente et escalade, mais ne rassure pas sur ces contenus.", channels: STAFF, vars: ["count"] },

  /* ── Protocoles et contenu ──────────────────────────────────────────── */
  { id: "protocol.version_published", category: "protocols", audience: "state", severity: "info", title: "Protocole {{protocol}} v{{version}} publié", body: "La nouvelle version s'applique aux échanges à partir de maintenant.", channels: STAFF, vars: ["protocol", "version"] },
  { id: "protocol.canary_due", category: "protocols", audience: "state", severity: "warning", title: "Déploiement progressif arrivé à échéance", body: "{{count}} déploiement(s) attendent une décision : généraliser ou retirer.", channels: STAFF, vars: ["count"] },
  { id: "protocol.rolled_back", category: "protocols", audience: "state", severity: "warning", title: "Protocole {{protocol}} revenu à v{{version}}", body: "Motif : {{reason}}.", channels: STAFF, vars: ["protocol", "version", "reason"] },
  { id: "protocol.knowledge_updated", category: "protocols", audience: "field", severity: "info", title: "Bibliothèque de référence mise à jour", body: "{{count}} document(s) modifiés. Consultez la page Ressources.", channels: IN_APP, vars: ["count"] },

  /* ── Langues et qualité ─────────────────────────────────────────────── */
  { id: "language.gate_failed", category: "language", audience: "state", severity: "warning", title: "{{pairs}} couple(s) langue/module en mode scripté", body: "La qualité mesurée est passée sous le seuil : ces langues servent des scripts au lieu de réponses générées.", channels: STAFF, vars: ["pairs"] },
  { id: "language.gate_recovered", category: "language", audience: "state", severity: "success", title: "{{pair}} de nouveau au-dessus du seuil", body: "Les réponses générées reprennent pour ce couple.", channels: STAFF, vars: ["pair"] },
  { id: "language.review_due", category: "language", audience: "partner", severity: "info", title: "Revue qualité : {{count}} échanges à relire", body: "Échantillon du {{day}}.", channels: STAFF, vars: ["count", "day"] },
  { id: "language.glossary_violation", category: "language", audience: "state", severity: "warning", title: "Terme hors glossaire détecté", body: "{{term}} a été employé dans une réponse en {{language}}.", channels: STAFF, vars: ["term", "language"] },

  /* ── Agriculture ────────────────────────────────────────────────────── */
  { id: "agri.notifiable_disease", category: "agriculture", audience: "state", severity: "critical", title: "Maladie à déclaration obligatoire — {{province}}", body: "{{disease}} signalée à {{territory}}. Déclaration réglementaire requise.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "La déclaration d'une maladie à notification obligatoire est une obligation légale, pas une préférence de service.", vars: ["province", "disease", "territory"] },
  { id: "agri.cluster_detected", category: "agriculture", audience: "field", severity: "warning", title: "Foyer possible à {{territory}}", body: "{{count}} signalements similaires en {{days}} jours.", channels: STAFF, vars: ["territory", "count", "days"] },
  { id: "agri.seasonal_advice", category: "agriculture", audience: "citizen", severity: "info", title: "Conseil de saison : {{crop}}", body: "{{advice}}", channels: REACHES_ANYONE, vars: ["crop", "advice"] },
  { id: "agri.officer_escalation", category: "agriculture", audience: "field", severity: "warning", title: "Cas agricole à voir — {{territory}}", body: "{{summary}}", channels: STAFF, vars: ["territory", "summary"] },

  /* ── Éducation ──────────────────────────────────────────────────────── */
  { id: "edu.plan_ready", category: "education", audience: "citizen", severity: "success", title: "Votre parcours de révision est prêt", body: "{{subject}} — {{sessions}} séances proposées.", channels: REACHES_A_PHONE, vars: ["subject", "sessions"] },
  { id: "edu.revision_reminder", category: "education", audience: "citizen", severity: "info", title: "C'est l'heure de réviser {{subject}}", body: "Une séance courte vaut mieux qu'une longue séance reportée.", channels: REACHES_ANYONE, vars: ["subject"] },
  { id: "edu.exam_approaching", category: "education", audience: "citizen", severity: "warning", title: "{{exam}} dans {{days}} jours", body: "Voici ce qu'il reste à revoir.", channels: REACHES_A_PHONE, vars: ["exam", "days"] },
  { id: "edu.teacher_escalation", category: "education", audience: "field", severity: "info", title: "Élève à accompagner", body: "{{summary}}", channels: STAFF, vars: ["summary"] },

  /* ── Données personnelles ───────────────────────────────────────────── */
  { id: "privacy.consent_requested", category: "privacy", audience: "citizen", severity: "info", title: "Votre accord est nécessaire", body: "{{purpose}}. Vous pouvez refuser : le service continue de fonctionner.", channels: REACHES_A_PHONE, mandatory: true, mandatoryBecause: "Un consentement qu'on ne demande pas n'est pas un consentement.", vars: ["purpose"] },
  { id: "privacy.export_ready", category: "privacy", audience: "citizen", severity: "success", title: "Vos données sont prêtes", body: "Le dossier contenant vos échanges est disponible pendant {{days}} jours.", channels: REACHES_A_PHONE, vars: ["days"] },
  { id: "privacy.deletion_requested", category: "privacy", audience: "citizen", severity: "warning", title: "Suppression de compte demandée", body: "Votre demande est enregistrée. Si ce n'était pas vous, répondez immédiatement.", channels: REACHES_A_PHONE, mandatory: true, mandatoryBecause: "Une suppression demandée par un tiers doit pouvoir être arrêtée par la personne concernée." },
  { id: "privacy.deletion_completed", category: "privacy", audience: "citizen", severity: "info", title: "Votre compte a été supprimé", body: "Enregistrements, photos et textes effacés. Le journal d'audit conserve la trace des actions du programme, sans donnée personnelle.", channels: REACHES_A_PHONE, mandatory: true, mandatoryBecause: "C'est la confirmation que le droit a été exercé ; sans elle la personne ne peut pas savoir si sa demande a abouti." },
  { id: "privacy.request_overdue", category: "privacy", audience: "state", severity: "critical", title: "{{count}} demande(s) de droits en retard", body: "Le délai réglementaire de trente jours est dépassé.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Un délai réglementaire dépassé engage la responsabilité du programme, qu'un administrateur l'ait souhaité ou non.", vars: ["count"] },
  { id: "privacy.retention_failed", category: "privacy", audience: "state", severity: "warning", title: "{{count}} objet(s) non supprimés à l'échéance", body: "La purge de conservation a échoué pour ces fichiers.", channels: STAFF, vars: ["count"] },

  /* ── Supervision et conformité ──────────────────────────────────────── */
  { id: "oversight.slo_breached", category: "oversight", audience: "state", severity: "warning", title: "{{count}} objectif(s) de service non tenu(s)", body: "{{detail}}", channels: STAFF, vars: ["count", "detail"] },
  { id: "oversight.audit_chain_broken", category: "oversight", audience: "state", severity: "critical", title: "Intégrité du journal d'audit compromise", body: "La chaîne de hachage ne se vérifie plus à partir du {{date}}. Traitez ceci comme un incident de sécurité.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Un journal d'audit dont l'intégrité est rompue ne prouve plus rien, y compris qu'il a été rompu.", vars: ["date"] },
  { id: "oversight.override_recorded", category: "oversight", audience: "state", severity: "info", title: "Gravité relevée par un agent", body: "{{actor}} a relevé la gravité du cas {{caseRef}} : {{reason}}.", channels: IN_APP, vars: ["actor", "caseRef", "reason"] },
  { id: "oversight.break_glass_used", category: "oversight", audience: "state", severity: "critical", title: "Accès d'urgence utilisé", body: "{{actor}} a ouvert un accès exceptionnel à {{entity}}. Motif : {{reason}}.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Un accès qui contourne les contrôles ordinaires n'est acceptable que s'il est vu par quelqu'un d'autre, tout de suite.", vars: ["actor", "entity", "reason"] },
  { id: "oversight.report_ready", category: "oversight", audience: "partner", severity: "info", title: "Rapport {{period}} disponible", body: "Le rapport agrégé est prêt à être consulté ou exporté.", channels: STAFF, vars: ["period"] },

  /* ── Plateforme ─────────────────────────────────────────────────────── */
  { id: "platform.maintenance_scheduled", category: "platform", audience: "field", severity: "info", title: "Maintenance prévue le {{date}}", body: "Le service sera indisponible environ {{minutes}} minutes.", channels: STAFF, vars: ["date", "minutes"] },
  { id: "platform.degraded_mode", category: "platform", audience: "state", severity: "warning", title: "Service en mode scripté", body: "La capacité de traitement est atteinte : les réponses non urgentes passent en mode scripté. Les garde-fous restent actifs.", channels: STAFF_URGENT },
  { id: "platform.scheduler_silent", category: "platform", audience: "state", severity: "critical", title: "Tâches planifiées arrêtées", body: "Aucune exécution depuis {{minutes}} minutes : rappels, relances, purges et vérification d'audit ne tournent plus.", channels: STAFF_URGENT, mandatory: true, mandatoryBecause: "Un ordonnanceur arrêté est silencieux par nature : rien d'autre ne signale son absence.", vars: ["minutes"] },
  { id: "platform.provider_unavailable", category: "platform", audience: "state", severity: "warning", title: "Fournisseur {{provider}} indisponible", body: "Le service a basculé sur une solution de repli.", channels: STAFF, vars: ["provider"] },
  { id: "platform.residency_refusal", category: "platform", audience: "state", severity: "warning", title: "Destination refusée par la politique de résidence", body: "{{destination}} est configuré mais hors de la politique déclarée : rien ne lui est envoyé.", channels: STAFF, vars: ["destination"] },
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export function event(id: string): CommsEvent | undefined {
  return BY_ID.get(id);
}

export function eventsInCategory(id: CategoryId): CommsEvent[] {
  return EVENTS.filter((e) => e.category === id);
}

/** How many events reach each channel by default — the console's coverage chart. */
export function channelCoverage(): Array<{ channel: EventChannel; label: string; events: number }> {
  return CHANNELS.map((channel) => ({
    channel,
    label: CHANNEL_FR[channel],
    events: EVENTS.filter((e) => e.channels.includes(channel)).length,
  }));
}

export function mandatoryEvents(): CommsEvent[] {
  return EVENTS.filter((e) => e.mandatory);
}
