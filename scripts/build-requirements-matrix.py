import pathlib, re

rows = {}
for line in pathlib.Path("tests/fixtures/prd-requirements.tsv").read_text().split("\n"):
    if not line or line.startswith("#"):
        continue
    rid, _, ctx = line.partition("\t")
    rows[rid] = ctx

B, P, G, D, H = "built", "partial", "programme", "deferred", "hosting"

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
s("IAM-002", P, "src/server/core/rbac.ts · src/server/core/mfa.ts", "RBAC, ABAC and MFA built. Federated identity (OIDC) is not: staff sign in against this application.")
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
s("NFR-002", P, "src/server/db/schema.ts (latency_ms) · scripts/smoke.mjs", "Latency is measured per turn. The percentile target needs production traffic.")
s("NFR-003", B, "src/server/ai/protocols/ · tests/health-danger-signs.test.ts", "Rules are pure functions with no model call.")
s("NFR-004", H, "docs/DEPLOYMENT.md", "The recovery point objective is a database replication and backup configuration.")
s("NFR-005", H, "docs/DEPLOYMENT.md", "The recovery time objective is proven by a restore exercise, which has not been run.")
s("NFR-006", H, "Dockerfile · apphosting.yaml", "The application scales horizontally by construction. Load testing to ten times peak has not been run.")
s("NFR-007", P, "public/sw.js · src/server/channels/offline-queue.ts", "Offline capture and replay are built. The 72-hour and 200-event figures are unverified on a real handset.")
s("NFR-008", P, "src/app/(app) · src/app/(public)", "Built to the standard; no independent accessibility audit has been done.")
s("NFR-009", B, "src/server/db/schema.ts (trace_id) · src/server/core/api.ts", "")
s("NFR-010", P, ".github/workflows/ci.yml · tests/", "Rule packs are covered by table-driven tests. No coverage percentage is enforced in CI.")
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
    ("E13", "MLOps and evaluation", P, "src/server/ai/language/gates.ts · tests/red-team.test.ts", "Gates and the adversarial suite are built and block CI. Canary rollout is not."),
    ("E14", "Security and operations", P, "docs/SECURITY.md · .github/workflows/ci.yml", "Controls are built. Backup restore, provider failure and key rotation have not been exercised."),
]:
    M[e] = (status, ev, note)
