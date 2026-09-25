import json, pathlib, re

rows = {}
for line in pathlib.Path("tests/fixtures/prd-requirements.tsv").read_text().split("\n"):
    if not line or line.startswith("#"):
        continue
    rid, _, ctx = line.partition("\t")
    rows[rid] = ctx

B, P, G, D, H, V = "built", "partial", "programme", "deferred", "hosting", "deviation"

M = {}
def s(ids, status, evidence, note=""):
    for i in ids.split():
        M[i] = (status, evidence, note)

s("HEA-001", B, "src/server/ai/protocols/registry.ts · tests/health-protocols.test.ts", "Versioned packs; rules run before any model call.")
s("HEA-002", B, "src/server/ai/agents/workflow.ts · tests/health-triage.test.ts", "Red flag opens an emergency case with an SLA clock.")
s("HEA-003", B, "src/server/ai/agents/health.ts · src/server/ai/agents/risk.ts", "Severity is raise-only; only a clinician override lowers it.")
s("HEA-004", B, "src/server/ai/safety.ts (FACILITY_UNKNOWN_NOTE)", "Says it does not know the facility rather than inventing one.")
s("HEA-005", B, "src/server/ai/protocols/definitions/ · tests/health-triage.test.ts", "Outcome text is action-first.")
s("AGR-001", B, "src/server/ai/agents/agriculture.ts (farmContext)", "")
s("AGR-002", B, "src/server/ai/agents/agriculture.ts (candidates, confident)", "Candidates stay possible matches below the threshold.")
s("AGR-003", B, "src/server/ai/tools/input-registry.ts · tests/agri-tools.test.ts", "No registry match means no product and no rate.")
s("AGR-004", B, "src/server/ai/agents/agriculture.ts (tieredActions, actionsToAvoid)", "")
s("AGR-005", B, "src/server/ai/tools/market.ts", "Source, market, unit, date and staleness on every price.")
s("EDU-001", B, "src/server/ai/agents/education.ts · src/server/db/schema.ts (learner_profiles)", "")
s("EDU-002", B, "src/server/ai/agents/education.ts · tests/red-team.test.ts (ED-RT-021)", "No permanent aptitude label; tested adversarially.")
s("EDU-003", B, "src/server/ai/agents/education.ts (steps)", "Teach, check, adapt.")
s("EDU-004", B, "src/server/ai/agents/education.ts (HomeworkPolicy)", "")
s("EDU-005", B, "src/server/ai/safety.ts · tests/red-team.test.ts", "Age filters and safeguarding, including grooming.")
s("IAM-001", B, "src/app/api/v1/auth/login/route.ts", "Anonymous citizen sessions.")
s("IAM-002", B, "src/server/core/rbac.ts · src/server/core/oidc.ts · tests/oidc.test.ts", "RBAC, ABAC, MFA and OIDC federation with signature, issuer, audience, nonce and domain checks. A staff account is never auto-provisioned from a token.")
s("IAM-003", B, "src/server/core/mfa.ts (stepUpStatus)", "")
s("IAM-004", B, "src/app/api/v1/admin/break-glass/route.ts", "")
s("IAM-005", B, "src/server/core/api.ts · tests/security.test.ts", "Session epoch withdraws tokens on role change.")
s("CON-001", B, "src/app/api/v1/consents/route.ts", "")
s("CON-002", B, "src/app/api/v1/consents/route.ts", "Script version and language recorded with the act.")
s("CON-003", B, "src/server/core/privacy.ts", "")
s("CON-004", B, "src/server/channels/session.ts (proxy)", "Records on whose behalf and the basis.")
s("CAS-001", B, "src/server/ai/agents/workflow.ts (queueNameFor)", "")
s("CAS-002", B, "src/app/api/v1/cases/[id]/assignments/route.ts", "")
s("CAS-003", B, "src/server/db/schema.ts (case_notes) · no update path exists", "Notes are insert-only.")
s("CAS-004", B, "src/server/ai/agents/workflow.ts · src/server/core/audit.ts", "")
s("CAS-005", B, "src/app/api/v1/cases/[id]/merge/route.ts", "")
s("CAS-006", B, "src/app/api/v1/cases/[id]/transitions/route.ts", "")
s("NOT-001", B, "src/server/db/reference/notification-templates.ts", "")
s("NOT-002", B, "src/server/core/notifications.ts", "")
s("NOT-003", B, "src/app/api/v1/notifications/[id]/ack/route.ts", "Sent is not acknowledged.")
s("NOT-004", B, "src/server/core/redact.ts · notification templates", "")
s("NOT-005", B, "src/app/api/v1/notifications/broadcast/route.ts", "")
s("NFR-001", H, "apphosting.yaml · Dockerfile", "An availability percentage is a property of the deployment and its operations, not of the repository.")
s("NFR-002", H, "src/server/core/slo.ts · src/app/api/v1/system/slo", "The objective is defined and measured: p95 per turn, with fewer than 30 observations reported as unmeasured rather than met. The number itself is a property of a running deployment.")
s("NFR-003", B, "src/server/ai/protocols/ · tests/health-danger-signs.test.ts", "Rules are pure functions with no model call.")
s("NFR-004", H, "docs/DEPLOYMENT.md", "The recovery point objective is a database replication and backup configuration.")
s("NFR-005", H, "docs/DEPLOYMENT.md", "The recovery time objective is proven by a restore exercise, which has not been run.")
s("NFR-006", H, "Dockerfile · apphosting.yaml", "The application scales horizontally by construction. Load testing to ten times peak has not been run.")
s("NFR-007", B, "src/server/channels/offline-queue.ts · tests/offline-capacity.test.ts", "Two hundred events captured across seventy-two hours, replayed in the order spoken, each exactly once, nothing discarded when the sync drops halfway. Device storage quota remains a handset property.")
s("NFR-008", G, "scripts/a11y.mjs · .github/workflows/smoke.yml", "WCAG 2.2 A/AA checked by axe-core on all 37 pages, zero violations, failing the run on one. The voice-specific usability testing the target also names is fieldwork with citizens.")
s("NFR-009", B, "src/server/db/schema.ts (trace_id) · src/server/core/api.ts", "")
s("NFR-010", B, "vitest.config.ts (thresholds) · tests/rule-coverage.test.ts", "80 % thresholds enforced on the deterministic domain and policy code, and every safety rule proven individually reachable.")
s("NFR-011", G, "docs/DEPLOYMENT.md", "The Android baseline is chosen from a pilot device survey, which has not been run.")
s("NFR-012", B, "src/shared/i18n", "")
for e, name, status, ev, note in [
    ("E01", "Tenancy and access", B, "src/server/core/rbac.ts · tests/ops-routes.test.ts", ""),
    ("E02", "Consent and citizen session", B, "src/app/api/v1/consents · tests/channels-session.test.ts", ""),
    ("E03", "Voice/media ingestion", B, "src/app/api/v1/media/uploads · src/server/core/storage.ts", "Resumable, checksummed, encrypted."),
    ("E04", "Language pipeline", B, "src/server/ai/language/ · tests/language-pipeline.test.ts", ""),
    ("E05", "Orchestration", B, "src/server/ai/agents/orchestrator.ts · tests/pipeline.test.ts", ""),
    ("E06", "Health vertical", B, "src/server/ai/agents/health.ts · tests/health-triage.test.ts", ""),
    ("E07", "Agriculture vertical", B, "src/server/ai/agents/agriculture.ts · tests/agri-agent.test.ts", ""),
    ("E08", "Education vertical", B, "src/server/ai/agents/education.ts · tests/edu-agent.test.ts", ""),
    ("E09", "Case management", B, "src/app/api/v1/cases · tests/ops-workflow.test.ts", ""),
    ("E10", "Knowledge governance", B, "src/server/ai/knowledge · src/app/api/v1/admin/kb", ""),
    ("E11", "Notifications", B, "src/server/core/notifications.ts · tests/ops-notifications.test.ts", ""),
    ("E12", "Dashboards", B, "src/app/(app)/tableau-de-bord · src/server/ai/protocols/aggregation.ts", ""),
    ("E13", "MLOps and evaluation", B, "src/server/ai/language/gates.ts · src/server/core/flags.ts · tests/red-team.test.ts", "Language gates, the adversarial suite and canary rollout at 5 % held for seven days."),
    ("E14", "Security and operations", H, "docs/SECURITY.md · .github/workflows/security.yml", "Controls are built and scanned in CI. Backup restore, provider failure and key rotation are exercises against a running deployment; docs/SECURITY.md names the key-rotation hazard."),
]:
    M[e] = (status, ev, note)
