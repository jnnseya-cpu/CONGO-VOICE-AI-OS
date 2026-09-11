/**
 * CONGO VOICE AI OS — canonical data model (PostgreSQL dialect).
 *
 * The same schema runs on an embedded PGlite database (development, tests)
 * and on a managed PostgreSQL instance (production). See ./client.ts.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("user_role", [
  "citizen",
  "chw", // community health worker
  "agri_officer",
  "teacher",
  "ngo",
  "gov_admin",
  "platform_admin",
]);

export const moduleEnum = pgEnum("module_type", [
  "health",
  "agriculture",
  "education",
  "general",
]);

export const languageEnum = pgEnum("language_code", ["fr", "ln", "kg", "sw", "lua"]);

export const interactionStatusEnum = pgEnum("interaction_status", [
  "received",
  "processing",
  "completed",
  "failed",
  "abandoned",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "open",
  "open_emergency",
  "assigned",
  "acknowledged",
  "in_progress",
  "needs_follow_up",
  "reassigned",
  "escalated",
  "escalated_up",
  "resolved",
  "closed",
  "cancelled",
  "duplicate",
]);

export const channelEnum = pgEnum("channel_type", ["pwa", "ivr", "whatsapp", "ussd", "sms", "assisted", "android"]);
export const lifecycleStatusEnum = pgEnum("lifecycle_status", ["draft", "review", "approved", "canary", "active", "retired"]);

export const severityEnum = pgEnum("severity_level", ["low", "medium", "high", "critical"]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "sms",
  "whatsapp",
  "email",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
  "read",
]);

export const fileKindEnum = pgEnum("file_kind", ["audio", "image", "video", "document"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 32 }).unique(),
    name: varchar("name", { length: 160 }),
    isAnonymous: boolean("is_anonymous").default(false).notNull(),
    role: roleEnum("role").default("citizen").notNull(),
    languagePreference: languageEnum("language_preference").default("fr").notNull(),
    province: varchar("province", { length: 120 }),
    territory: varchar("territory", { length: 120 }),
    region: varchar("region", { length: 120 }),
    organisation: varchar("organisation", { length: 160 }),
    consentStatus: varchar("consent_status", { length: 32 }).default("pending").notNull(),
    pinHash: text("pin_hash"),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    /** Tenancy and organisation scope (institutional users). */
    tenantId: uuid("tenant_id"),
    organisationId: uuid("organisation_id"),
    /** Territories a worker covers; used for case routing. */
    territories: jsonb("territories").$type<string[]>().default([]).notNull(),
    onDuty: boolean("on_duty").default(true).notNull(),
    /** Pseudonymous identifier used in analytics instead of the user id. */
    pseudoId: varchar("pseudo_id", { length: 64 }).unique(),
    ageBand: varchar("age_band", { length: 16 }),
    sex: varchar("sex", { length: 16 }),
    mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
    /** TOTP seed, encrypted at rest. See core/crypto.ts. */
    mfaSecret: text("mfa_secret"),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    /**
     * Sessions are signed tokens, not rows, so a logout cannot delete them.
     * Every token carries the moment it was issued; a token issued before this
     * instant is refused. Logging out, changing role, suspending an account or
     * resetting a PIN moves it forward and invalidates what is already out there.
     */
    sessionEpoch: timestamp("session_epoch", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [index("users_role_idx").on(t.role), index("users_province_idx").on(t.province), index("users_org_idx").on(t.organisationId)],
);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 32 }).default("programme").notNull(), // national | ministry | ngo | programme | platform
  legalName: varchar("legal_name", { length: 240 }),
  status: varchar("status", { length: 16 }).default("active").notNull(),
  acuMonthlyCap: real("acu_monthly_cap"),
  entitlements: jsonb("entitlements").$type<string[]>().default(["health", "agriculture", "education"]).notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  parentId: uuid("parent_id"),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 32 }).default("ngo").notNull(), // ministry | provincial_division | ngo | school_cluster | call_centre | extension_service | clinic_network | platform
  provinceScope: jsonb("province_scope").$type<string[]>().default([]).notNull(),
  territoryScope: jsonb("territory_scope").$type<string[]>().default([]).notNull(),
  routingSkills: jsonb("routing_skills").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const citizenIdentifiers = pgTable(
  "citizen_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    kind: varchar("kind", { length: 24 }).notNull(), // msisdn | whatsapp | pwa_account | ivr_caller
    valueHash: varchar("value_hash", { length: 128 }).notNull(),
    valueLast4: varchar("value_last4", { length: 4 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("citizen_identifiers_kind_hash_idx").on(t.kind, t.valueHash)],
);

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(), // service | reminders | precise_location | analytics | research | partner_sharing | pregnancy_data | child_profile | cross_programme_referral
    status: varchar("status", { length: 16 }).notNull(), // granted | revoked
    version: varchar("version", { length: 16 }).default("1.0").notNull(),
    method: varchar("method", { length: 24 }).notNull(), // voice | button | ussd | worker_assisted
    language: languageEnum("language").default("fr").notNull(),
    proxy: jsonb("proxy").$type<{ present?: string; onBehalfOf?: string; basis?: string } | null>(),
    evidenceUri: text("evidence_uri"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("consents_user_purpose_idx").on(t.userId, t.purpose)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id").references(() => users.id),
    channel: channelEnum("channel").default("pwa").notNull(),
    channelRef: varchar("channel_ref", { length: 160 }), // caller id hash, WhatsApp id hash, device id…
    language: languageEnum("language"),
    module: moduleEnum("module"),
    status: varchar("status", { length: 16 }).default("active").notNull(), // active | ended | abandoned | resumable
    province: varchar("province", { length: 120 }),
    territory: varchar("territory", { length: 120 }),
    capabilities: jsonb("capabilities").$type<Record<string, boolean>>().default({}).notNull(),
    proxy: jsonb("proxy").$type<Record<string, unknown> | null>(),
    consentSnapshot: jsonb("consent_snapshot").$type<Record<string, string>>().default({}).notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().default({}).notNull(), // resumable channel state (IVR step, USSD menu, pending clarification)
    turnCount: integer("turn_count").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("sessions_channel_ref_idx").on(t.channel, t.channelRef), index("sessions_user_idx").on(t.userId)],
);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  interactionId: uuid("interaction_id"),
  kind: fileKindEnum("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    userRole: roleEnum("user_role").default("citizen").notNull(),
    module: moduleEnum("module").default("general").notNull(),
    channel: varchar("channel", { length: 16 }).default("text").notNull(), // voice | text | image | video
    language: languageEnum("language"),
    languageConfidence: real("language_confidence"),
    province: varchar("province", { length: 120 }),
    audioFileId: uuid("audio_file_id"),
    attachmentIds: jsonb("attachment_ids").$type<string[]>().default([]).notNull(),
    originalInput: text("original_input"),
    transcript: text("transcript"),
    translationFr: text("translation_fr"),
    intent: varchar("intent", { length: 120 }),
    understanding: text("understanding"),
    response: text("response"),
    responseLanguage: languageEnum("response_language"),
    structured: jsonb("structured").$type<Record<string, unknown>>(),
    followUpQuestions: jsonb("follow_up_questions").$type<string[]>().default([]).notNull(),
    confidence: real("confidence"),
    riskScore: real("risk_score"),
    severity: severityEnum("severity"),
    escalationRequired: boolean("escalation_required").default(false).notNull(),
    caseId: uuid("case_id"),
    status: interactionStatusEnum("status").default("received").notNull(),
    summary: text("summary"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    version: integer("version").default(1).notNull(),
    auditStatus: varchar("audit_status", { length: 32 }).default("recorded").notNull(),
    sessionId: uuid("session_id"),
    seq: integer("seq").default(1).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    /** Token-level language tags for code-switched speech: [[token, lang], …]. */
    transcriptTags: jsonb("transcript_tags").$type<Array<[string, string]>>().default([]).notNull(),
    /** Confidence vector (speech, language, intent, entities, retrieval, vision, rules, groundedness, policy). */
    confidenceDimensions: jsonb("confidence_dimensions").$type<Record<string, number>>().default({}).notNull(),
    /** Knowledge / protocol identifiers cited by the answer. */
    citations: jsonb("citations").$type<string[]>().default([]).notNull(),
    promptVersion: varchar("prompt_version", { length: 48 }),
    protocolVersion: varchar("protocol_version", { length: 48 }),
    modelRoute: jsonb("model_route").$type<Record<string, string>>().default({}).notNull(),
    acu: real("acu").default(0).notNull(),
    failureReason: varchar("failure_reason", { length: 64 }),
    traceId: varchar("trace_id", { length: 64 }),
    safeguarding: boolean("safeguarding").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("interactions_session_idx").on(t.sessionId),
    index("interactions_user_idx").on(t.userId),
    index("interactions_module_idx").on(t.module),
    index("interactions_created_idx").on(t.createdAt),
    index("interactions_status_idx").on(t.status),
  ],
);

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: moduleEnum("module").notNull(),
    userId: uuid("user_id").references(() => users.id),
    interactionId: uuid("interaction_id").references(() => interactions.id),
    title: varchar("title", { length: 240 }).notNull(),
    severity: severityEnum("severity").default("medium").notNull(),
    status: caseStatusEnum("status").default("open").notNull(),
    escalationLevel: integer("escalation_level").default(0).notNull(),
    assignedTo: uuid("assigned_to").references(() => users.id),
    province: varchar("province", { length: 120 }),
    notes: text("notes"),
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    resolution: text("resolution"),
    outcome: varchar("outcome", { length: 120 }),
    tenantId: uuid("tenant_id"),
    organisationId: uuid("organisation_id"),
    territory: varchar("territory", { length: 120 }),
    /** Accountable queue (e.g. "chw:Kinshasa:Kimbanseke"); exactly one at any time. */
    queue: varchar("queue", { length: 160 }),
    /** 0 self-care · 1 monitor · 2 clinic within 24 h · 3 clinic today · 4 emergency now */
    severityLevel: integer("severity_level").default(2).notNull(),
    aiSeverityLevel: integer("ai_severity_level"),
    overriddenSeverityLevel: integer("overridden_severity_level"),
    overrideReason: text("override_reason"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    slaBreached: boolean("sla_breached").default(false).notNull(),
    slaPausedReason: varchar("sla_paused_reason", { length: 120 }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    actionTaken: text("action_taken"),
    citizenReachability: varchar("citizen_reachability", { length: 32 }),
    followUpDecision: varchar("follow_up_decision", { length: 64 }),
    safeguarding: boolean("safeguarding").default(false).notNull(),
    isNotifiable: boolean("is_notifiable").default(false).notNull(),
    mergedInto: uuid("merged_into"),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (t) => [
    index("cases_queue_idx").on(t.queue),
    index("cases_sla_idx").on(t.slaDueAt),
    index("cases_status_idx").on(t.status),
    index("cases_module_idx").on(t.module),
    index("cases_assigned_idx").on(t.assignedTo),
  ],
);

export const caseEvents = pgTable("case_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .references(() => cases.id)
    .notNull(),
  type: varchar("type", { length: 48 }).notNull(), // created | assigned | status_changed | escalated | note | reminder
  fromValue: text("from_value"),
  toValue: text("to_value"),
  actorUserId: uuid("actor_user_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const healthTriageRecords = pgTable("health_triage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id")
    .references(() => interactions.id)
    .notNull(),
  caseId: uuid("case_id"),
  symptoms: jsonb("symptoms").$type<string[]>().default([]).notNull(),
  ageGroup: varchar("age_group", { length: 32 }),
  pregnancyStatus: varchar("pregnancy_status", { length: 32 }),
  emergencyFlags: jsonb("emergency_flags").$type<string[]>().default([]).notNull(),
  topic: varchar("topic", { length: 64 }),
  recommendation: text("recommendation"),
  referralStatus: varchar("referral_status", { length: 32 }).default("none").notNull(),
  followUpStatus: varchar("follow_up_status", { length: 32 }).default("none").notNull(),
  province: varchar("province", { length: 120 }),
  territory: varchar("territory", { length: 120 }),
  healthZone: varchar("health_zone", { length: 120 }),
  protocolId: varchar("protocol_id", { length: 64 }),
  protocolVersion: varchar("protocol_version", { length: 24 }),
  answers: jsonb("answers").$type<Record<string, unknown>>().default({}).notNull(),
  /** 0–4 deterministic severity from the protocol engine. */
  severityLevel: integer("severity_level"),
  riskBand: varchar("risk_band", { length: 32 }), // emergency | urgent | routine | self_care | insufficient_information
  triggeredRuleIds: jsonb("triggered_rule_ids").$type<string[]>().default([]).notNull(),
  timeToAction: varchar("time_to_action", { length: 32 }),
  careDestinationType: varchar("care_destination_type", { length: 32 }),
  referralFacilityId: uuid("referral_facility_id"),
  followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  followUpOutcome: varchar("follow_up_outcome", { length: 120 }),
  safeguarding: boolean("safeguarding").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agricultureReports = pgTable("agriculture_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id")
    .references(() => interactions.id)
    .notNull(),
  caseId: uuid("case_id"),
  cropType: varchar("crop_type", { length: 80 }),
  issueType: varchar("issue_type", { length: 80 }),
  evidenceFileIds: jsonb("evidence_file_ids").$type<string[]>().default([]).notNull(),
  province: varchar("province", { length: 120 }),
  aiDiagnosis: text("ai_diagnosis"),
  recommendation: text("recommendation"),
  confidence: real("confidence"),
  urgent: boolean("urgent").default(false).notNull(),
  followUpStatus: varchar("follow_up_status", { length: 32 }).default("none").notNull(),
  territory: varchar("territory", { length: 120 }),
  season: varchar("season", { length: 32 }),
  growthStage: varchar("growth_stage", { length: 48 }),
  affectedProportion: varchar("affected_proportion", { length: 32 }),
  recentInputs: text("recent_inputs"),
  /** Top-3 candidate issues with probabilities and supporting / contradicting evidence. */
  candidates: jsonb("candidates").$type<Array<{ label: string; prob: number; evidenceFor?: string[]; evidenceAgainst?: string[] }>>().default([]).notNull(),
  topProb: real("top_prob"),
  isNotifiable: boolean("is_notifiable").default(false).notNull(),
  evidenceQuality: jsonb("evidence_quality").$type<Record<string, unknown>>().default({}).notNull(),
  missingEvidence: jsonb("missing_evidence").$type<string[]>().default([]).notNull(),
  actionsToAvoid: jsonb("actions_to_avoid").$type<string[]>().default([]).notNull(),
  tieredActions: jsonb("tiered_actions").$type<{ noCost: string[]; lowCost: string[]; purchase: string[] }>().default({ noCost: [], lowCost: [], purchase: [] }).notNull(),
  followUpOutcome: varchar("follow_up_outcome", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agriClusters = pgTable("agri_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  province: varchar("province", { length: 120 }),
  territory: varchar("territory", { length: 120 }),
  crop: varchar("crop", { length: 80 }),
  issue: varchar("issue", { length: 80 }).notNull(),
  reportCount: integer("report_count").default(0).notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 24 }).default("unverified").notNull(), // unverified | under_review | confirmed | rejected | closed
  validatedBy: uuid("validated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const plantingCalendars = pgTable("planting_calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  province: varchar("province", { length: 120 }).notNull(),
  crop: varchar("crop", { length: 80 }).notNull(),
  sowWindows: jsonb("sow_windows").$type<Array<{ from: string; to: string; label: string }>>().default([]).notNull(),
  notes: text("notes"),
  source: varchar("source", { length: 160 }),
  version: varchar("version", { length: 16 }).default("1.0").notNull(),
});

export const marketPrices = pgTable(
  "market_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    market: varchar("market", { length: 120 }).notNull(),
    commodity: varchar("commodity", { length: 80 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    priceCdf: real("price_cdf").notNull(),
    grade: varchar("grade", { length: 48 }),
    source: varchar("source", { length: 160 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("market_prices_commodity_idx").on(t.commodity, t.observedAt)],
);

/** Approved agricultural input registry: no chemical recommendation without a verified entry. */
export const inputRegistry = pgTable("input_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  activeIngredient: varchar("active_ingredient", { length: 160 }),
  category: varchar("category", { length: 48 }).notNull(), // insecticide | fungicide | herbicide | fertiliser | veterinary | biopesticide
  targetCrops: jsonb("target_crops").$type<string[]>().default([]).notNull(),
  targetIssues: jsonb("target_issues").$type<string[]>().default([]).notNull(),
  authorisationStatus: varchar("authorisation_status", { length: 32 }).default("unverified").notNull(), // authorised | restricted | banned | unverified
  labelInstructions: text("label_instructions"),
  ppe: text("ppe"),
  preHarvestIntervalDays: integer("pre_harvest_interval_days"),
  reEntryHours: integer("re_entry_hours"),
  source: varchar("source", { length: 160 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const educationSessions = pgTable("education_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id")
    .references(() => interactions.id)
    .notNull(),
  learnerAgeGroup: varchar("learner_age_group", { length: 32 }),
  subject: varchar("subject", { length: 80 }),
  topic: varchar("topic", { length: 160 }),
  difficultyLevel: varchar("difficulty_level", { length: 32 }),
  explanation: text("explanation"),
  quiz: jsonb("quiz").$type<Array<{ question: string; answer: string }>>().default([]).notNull(),
  progressSignal: varchar("progress_signal", { length: 32 }),
  province: varchar("province", { length: 120 }),
  mode: varchar("mode", { length: 24 }).default("explain").notNull(), // explain | quiz | read | homework | exam_prep | parent | teacher
  objective: text("objective"),
  score: real("score"),
  steps: jsonb("steps").$type<Array<{ stage: string; content: string; at?: string }>>().default([]).notNull(),
  masterySignal: varchar("mastery_signal", { length: 24 }),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const learnerProfiles = pgTable("learner_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  ageBand: varchar("age_band", { length: 16 }), // 6-8 | 9-11 | 12-14 | 15-18 | adult
  level: varchar("level", { length: 32 }), // primaire_1..6 | secondaire_1..6
  instructionLanguage: languageEnum("instruction_language").default("fr").notNull(),
  explainLanguage: languageEnum("explain_language").default("fr").notNull(),
  schoolOrganisationId: uuid("school_organisation_id"),
  examTarget: varchar("exam_target", { length: 32 }), // tenafep | examen_etat | none
  examDate: timestamp("exam_date", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const learningEvidence = pgTable(
  "learning_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    sessionId: uuid("session_id"),
    subject: varchar("subject", { length: 80 }).notNull(),
    topic: varchar("topic", { length: 160 }).notNull(),
    objective: text("objective"),
    rubric: varchar("rubric", { length: 160 }),
    difficulty: varchar("difficulty", { length: 24 }),
    assistanceLevel: varchar("assistance_level", { length: 24 }),
    response: text("response"),
    result: varchar("result", { length: 24 }).notNull(), // mastered | struggling | repeat_request | partial
    misconception: varchar("misconception", { length: 160 }),
    modelVersion: varchar("model_version", { length: 64 }),
    teacherVerified: boolean("teacher_verified").default(false).notNull(),
    territory: varchar("territory", { length: 120 }),
    province: varchar("province", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("learning_evidence_user_idx").on(t.userId, t.topic)],
);

export const stories = pgTable("stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: languageEnum("language").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  level: varchar("level", { length: 32 }).default("primaire").notNull(),
  body: text("body").notNull(),
  licence: varchar("licence", { length: 80 }).default("programme").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: varchar("action", { length: 96 }).notNull(),
    actorUserId: uuid("actor_user_id"),
    actorRole: varchar("actor_role", { length: 32 }),
    entityType: varchar("entity_type", { length: 48 }),
    entityId: varchar("entity_id", { length: 64 }),
    beforeValue: jsonb("before_value"),
    afterValue: jsonb("after_value"),
    systemEvent: varchar("system_event", { length: 96 }),
    aiSummary: text("ai_summary"),
    ip: varchar("ip", { length: 64 }),
    tenantId: uuid("tenant_id"),
    traceId: varchar("trace_id", { length: 64 }),
    purpose: varchar("purpose", { length: 120 }),
    /** Tamper-evident hash chain: hash = sha256(prevHash + canonical(row)). */
    prevHash: varchar("prev_hash", { length: 64 }),
    hash: varchar("hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_entity_idx").on(t.entityType, t.entityId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    channel: notificationChannelEnum("channel").default("in_app").notNull(),
    type: varchar("type", { length: 48 }).notNull(), // escalation | reminder | follow_up | broadcast | alert
    title: varchar("title", { length: 240 }).notNull(),
    body: text("body").notNull(),
    status: notificationStatusEnum("status").default("queued").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    templateKey: varchar("template_key", { length: 96 }),
    language: languageEnum("language"),
    tenantId: uuid("tenant_id"),
    to: varchar("to", { length: 160 }),
    attempts: integer("attempts").default(0).notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 160 }),
    failureReason: varchar("failure_reason", { length: 240 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.status), index("notifications_scheduled_idx").on(t.scheduledFor)],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 96 }).notNull(),
    channel: notificationChannelEnum("channel").default("sms").notNull(),
    language: languageEnum("language").default("fr").notNull(),
    module: moduleEnum("module").default("general").notNull(),
    riskLevel: varchar("risk_level", { length: 16 }),
    sensitivity: varchar("sensitivity", { length: 16 }).default("normal").notNull(), // normal | sensitive (lock-screen safe wording)
    title: varchar("title", { length: 240 }),
    body: text("body").notNull(),
    version: integer("version").default(1).notNull(),
    status: lifecycleStatusEnum("status").default("approved").notNull(),
    approvedBy: uuid("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notification_templates_key_idx").on(t.key, t.channel, t.language)],
);

/** Scheduled reminders and timers (vaccination, ANC, planting, revision, follow-up, SLA). */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    caseId: uuid("case_id"),
    kind: varchar("kind", { length: 32 }).notNull(), // vaccination | anc | planting | revision | follow_up | sla | report
    channel: notificationChannelEnum("channel").default("sms").notNull(),
    language: languageEnum("language").default("fr").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: varchar("status", { length: 16 }).default("scheduled").notNull(), // scheduled | sent | cancelled | failed
    firedAt: timestamp("fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("schedules_due_idx").on(t.status, t.scheduledFor)],
);

export const autosaveDrafts = pgTable(
  "autosave_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    clientKey: varchar("client_key", { length: 120 }).notNull(),
    module: moduleEnum("module").default("general").notNull(),
    language: languageEnum("language"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (t) => [index("autosave_user_key_idx").on(t.userId, t.clientKey)],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id").references(() => interactions.id),
  userId: uuid("user_id").references(() => users.id),
  rating: integer("rating"),
  useful: boolean("useful"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiRequestLogs = pgTable(
  "api_request_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    method: varchar("method", { length: 8 }).notNull(),
    path: varchar("path", { length: 240 }).notNull(),
    userId: uuid("user_id"),
    role: varchar("role", { length: 32 }),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    ip: varchar("ip", { length: 64 }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_logs_created_idx").on(t.createdAt)],
);

export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id"),
  capability: varchar("capability", { length: 32 }).notNull(), // stt | tts | llm | vision | translate
  providerKey: varchar("provider_key", { length: 32 }).notNull(), // internal only, never exposed publicly
  model: varchar("model", { length: 80 }),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  audioSeconds: real("audio_seconds").default(0).notNull(),
  estimatedCostUsd: real("estimated_cost_usd").default(0).notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  success: boolean("success").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminConfig = pgTable("admin_config", {
  key: varchar("key", { length: 96 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type ModuleType = (typeof moduleEnum.enumValues)[number];
export type LanguageCode = (typeof languageEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type CaseStatus = (typeof caseStatusEnum.enumValues)[number];

/* ------------------------------------------------------------------------------------------
 * Cases: tasks, follow-ups, risk assessments, overrides, safeguarding
 * ---------------------------------------------------------------------------------------- */

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").references(() => cases.id).notNull(),
    type: varchar("type", { length: 48 }).notNull(), // acknowledge | call_citizen | field_visit | follow_up | validate_cluster | review_override
    ownerUserId: uuid("owner_user_id"),
    queue: varchar("queue", { length: 160 }),
    priority: varchar("priority", { length: 16 }).default("normal").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).default("open").notNull(), // open | acknowledged | done | cancelled
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tasks_case_idx").on(t.caseId), index("tasks_owner_idx").on(t.ownerUserId, t.status)],
);

export const followUps = pgTable("follow_ups", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").references(() => cases.id).notNull(),
  userId: uuid("user_id"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  channel: notificationChannelEnum("channel").default("sms").notNull(),
  status: varchar("status", { length: 16 }).default("scheduled").notNull(), // scheduled | captured | unreachable | cancelled
  outcome: varchar("outcome", { length: 120 }), // went_to_clinic | recovered | sprayed | quiz_passed | no_change | worse …
  outcomeText: text("outcome_text"),
  capturedAt: timestamp("captured_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const riskAssessments = pgTable("risk_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id"),
  caseId: uuid("case_id"),
  rulePackVersion: varchar("rule_pack_version", { length: 32 }).notNull(),
  triggeredRules: jsonb("triggered_rules").$type<string[]>().default([]).notNull(),
  dimensions: jsonb("dimensions").$type<Record<string, number>>().default({}).notNull(),
  band: varchar("band", { length: 32 }).notNull(),
  severityLevel: integer("severity_level").notNull(),
  score: real("score").notNull(),
  escalate: boolean("escalate").default(false).notNull(),
  reasons: jsonb("reasons").$type<string[]>().default([]).notNull(),
  supersededBy: uuid("superseded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiOverrides = pgTable("ai_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id"),
  interactionId: uuid("interaction_id"),
  workerId: uuid("worker_id").notNull(),
  field: varchar("field", { length: 48 }).notNull(),
  aiValue: text("ai_value"),
  humanValue: text("human_value"),
  reasonCode: varchar("reason_code", { length: 48 }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Restricted records: violence, abuse, exploitation, self-harm, unsafe home. Never exposed in ordinary notifications. */
export const safeguardingRecords = pgTable("safeguarding_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id"),
  caseId: uuid("case_id"),
  category: varchar("category", { length: 48 }).notNull(),
  isChild: boolean("is_child").default(false).notNull(),
  ownerRole: varchar("owner_role", { length: 32 }).default("teacher").notNull(),
  status: varchar("status", { length: 24 }).default("open").notNull(),
  restrictedNotes: text("restricted_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------------------------------
 * AI governance: protocols, prompts, model routing, knowledge base, evaluation
 * ---------------------------------------------------------------------------------------- */

export const protocolVersions = pgTable(
  "protocol_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolId: varchar("protocol_id", { length: 64 }).notNull(),
    version: varchar("version", { length: 24 }).notNull(),
    module: moduleEnum("module").default("health").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    status: lifecycleStatusEnum("status").default("draft").notNull(),
    approvedBy: varchar("approved_by", { length: 120 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("protocol_versions_idx").on(t.protocolId, t.version)],
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 96 }).notNull(),
    version: varchar("version", { length: 24 }).notNull(),
    module: moduleEnum("module").default("general").notNull(),
    body: text("body").notNull(),
    status: lifecycleStatusEnum("status").default("draft").notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("prompt_versions_idx").on(t.name, t.version)],
);

export const modelConfigs = pgTable("model_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  task: varchar("task", { length: 32 }).notNull(), // lid | stt | llm | vision | translate | tts | embed
  language: languageEnum("language"),
  primaryProvider: varchar("primary_provider", { length: 32 }).notNull(),
  primaryModel: varchar("primary_model", { length: 96 }).notNull(),
  fallbackProvider: varchar("fallback_provider", { length: 32 }),
  fallbackModel: varchar("fallback_model", { length: 96 }),
  params: jsonb("params").$type<Record<string, unknown>>().default({}).notNull(),
  acuRate: real("acu_rate").default(1).notNull(),
  isLive: boolean("is_live").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: varchar("doc_id", { length: 96 }).notNull().unique(), // stable citation key, e.g. KB-HE-IMCI-FEVER-01
    module: moduleEnum("module").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    authority: varchar("authority", { length: 160 }).notNull(),
    source: varchar("source", { length: 240 }),
    version: varchar("version", { length: 24 }).default("1.0").notNull(),
    language: languageEnum("language").default("fr").notNull(),
    geography: varchar("geography", { length: 120 }).default("RDC").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    evidenceGrade: varchar("evidence_grade", { length: 16 }).default("B").notNull(),
    status: lifecycleStatusEnum("status").default("approved").notNull(),
    approvedBy: varchar("approved_by", { length: 160 }),
    checksum: varchar("checksum", { length: 64 }),
    supersedes: varchar("supersedes", { length: 96 }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("kb_documents_module_idx").on(t.module, t.status)],
);

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").references(() => kbDocuments.id, { onDelete: "cascade" }).notNull(),
    docId: varchar("doc_id", { length: 96 }).notNull(),
    module: moduleEnum("module").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    language: languageEnum("language").default("fr").notNull(),
    checksum: varchar("checksum", { length: 64 }),
  },
  (t) => [index("kb_chunks_doc_idx").on(t.docId, t.chunkIndex)],
);

export const evaluationRuns = pgTable("evaluation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  suite: varchar("suite", { length: 96 }).notNull(), // gold_set | red_team | protocol_coverage | language_gate
  module: moduleEnum("module"),
  language: languageEnum("language"),
  modelVersion: varchar("model_version", { length: 96 }),
  promptVersion: varchar("prompt_version", { length: 48 }),
  metrics: jsonb("metrics").$type<Record<string, number>>().default({}).notNull(),
  passed: boolean("passed").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------------------------------
 * Reporting, metering, events, geography, sync
 * ---------------------------------------------------------------------------------------- */

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 64 }).notNull(),
  format: varchar("format", { length: 8 }).default("pdf").notNull(), // pdf | xlsx | csv
  scope: jsonb("scope").$type<Record<string, unknown>>().default({}).notNull(),
  period: jsonb("period").$type<{ from: string; to: string }>(),
  status: varchar("status", { length: 16 }).default("queued").notNull(), // queued | running | ready | failed
  requestedBy: uuid("requested_by"),
  definitionId: uuid("definition_id"),
  storageKey: text("storage_key"),
  sizeBytes: integer("size_bytes"),
  error: text("error"),
  purpose: varchar("purpose", { length: 120 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reportDefinitions = pgTable("report_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  format: varchar("format", { length: 8 }).default("pdf").notNull(),
  cadence: varchar("cadence", { length: 16 }).default("weekly").notNull(), // daily | weekly | monthly | quarterly
  scope: jsonb("scope").$type<Record<string, unknown>>().default({}).notNull(),
  organisationId: uuid("organisation_id"),
  recipients: jsonb("recipients").$type<string[]>().default([]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** ACU (AI Compute Unit) ledger: every AI call attributed to tenant / org / module / language / channel. */
export const acuLedger = pgTable(
  "acu_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    organisationId: uuid("organisation_id"),
    interactionId: uuid("interaction_id"),
    module: moduleEnum("module"),
    language: languageEnum("language"),
    channel: channelEnum("channel"),
    task: varchar("task", { length: 24 }).notNull(), // stt | tts | lid | llm | vision | translate | embed
    providerKey: varchar("provider_key", { length: 32 }).notNull(),
    units: real("units").default(0).notNull(),
    acu: real("acu").default(0).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("acu_ledger_time_idx").on(t.occurredAt), index("acu_ledger_tenant_idx").on(t.tenantId, t.occurredAt)],
);

/** Append-only event store (autosave, audit, replay, analytics derive from it). */
export const eventStore = pgTable(
  "event_store",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().unique(),
    eventType: varchar("event_type", { length: 96 }).notNull(), // cvos.session.turn.completed …
    eventVersion: integer("event_version").default(1).notNull(),
    aggregateType: varchar("aggregate_type", { length: 48 }),
    aggregateId: varchar("aggregate_id", { length: 64 }),
    aggregateVersion: integer("aggregate_version"),
    tenantId: uuid("tenant_id"),
    actor: jsonb("actor").$type<{ type: string; id?: string | null }>().default({ type: "system" }).notNull(),
    traceId: varchar("trace_id", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    causationId: varchar("causation_id", { length: 64 }),
    channel: channelEnum("channel"),
    language: languageEnum("language"),
    module: moduleEnum("module"),
    classification: varchar("classification", { length: 24 }).default("internal").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("event_store_type_idx").on(t.eventType, t.occurredAt), index("event_store_aggregate_idx").on(t.aggregateType, t.aggregateId)],
);

export const provinces = pgTable("provinces", {
  code: varchar("code", { length: 8 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  capital: varchar("capital", { length: 120 }),
});

export const territories = pgTable(
  "territories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provinceCode: varchar("province_code", { length: 8 }).references(() => provinces.code).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    type: varchar("type", { length: 24 }).default("territoire").notNull(), // territoire | ville | commune
  },
  (t) => [index("territories_province_idx").on(t.provinceCode)],
);

/** Referral / service directory: health centres, hospitals, veterinary posts, extension offices, schools. */
export const serviceDirectory = pgTable(
  "service_directory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 32 }).notNull(), // cs | hgr | veterinary | extension_office | school | call_centre
    name: varchar("name", { length: 200 }).notNull(),
    province: varchar("province", { length: 120 }).notNull(),
    territory: varchar("territory", { length: 120 }),
    healthZone: varchar("health_zone", { length: 120 }),
    phone: varchar("phone", { length: 32 }),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [index("service_directory_geo_idx").on(t.province, t.type)],
);

/** Idempotency for mutation endpoints and offline sync (exactly-once acceptance). */
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key", { length: 160 }).primaryKey(),
  userId: uuid("user_id"),
  requestHash: varchar("request_hash", { length: 64 }),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncEvents = pgTable(
  "sync_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(), // client-generated UUIDv7
    deviceId: varchar("device_id", { length: 96 }).notNull(),
    userId: uuid("user_id"),
    localSeq: integer("local_seq").notNull(),
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }).notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: varchar("status", { length: 16 }).default("accepted").notNull(), // accepted | applied | conflict | rejected
    conflictReason: varchar("conflict_reason", { length: 240 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sync_events_device_idx").on(t.deviceId, t.localSeq)],
);

/** Right-to-access / erasure requests (30-day SLA) and legal holds. */
export const dataRequests = pgTable("data_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 16 }).notNull(), // access | erasure
  status: varchar("status", { length: 16 }).default("open").notNull(), // open | in_progress | completed | rejected | on_hold
  method: varchar("method", { length: 24 }).default("voice").notNull(),
  legalHold: boolean("legal_hold").default(false).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Break-glass access: time-boxed, justified, alerts the data-protection owner. */
export const breakGlassAccess = pgTable("break_glass_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  justification: text("justification").notNull(),
  scope: varchar("scope", { length: 160 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------------------------------------------------------------------
 * Language learning loop — the platform learns Lingala, Kikongo, Swahili, Tshiluba and local
 * French from every conversation and from native-speaker corrections.
 * ---------------------------------------------------------------------------------------- */

export const languageCorpus = pgTable(
  "language_corpus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interactionId: uuid("interaction_id"),
    audioFileId: uuid("audio_file_id"),
    language: languageEnum("language").notNull(),
    /** What the system heard / read. */
    sourceText: text("source_text").notNull(),
    /** What the system understood (French). */
    translationFr: text("translation_fr"),
    /** Native-speaker corrections. */
    correctedSourceText: text("corrected_source_text"),
    correctedTranslationFr: text("corrected_translation_fr"),
    correctedLanguage: languageEnum("corrected_language"),
    province: varchar("province", { length: 120 }),
    intent: varchar("intent", { length: 120 }),
    module: moduleEnum("module").default("general").notNull(),
    systemConfidence: real("system_confidence"),
    /** pending → verified (correct as is) | corrected | rejected (noise) */
    reviewStatus: varchar("review_status", { length: 16 }).default("pending").notNull(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Citizen signal: "the system did not understand me". */
    citizenFlagged: boolean("citizen_flagged").default(false).notNull(),
    /** Citizen signal on the spoken answer: 1 (unclear) .. 5 (native-like). */
    speechRating: integer("speech_rating"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("corpus_lang_status_idx").on(t.language, t.reviewStatus), index("corpus_interaction_idx").on(t.interactionId)],
);

export const languageLexicon = pgTable(
  "language_lexicon",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    language: languageEnum("language").notNull(),
    term: varchar("term", { length: 160 }).notNull(),
    meaningFr: varchar("meaning_fr", { length: 240 }).notNull(),
    domain: moduleEnum("domain").default("general").notNull(),
    region: varchar("region", { length: 120 }),
    /** Optional pronunciation hint used when speaking (e.g. syllable stress). */
    pronunciation: varchar("pronunciation", { length: 160 }),
    verified: boolean("verified").default(false).notNull(),
    addedBy: uuid("added_by"),
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("lexicon_lang_term_idx").on(t.language, t.term)],
);

export type LanguageCorpusEntry = typeof languageCorpus.$inferSelect;
export type ChannelType = (typeof channelEnum.enumValues)[number];
export type Session = typeof sessions.$inferSelect;
export type KbDocument = typeof kbDocuments.$inferSelect;
export type ProtocolVersion = typeof protocolVersions.$inferSelect;
export type LexiconEntry = typeof languageLexicon.$inferSelect;

/**
 * Failed sign-in counter. Keyed by what is being attacked — an account, or an
 * address trying many accounts — so one citizen locking themselves out of a
 * shared handset cannot lock out the rest of the village.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "phone:+243…" or "ip:41.…" — never the PIN, never the full secret. */
    subject: varchar("subject", { length: 160 }).notNull().unique(),
    failures: integer("failures").default(0).notNull(),
    firstFailureAt: timestamp("first_failure_at", { withTimezone: true }).defaultNow().notNull(),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }).defaultNow().notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("auth_attempts_locked_idx").on(t.lockedUntil)],
);

/**
 * Rate-limit counters shared by every instance. The in-process limiter was
 * correct on one server and meaningless behind an autoscaler, where the real
 * ceiling was the configured limit multiplied by the instance count.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    bucket: varchar("bucket", { length: 200 }).primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).defaultNow().notNull(),
    hits: integer("hits").default(0).notNull(),
  },
  (t) => [index("rate_limit_window_idx").on(t.windowStart)],
);

export type AuthAttempt = typeof authAttempts.$inferSelect;