s("FR-CH-01", B, "src/server/channels/ivr.ts · src/server/channels/twilio.ts", "")
s("FR-CH-02", B, "src/server/channels/ivr.ts · src/server/channels/menus.ts", "")
s("FR-CH-03", P, "src/server/channels/twilio.ts", "Codec and barge-in are negotiated by the telephony provider; the 800 ms end-of-utterance value is not tuned against a real trunk.")
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
s("FR-CH-40", P, "src/server/channels/session.ts (citizen_identifiers)", "Identifiers are linked to one citizen id. Merging them by voice one-time code is not implemented.")
s("FR-CH-41", B, "src/server/channels/session.ts (shouldConfirmSharedPhone)", "")
s("FR-LG-01", B, "src/server/ai/language/confidence.ts · tests/language-pipeline.test.ts", "")
s("FR-LG-02", B, "src/server/ai/language/confidence.ts · tests/language-pipeline.test.ts", "Element-level confirmation. Word timestamps are not returned by every provider.")
s("FR-LG-03", B, "src/server/ai/agents/orchestrator.ts (transcriptTags)", "")
s("FR-LG-04", B, "src/server/ai/agents/language.ts", "French canonical, stored for the worker.")
s("FR-LG-05", B, "src/server/ai/language/glossary.ts · tests/glossary.test.ts", "")
s("FR-LG-06", B, "src/server/ai/language/voice.ts · tests/language-pipeline.test.ts", "")
s("FR-LG-07", B, "src/server/ai/providers/google-speech.ts · src/server/ai/providers/openai.ts", "Two voices per language where a provider offers them.")
s("FR-LG-08", P, "src/server/ai/language/scripts.ts · tests/language-pipeline.test.ts", "The fixed scripts and the delivery path are built. No recordings have been made yet; missingRecordings() reports the gap.")
s("FR-LG-09", B, "src/server/ai/language/confidence.ts", "")
s("CP-01", G, "docs/LANGUAGES.md", "Two hundred hours of transcribed speech per language is field collection with consent, not code.")
s("CP-02", G, "docs/LANGUAGES.md", "The gold evaluation sets are a content deliverable; the gates in gates.ts have nothing to read until they exist.")
s("CP-03", G, "docs/LANGUAGES.md", "Two native-speaker linguists per language on retainer, for glossary, prompt review and voice quality.")
s("CP-04", G, "docs/LANGUAGES.md", "Who owns the corpus and on what licence is a contractual decision recorded as open in the specification.")
s("AI-01", B, "src/server/ai/gateway.ts · src/server/ai/schemas.ts", "A contract violation falls back to a safe scripted answer.")
s("AI-02", B, "src/server/ai/language/confidence.ts (MAX_CONFIRMATION_ROUNDS)", "")
s("AI-03", B, "src/server/ai/agents/risk.ts · tests/claim-guard.test.ts", "")
s("AI-04", B, "src/server/ai/knowledge · src/app/api/v1/admin/kb", "")
s("AI-10", P, "src/server/ai/protocols/registry.ts", "The approval mechanism is built and every version records an approver. No clinical review board has been constituted; protocols carry a placeholder approver.")
s("AI-11", G, "src/server/ai/knowledge", "The approval mechanism exists for every knowledge document. Constituting agronomy and pedagogy panels is governance work.")
s("AI-12", P, "tests/red-team.test.ts · tests/fixtures/red-team.ts", "The gate runs in CI and blocks on any miss. 35 seed cases against the 300 per module per language the specification asks for.")
s("AI-13", B, "src/server/ai/agents/risk.ts · src/server/ai/agents/health.ts", "")
s("AI-14", B, "src/server/ai/language/scripts.ts · src/server/channels/session.ts", "Said once per session, never repeated.")
s("AI-15", B, "src/server/ai/safety.ts · tests/claim-guard.test.ts", "")
s("AI-16", B, "src/server/ai/agents/learning.ts (dailyReviewSample) · src/server/core/scheduler.ts", "")
s("AI-17", P, "src/server/ai/agents/learning.ts", "Overrides, feedback and corrections feed the corpus. Canary rollout at 5 % for seven days is not implemented.")
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
s("FR-ED-03", P, "src/server/db/reference/stories.ts", "The read-aloud library is built. Narration of a photographed textbook page is Phase 3 in the specification.")
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
s("FR-CS-04", P, "src/app/api/v1/cases/[id]/", "Acknowledge, note, override, outcome and follow-up are built. Click-to-call through an IVR bridge is not.")
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
s("SEC-02", P, "src/server/core/mfa.ts", "MFA is mandatory for privileged roles. Federated identity is not implemented.")
s("SEC-03", B, "src/server/core/rbac.ts · tests/core.test.ts", "Enforced in the API wrapper. Row-level security in PostgreSQL is not used; the deviation is recorded in docs/SECURITY.md.")
s("SEC-04", P, "src/server/channels/session.ts", "Channel identity is built. A voice one-time code for identifier merges is not.")
s("SEC-05", P, "src/server/core/crypto.ts · tests/security.test.ts", "Second-factor seeds and stored media are encrypted by the application. Phone numbers are not; customer-managed keys and service-to-service mutual TLS are deployment concerns.")
s("SEC-06", P, "src/server/core/storage.ts · docs/DEPLOYMENT.md", "Media is encrypted at rest and served through the application. Bucket retention is a deployment setting.")
s("SEC-07", B, "src/server/db/schema.ts (pseudo_id) · src/server/core/privacy.ts", "")
s("SEC-08", B, "src/server/ai/gateway.ts · tests/red-team.test.ts", "No provider name reaches a client; tested adversarially.")
s("SEC-09", B, "src/app/api/v1/consents/route.ts", "")
s("SEC-10", B, "src/server/ai/agents/education.ts · src/server/core/privacy.ts", "")
s("SEC-11", B, "src/app/api/v1/data-requests · src/server/core/privacy.ts", "")
s("SEC-12", P, ".github/workflows/ci.yml · docs/SECURITY.md", "Dependency audit runs in CI. Web application firewall, image signing and an independent penetration test are deployment and programme work.")
s("NFR-P-01", P, "src/server/db/schema.ts (latency_ms)", "Measured per turn; the target needs a real telephony trunk.")
s("NFR-P-02", P, "src/server/db/schema.ts (latency_ms)", "Measured per turn. The percentile target needs real WhatsApp traffic.")
s("NFR-P-03", P, "src/server/ai/agents/agriculture.ts", "Measured per turn. The percentile target needs real photographs at field bandwidth.")
s("NFR-P-04", P, "scripts/smoke.mjs", "Page load and API latency are not yet measured against a 3G profile.")
s("NFR-P-05", H, "apphosting.yaml", "Concurrent call and turn throughput has not been load-tested against the stated profile.")
s("NFR-A-01", B, "src/server/ai/language/scripts.ts · src/server/channels/session.ts", "The emergency path is constants and, once recorded, a file. The availability percentage itself is a hosting property.")
s("NFR-A-02", H, "docs/DEPLOYMENT.md", "Recovery point and recovery time come from the database configuration and a restore exercise.")
s("NFR-A-03", B, "src/server/ai/gateway.ts", "Per-provider failover along the configured chain.")
s("NFR-S-01", G, "src/server/core/metering.ts", "Cost per completed interaction is metered per turn. Whether it lands under the target depends on provider pricing and volume.")
s("NFR-S-02", P, "src/server/core/metering.ts · tests/ops-metering.test.ts", "The conversion table is versioned. Accuracy against a provider invoice cannot be checked without one.")
s("NFR-U-01", P, "src/app/", "Built to the standard; no independent audit.")
s("NFR-U-02", G, "—", "Thirty low-literacy users per pilot province, tested before launch. Not something a repository can contain.")
s("NFR-O-01", P, "src/server/db/schema.ts (trace_id) · src/server/core/api.ts", "Every request carries a trace id end to end. OpenTelemetry export is not wired.")
s("NFR-O-02", P, "src/app/api/v1/admin/status · src/server/core/status.ts", "Signals are collected; alerting and an on-call rota are operational.")
s("CM-01", G, "—", "Licence and per-unit pricing are commercial terms between the programme and its supplier.")
s("CM-02", B, "src/server/core/metering.ts · tests/ops-metering.test.ts", "")
s("CM-03", P, "src/server/core/metering.ts · src/app/api/v1/metering/acu", "Every AI call is metered and attributed. Settlement through BitriPay is not implemented.")
s("CM-04", B, "src/server/core/metering.ts (isDegradedMode)", "At the cap, non-emergency AI degrades to scripted rather than stopping.")
s("DO-01", P, "repository root", "One application rather than the proposed monorepo split; the deviation and its reason are in docs/ARCHITECTURE.md.")
s("DO-02", P, "apphosting.yaml · Dockerfile", "Environments are configurable. Infrastructure as code is not in this repository.")
s("DO-03", B, ".github/workflows/ci.yml · .github/workflows/smoke.yml", "")
s("DO-04", P, ".github/workflows/ci.yml", "Trunk-based with a green gate. Feature flags and canary percentages are not implemented.")
s("DO-05", P, "drizzle/ · drizzle.config.ts", "Migrations are generated and applied at boot. Schema-registry compatibility does not apply without Kafka.")
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
out.append("| **Partial** | Part of it is implemented. The row says exactly which part is not, and why. |")
out.append("| **Programme** | Not software: a content, contractual, staffing or governance deliverable. |")
out.append("| **Deferred** | Placed in a later phase by the specification itself. |")
out.append("| **Hosting** | A property of the deployment, such as an availability or recovery target. |")
out.append("")
total = len(M)
line = " · ".join(f"{LABEL[k]} {counts.get(k, 0)}" for k in [B, P, G, D, H])
out.append(f"**{total} identifiers.** {line}.")
out.append("")
out.append("A status of Built is a claim about this repository, not about the programme. A")
out.append("platform can satisfy every row below and still not be ready for citizens: the")
out.append("clinical approvals, the staffed queues and the measured language quality are")
out.append("Programme rows, and they are the ones that decide a launch. See docs/SECURITY.md")
out.append("and the go/no-go assessment for that judgement.")
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
print(f"{total} rows written")
for k in [B, P, G, D, H]:
    print(f"  {LABEL[k]:10s} {counts.get(k, 0)}")