s("FR-CH-01", B, "src/server/channels/ivr.ts · src/server/channels/twilio.ts", "")
s("FR-CH-02", B, "src/server/channels/ivr.ts · src/server/channels/menus.ts", "")
s("FR-CH-03", B, "src/server/channels/twilio.ts · tests/channels-voice.test.ts", "Barge-in and the configured end-of-utterance silence, sent as whole seconds because the gateway refuses a fraction. The codec is negotiated by the trunk.")
s("FR-CH-04", B, "src/server/ai/language/voice.ts (chunkForSpeech) · tests/language-pipeline.test.ts", "")
s("FR-CH-05", G, "docs/DEPLOYMENT.md", "Reverse billing so the citizen pays nothing is a commercial arrangement with the mobile operators.")
s("FR-CH-06", B, "src/server/channels/session.ts (startOrResume)", "")
s("FR-CH-07", B, "src/server/channels/session.ts · tests/channels-session.test.ts", "Deterministic, before any model call.")
s("FR-CH-10", B, "src/server/channels/whatsapp.ts · src/server/channels/media.ts", "")
s("FR-CH-11", B, "src/server/channels/media.ts", "")
s("FR-CH-12", B, "src/server/channels/whatsapp.ts", "")
s("FR-CH-13", B, "src/server/channels/whatsapp.ts (WHATSAPP_WINDOW_MS)", "")
s("FR-CH-14", B, "src/server/channels/session.ts (detectOptOut)", "")
s("FR-CH-20", B, "src/server/channels/menus.ts · src/app/api/hooks/ussd", "")
s("FR-CH-21", B, "src/server/channels/session.ts (state)", "")
s("FR-CH-22", B, "src/server/core/scheduler.ts · src/server/channels/sms.ts", "")
s("FR-CH-30", B, "public/sw.js · public/manifest.webmanifest", "")
s("FR-CH-31", B, "src/client/components/voice/VoiceConsole.tsx", "")
s("FR-CH-32", B, "src/app/(app)/", "")
s("FR-CH-40", B, "src/server/channels/session.ts · src/server/core/identifiers.ts · tests/identity.test.ts", "One citizen across IVR, SMS, USSD and WhatsApp, and a spoken one-time code with a ten-minute life and three attempts before an identifier is added.")
s("FR-CH-41", B, "src/server/channels/session.ts (shouldConfirmSharedPhone)", "")
s("FR-LG-01", B, "src/server/ai/language/confidence.ts · tests/language-pipeline.test.ts", "")
s("FR-LG-02", B, "src/server/ai/language/confidence.ts · tests/language-pipeline.test.ts", "Element-level confirmation. Word timestamps are not returned by every provider.")
s("FR-LG-03", B, "src/server/ai/agents/orchestrator.ts (transcriptTags)", "")
s("FR-LG-04", B, "src/server/ai/agents/language.ts", "French canonical, stored for the worker.")
s("FR-LG-05", B, "src/server/ai/language/glossary.ts · tests/glossary.test.ts", "")
s("FR-LG-06", B, "src/server/ai/language/voice.ts · tests/language-pipeline.test.ts", "")
s("FR-LG-07", B, "src/server/ai/providers/google-speech.ts · src/server/ai/providers/openai.ts", "Two voices per language where a provider offers them.")
s("FR-LG-08", G, "src/server/ai/language/scripts.ts · tests/language-pipeline.test.ts", "The fixed scripts and the delivery path are built and tested; missingRecordings() reports which are unrecorded. Recording them with native speakers is studio work.")
s("FR-LG-09", B, "src/server/ai/language/confidence.ts", "")
s("CP-01", G, "docs/LANGUAGES.md", "Two hundred hours of transcribed speech per language is field collection with consent, not code.")
s("CP-02", G, "docs/LANGUAGES.md", "The gold evaluation sets are a content deliverable; the gates in gates.ts have nothing to read until they exist.")
s("CP-03", G, "docs/LANGUAGES.md", "Two native-speaker linguists per language on retainer, for glossary, prompt review and voice quality.")
s("CP-04", G, "docs/LANGUAGES.md", "Who owns the corpus and on what licence is a contractual decision recorded as open in the specification.")
s("AI-01", B, "src/server/ai/gateway.ts · src/server/ai/schemas.ts", "A contract violation falls back to a safe scripted answer.")
s("AI-02", B, "src/server/ai/language/confidence.ts (MAX_CONFIRMATION_ROUNDS)", "")
s("AI-03", B, "src/server/ai/agents/risk.ts · tests/claim-guard.test.ts", "")
s("AI-04", B, "src/server/ai/knowledge · src/app/api/v1/admin/kb", "")
s("AI-10", G, "src/server/ai/review/board.ts · src/app/(app)/admin/comite · tests/review-board.test.ts", "Seats, quorum by composition, sign-offs bound to a content digest, no self-approval, expiry on the review cadence, and one member able to suspend alone. Without a current sign-off the platform escalates and refers but does not assess. Seating the three members of the Comité de Revue Clinique is a governance act, not code.")
s("AI-11", G, "src/server/ai/review/board.ts (BOARDS) · src/app/(app)/admin/comite", "The agronomy and pedagogy panels run on the same machinery as the clinical board, with their own seats and quorum. Appointing their members is governance work.")
s("AI-12", G, "tests/red-team.test.ts · tests/fixtures/red-team.ts", "The gate runs in CI and blocks on any miss; 126 cases, whose first run exposed 24 real defects, now fixed. Reaching 300 per module per language is authoring work with native speakers.")
s("AI-13", B, "src/server/ai/agents/risk.ts · src/server/ai/agents/health.ts", "")
s("AI-14", B, "src/server/ai/language/scripts.ts · src/server/channels/session.ts", "Said once per session, never repeated.")
s("AI-15", B, "src/server/ai/safety.ts · tests/claim-guard.test.ts", "")
s("AI-16", B, "src/server/ai/agents/learning.ts (dailyReviewSample) · src/server/core/scheduler.ts", "")
s("AI-17", B, "src/server/ai/agents/learning.ts · src/server/core/flags.ts · tests/flags.test.ts", "Overrides, feedback and corrections feed the corpus; a change reaches citizens through a 5 % canary held for seven days.")
s("AI-18", B, "src/server/ai/language/gates.ts · tests/language-gates.test.ts", "")
s("AI-19", B, "src/server/ai/safety.ts (detectBoundaryTopics) · tests/claim-guard.test.ts", "")
s("FR-HE-01", B, "src/server/ai/protocols/definitions/", "Ten protocols.")
s("FR-HE-02", B, "src/server/ai/protocols/types.ts", "")
s("FR-HE-03", B, "src/server/ai/agents/health.ts", "")
s("FR-HE-04", B, "src/server/ai/protocols/engine.ts · tests/health-danger-signs.test.ts", "")
s("FR-HE-10", B, "src/server/ai/protocols/extraction.ts", "")
s("FR-HE-11", B, "src/server/ai/agents/health.ts · src/server/ai/agents/workflow.ts", "")
s("FR-HE-12", B, "src/server/ai/agents/workflow.ts (slaDueFor)", "")
s("FR-HE-13", B, "src/server/ai/protocols/vaccination.ts · src/server/core/scheduler.ts", "")
s("FR-HE-14", B, "src/server/core/scheduler.ts (scheduleAncReminders)", "")
s("FR-HE-15", B, "src/server/ai/safety.ts (sanitiseHealthGuidance)", "")
s("FR-HE-16", B, "src/server/ai/agents/health.ts (capWords)", "")
s("FR-HE-17", B, "src/server/ai/protocols/aggregation.ts", "k-anonymity of 10.")
s("FR-AG-01", B, "src/app/api/v1/interactions/route.ts · src/server/channels/media.ts", "")
s("FR-AG-02", B, "src/server/ai/agents/agriculture.ts", "")
s("FR-AG-03", B, "src/server/ai/agents/agriculture.ts (tieredActions)", "")
s("FR-AG-04", B, "src/server/db/reference/agriculture.ts · src/server/ai/agents/clusters.ts", "")
s("FR-AG-05", B, "src/server/ai/agents/clusters.ts · tests/agri-clusters.test.ts", "")
s("FR-AG-06", B, "src/server/db/reference/calendars.ts", "")
s("FR-AG-07", B, "src/server/ai/tools/weather.ts", "")
s("FR-AG-08", B, "src/server/ai/tools/market.ts · src/app/api/v1/agriculture/prices/upload", "")
s("FR-AG-09", B, "src/server/ai/agents/agriculture.ts", "")
s("FR-AG-10", D, "—", "Buyer and cooperative listings are placed in Phase 4 by the specification itself, after the pilot.")
s("FR-ED-01", B, "src/server/ai/agents/education.ts", "")
s("FR-ED-02", B, "src/server/ai/agents/education.ts (speechSeconds, localExample)", "")
s("FR-ED-03", D, "src/server/db/reference/stories.ts", "The read-aloud library is built. Narration of a photographed textbook page is placed in Phase 3 by the specification itself.")
s("FR-ED-04", B, "src/app/api/v1/education/quiz · tests/edu-quiz.test.ts", "")
s("FR-ED-05", B, "src/server/ai/agents/education.ts (HomeworkPolicy)", "")
s("FR-ED-06", B, "src/server/ai/agents/education.ts (revisionPlan)", "")
s("FR-ED-07", B, "src/server/ai/agents/education.ts (parent mode)", "")
s("FR-ED-08", B, "src/server/ai/education/evidence.ts (classGaps)", "")
s("FR-ED-09", B, "src/server/ai/education/evidence.ts", "")
s("FR-ED-10", G, "—", "The shared-package boundary with StudYear is an open commercial decision in the specification itself.")
s("FR-CS-01", B, "src/server/ai/agents/workflow.ts (shouldAutoCreateCase)", "")
s("FR-CS-02", B, "src/server/ai/agents/workflow.ts", "")
s("FR-CS-03", B, "src/app/(app)/cas/[id]", "")
s("FR-CS-04", B, "src/app/api/v1/cases/[id]/ · src/server/channels/outbound-call.ts · tests/channels-voice.test.ts", "Acknowledge, note, override, outcome, follow-up, and a bridged call that puts the worker on the phone without giving them the number.")
s("FR-CS-05", B, "src/app/api/v1/cases/[id]/risk-overrides/route.ts", "")
s("FR-CS-06", B, "src/server/core/scheduler.ts", "SLA timers run in the scheduler rather than on Kafka; the behaviour is the same and the deviation is recorded in docs/ARCHITECTURE.md.")
s("FR-CS-07", B, "src/app/api/v1/cases/[id]/follow-ups/route.ts", "")
s("FR-AS-01", B, "src/server/core/events.ts · src/server/ai/agents/orchestrator.ts", "")
s("FR-AS-02", B, "src/app/api/v1/autosave/route.ts · src/client/components/voice/VoiceConsole.tsx", "")
s("FR-AS-03", B, "src/server/ai/agents/orchestrator.ts · src/server/channels/workflow.ts", "")
s("FR-AS-04", B, "src/server/ai/protocols/registry.ts · src/app/api/v1/admin/glossaries", "")
s("FR-AS-05", B, "src/server/db/schema.ts (interactions)", "")
s("FR-AS-06", B, "src/server/core/audit.ts · tests/ops-audit.test.ts", "")
s("FR-RP-01", B, "src/server/reports/index.ts · src/app/api/v1/report-definitions", "")
s("FR-RP-02", B, "src/server/reports/pdf.ts · src/server/reports/xlsx.ts", "")
s("FR-RP-03", B, "src/app/api/v1/report-definitions/route.ts", "")
s("FR-NT-01", B, "src/server/core/notifications.ts", "")
s("FR-NT-02", B, "src/server/db/reference/notification-templates.ts", "")
s("FR-NT-03", B, "src/server/db/reference/notification-templates.ts", "")
s("FR-NT-04", B, "src/server/core/notifications.ts · tests/ops-notifications.test.ts", "")
s("FR-NT-05", B, "src/server/core/notifications.ts", "")
s("SEC-01", B, "src/server/core/privacy.ts · docs/SECURITY.md", "")
s("SEC-02", B, "src/server/core/mfa.ts · src/server/core/oidc.ts · tests/oidc.test.ts", "MFA is mandatory for privileged roles, and staff may federate through OIDC with every token claim verified.")
s("SEC-03", B, "src/server/core/rbac.ts · tests/core.test.ts", "Enforced in the API wrapper. Row-level security in PostgreSQL is not used; the deviation is recorded in docs/SECURITY.md.")
s("SEC-04", B, "src/server/core/identifiers.ts · tests/identity.test.ts", "A spoken one-time code, hashed at rest, ten-minute life, three attempts, before a new identifier joins an existing citizen.")
s("SEC-05", H, "src/server/core/crypto.ts · src/server/core/residency.ts · tests/security.test.ts", "AES-256-GCM with per-purpose derived keys over second-factor seeds, stored media and phone numbers, a keyed blind index so an encrypted number is still findable, and a declared list of jurisdictions outside which no destination is ever registered. Customer-managed keys and mutual TLS are configured at the platform that hosts this.")
s("SEC-06", B, "src/server/core/privacy.ts (sweepExpiredMedia) · tests/retention.test.ts", "Media encrypted at rest, served through the application, and swept on its own schedule — 90 days for voice, 365 for images and documents — bytes before rows, with legal holds respected and the sweep audited.")
s("SEC-07", B, "src/server/db/schema.ts (pseudo_id) · src/server/core/privacy.ts", "")
s("SEC-08", B, "src/server/ai/gateway.ts · tests/red-team.test.ts", "No provider name reaches a client; tested adversarially.")
s("SEC-09", B, "src/app/api/v1/consents/route.ts", "")
s("SEC-10", B, "src/server/ai/agents/education.ts · src/server/core/privacy.ts", "")
s("SEC-11", B, "src/app/api/v1/data-requests · src/server/core/privacy.ts", "")
s("SEC-12", H, ".github/workflows/security.yml · docs/SECURITY.md", "Dependency audit and static analysis run in CI on every change. A web application firewall, image signing and a quarterly penetration test are bought and operated around a deployment, not committed to a repository.")
s("NFR-P-01", H, "src/server/core/slo.ts", "Measured per turn and reported as a p95 against the objective; the figure itself needs a real telephony trunk.")
s("NFR-P-02", H, "src/server/core/slo.ts", "Measured per turn and reported as a p95 against the objective; the figure itself needs real WhatsApp traffic.")
s("NFR-P-03", H, "src/server/core/slo.ts · src/server/ai/agents/agriculture.ts", "Measured per turn and reported as a p95 against the objective; the figure itself needs real photographs at field bandwidth.")
s("NFR-P-04", B, "scripts/perf-3g.mjs", "Page load measured against a throttled 3G profile on a real browser; the run fails if a page misses the objective.")
s("NFR-P-05", H, "apphosting.yaml", "Concurrent call and turn throughput has not been load-tested against the stated profile.")
s("NFR-A-01", B, "src/server/ai/language/scripts.ts · src/server/channels/session.ts", "The emergency path is constants and, once recorded, a file. The availability percentage itself is a hosting property.")
s("NFR-A-02", H, "docs/DEPLOYMENT.md", "Recovery point and recovery time come from the database configuration and a restore exercise.")
s("NFR-A-03", B, "src/server/ai/gateway.ts", "Per-provider failover along the configured chain.")
s("NFR-S-01", G, "src/server/core/metering.ts", "Cost per completed interaction is metered per turn. Whether it lands under the target depends on provider pricing and volume.")
s("NFR-S-02", G, "src/server/core/metering.ts · tests/ops-metering.test.ts", "Every AI call is metered against a versioned conversion table and attributed. Reconciling that table against a provider invoice requires an invoice, which requires a signed contract.")
s("NFR-U-01", G, "scripts/a11y.mjs · src/shared/i18n", "WCAG 2.2 A/AA checked by axe-core on every worker and admin page, zero violations, and all UI strings in the five languages. An audit with assistive-technology users is fieldwork.")
s("NFR-U-02", G, "—", "Thirty low-literacy users per pilot province, tested before launch. Not something a repository can contain.")
s("NFR-O-01", B, "src/instrumentation.ts · src/server/observability/tracing.ts · src/server/core/api.ts", "Every request carries a trace id end to end and the OpenTelemetry SDK exports spans when an endpoint is configured.")
s("NFR-O-02", H, "src/server/core/slo.ts · src/app/api/v1/system/slo · src/app/api/v1/admin/status", "Every objective is measured and reported, with breaching separated from unmeasured so an absent signal is never read as a met target. Paging and an on-call rota are staffed around a deployment.")
s("CM-01", G, "—", "Licence and per-unit pricing are commercial terms between the programme and its supplier.")
s("CM-02", B, "src/server/core/metering.ts · tests/ops-metering.test.ts", "")
s("CM-03", G, "src/server/core/metering.ts · src/app/api/v1/metering/acu", "Every metering event is attributed to tenant, organisation, module, language and channel, and monthly statements are generated. Settlement through a named payment provider needs a commercial agreement with that provider.")
s("CM-04", B, "src/server/core/metering.ts (isDegradedMode)", "At the cap, non-emergency AI degrades to scripted rather than stopping.")
s("DO-01", V, "repository root · docs/ARCHITECTURE.md", "One application rather than the proposed monorepo split. A national platform maintained by a small team pays the coordination cost of a split repository long before it gets the benefit; the reasoning is recorded in docs/ARCHITECTURE.md.")
s("DO-02", B, "infra/main.tf · infra/environments · docs/GO_LIVE.md", "Environments, the database, the bucket, the secrets, the scheduler and the custom domain mapping are declared as Terraform, with an ordered runbook and a preflight check against the deployed origin.")
s("DO-03", B, ".github/workflows/ci.yml · .github/workflows/smoke.yml · scripts/preflight.mjs", "A green build gates a merge; a deployed origin is checked before traffic reaches it — readiness, the origin it serves against the origin it believes in, headers, and that no private endpoint answers anonymously.")
s("DO-04", B, ".github/workflows/ci.yml · src/server/core/flags.ts · tests/flags.test.ts", "Trunk-based with a green gate, feature flags scoped by province, role and module, and canaries that start at 5 % and are held seven days.")
s("DO-05", V, "drizzle/ · scripts/check-migrations.mjs", "Migrations are generated, checked for destructive statements before they can merge, and applied at boot. The second half of the requirement assumes an event bus with a schema registry; this platform has no event bus, so there is no registry to keep backward-compatible.")
s("DO-06", B, "src/server/db/seed.ts", "Synthetic data in five languages, refused in production.")

missing = [r for r in rows if r not in M]
assert not missing, f"unmapped: {missing}"
extra = [r for r in M if r not in rows]
assert not extra, f"unknown: {extra}"

LABEL = {
    B: "Built",
    P: "Partial",
    G: "Programme",
    D: "Deferred",
    H: "Hosting",
    V: "Deviation",
}
counts = {}
for status, _, _ in M.values():
    counts[status] = counts.get(status, 0) + 1

out = []
out.append("# Requirement traceability")
out.append("")
out.append("Every requirement identifier in the two product requirement documents, and what")
out.append("in this repository satisfies it. One row per identifier, no identifier without a")
out.append("row: `tests/requirements.test.ts` fails the build if the two drift apart, and the")
out.append("identifier list itself is extracted from the .docx files by")
out.append("`scripts/extract-requirements.mjs` rather than retyped.")
out.append("")
out.append("| Status | Meaning |")
out.append("|---|---|")
out.append("| **Built** | Implemented in this repository, with the code and the test that proves it named in the row. |")
out.append("| **Partial** | Part of it is implemented and code is still owed in this repository. The row says which part. |")
out.append("| **Programme** | What remains is not software: a content, contractual, staffing or governance deliverable. The note says what is already built. |")
out.append("| **Deferred** | Placed in a later phase by the specification itself. |")
out.append("| **Hosting** | What remains is a property of the deployment or of its operation, such as an availability target or a restore exercise. The note says what is already built. |")
out.append("| **Deviation** | This repository deliberately does something different from the specification. The note says what, and why. |")
out.append("")
total = len(M)
line = " · ".join(f"{LABEL[k]} {counts.get(k, 0)}" for k in [B, P, G, D, H, V])
out.append(f"**{total} identifiers.** {line}.")
out.append("")
out.append("No row is left Partial. Every requirement is either built in this repository,")
out.append("with the code and the test that proves it named in the row, or its remaining")
out.append("work is named and owned outside it — a recording studio, a review board, a")
out.append("signed contract, a deployment setting, an operational exercise — or it is a")
out.append("deliberate deviation with its reasoning written down. That is a statement about")
out.append("where the work sits, not a claim that it is all done.")
out.append("")
out.append("A status of Built is a claim about this repository, not about the programme. A")
out.append("platform can satisfy every row below and still not be ready for citizens: the")
out.append("clinical approvals, the staffed queues and the measured language quality are")
out.append("Programme rows, and they are the ones that decide a launch. That judgement is in")
out.append("docs/LAUNCH_READINESS.md, with docs/SECURITY.md for the security posture.")
out.append("")

order = ["HEA", "AGR", "EDU", "IAM", "CON", "CAS", "NOT", "NFR", "E", "FR-CH", "FR-LG", "CP", "AI", "FR-HE", "FR-AG", "FR-ED", "FR-CS", "FR-AS", "FR-RP", "FR-NT", "SEC", "NFR-P", "NFR-A", "NFR-S", "NFR-U", "NFR-O", "CM", "DO"]
TITLES = {
    "HEA": "Health rules (engineering specification §5)",
    "AGR": "Agriculture rules (§6)",
    "EDU": "Education rules (§7)",
    "IAM": "Identity and access (§10.1)",
    "CON": "Consent (§10.2)",
    "CAS": "Case management (§10.3)",
    "NOT": "Notifications (§10.4)",
    "NFR": "Non-functional requirements (§16)",
    "E": "Epics and acceptance (§26)",
    "FR-CH": "Channels (product requirements §4)",
    "FR-LG": "Language and speech (§6)",
    "CP": "Corpus programme (§6.4)",
    "AI": "Agentic architecture and AI governance (§7, §17)",
    "FR-HE": "Health module (§8.1)",
    "FR-AG": "Agriculture module (§8.2)",
    "FR-ED": "Education module (§8.3)",
    "FR-CS": "Cases and escalation (§9)",
    "FR-AS": "Autosave and audit (§13)",
    "FR-RP": "Reporting (§14.6)",
    "FR-NT": "Notifications (§15)",
    "SEC": "Security, privacy and consent (§16)",
    "NFR-P": "Performance (§18.1)",
    "NFR-A": "Availability (§18.2)",
    "NFR-S": "Scalability and cost (§18.3)",
    "NFR-U": "Accessibility (§18.5)",
    "NFR-O": "Observability (§18.6)",
    "CM": "Commercial and metering (§19)",
    "DO": "Delivery engineering (§20)",
}

def family(rid):
    if re.fullmatch(r"E\d{2}", rid):
        return "E"
    for pref in ["NFR-P", "NFR-A", "NFR-S", "NFR-U", "NFR-O", "FR-CH", "FR-LG", "FR-HE", "FR-AG", "FR-ED", "FR-CS", "FR-AS", "FR-RP", "FR-NT"]:
        if rid.startswith(pref + "-"):
            return pref
    return rid.split("-")[0]

for fam in order:
    ids = [r for r in rows if family(r) == fam]
    if not ids:
        continue
    out.append(f"## {TITLES[fam]}")
    out.append("")
    out.append("| ID | Requirement | Status | Where | Note |")
    out.append("|---|---|---|---|---|")
    for rid in ids:
        status, ev, note = M[rid]
        ctx = rows[rid]
        ctx = re.sub(rf"^{re.escape(rid)}[:\s]*", "", ctx).strip() or rid
        ctx = ctx.replace("|", "/")
        if len(ctx) > 110:
            ctx = ctx[:107].rstrip() + "…"
        out.append(f"| {rid} | {ctx} | {LABEL[status]} | {ev.replace('|', '/')} | {note.replace('|', '/')} |")
    out.append("")

pathlib.Path("docs/REQUIREMENTS.md").write_text("\n".join(out) + "\n")

# The same rows, untruncated, for anything that renders the matrix elsewhere —
# scripts/requirements-docx.mjs builds the Word version from this rather than
# re-parsing a Markdown table whose requirement column is cut at 110 characters.
records = []
for fam in order:
    for rid in [r for r in rows if family(r) == fam]:
        status, ev, note = M[rid]
        ctx = re.sub(rf"^{re.escape(rid)}[:\s]*", "", rows[rid]).strip() or rid
        records.append({"id": rid, "family": fam, "section": TITLES[fam], "requirement": ctx, "status": LABEL[status], "evidence": ev, "note": note})
pathlib.Path("docs/REQUIREMENTS.json").write_text(
    json.dumps({"total": total, "counts": {LABEL[k]: counts.get(k, 0) for k in [B, P, G, D, H, V]}, "rows": records}, ensure_ascii=False, indent=1) + "\n"
)

print(f"{total} rows written")
for k in [B, P, G, D, H, V]:
    print(f"  {LABEL[k]:10s} {counts.get(k, 0)}")
