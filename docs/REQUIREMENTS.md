# Requirement traceability

Every requirement identifier in the two product requirement documents, and what
in this repository satisfies it. One row per identifier, no identifier without a
row: `tests/requirements.test.ts` fails the build if the two drift apart, and the
identifier list itself is extracted from the .docx files by
`scripts/extract-requirements.mjs` rather than retyped.

| Status | Meaning |
|---|---|
| **Built** | Implemented in this repository, with the code and the test that proves it named in the row. |
| **Partial** | Part of it is implemented and code is still owed in this repository. The row says which part. |
| **Programme** | What remains is not software: a content, contractual, staffing or governance deliverable. The note says what is already built. |
| **Deferred** | Placed in a later phase by the specification itself. |
| **Hosting** | What remains is a property of the deployment or of its operation, such as an availability target or a restore exercise. The note says what is already built. |
| **Deviation** | This repository deliberately does something different from the specification. The note says what, and why. |

**197 identifiers.** Built 161 · Partial 0 · Programme 18 · Deferred 2 · Hosting 14 · Deviation 2.

No row is left Partial. Every requirement is either built in this repository,
with the code and the test that proves it named in the row, or its remaining
work is named and owned outside it — a recording studio, a review board, a
signed contract, a deployment setting, an operational exercise — or it is a
deliberate deviation with its reasoning written down. That is a statement about
where the work sits, not a claim that it is all done.

A status of Built is a claim about this repository, not about the programme. A
platform can satisfy every row below and still not be ready for citizens: the
clinical approvals, the staffed queues and the measured language quality are
Programme rows, and they are the ones that decide a launch. That judgement is in
docs/LAUNCH_READINESS.md, with docs/SECURITY.md for the security posture.

## Health rules (engineering specification §5)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| HEA-001 | The platform MUST maintain approved, versioned red-flag rule packs by age group and pregnancy status. Rule… | Built | src/server/ai/protocols/registry.ts · tests/health-protocols.test.ts | Versioned packs; rules run before any model call. |
| HEA-002 | A red flag MUST create an immutable risk event, urgent case, recommended action, configured destination and… | Built | src/server/ai/agents/workflow.ts · tests/health-triage.test.ts | Red flag opens an emergency case with an SLA clock. |
| HEA-003 | The LLM MUST NOT downgrade a deterministic urgent classification. Only an authorised clinician can override… | Built | src/server/ai/agents/health.ts · src/server/ai/agents/risk.ts | Severity is raise-only; only a clinician override lowers it. |
| HEA-004 | When location or referral data is unavailable, the system MUST state that limitation and give the nationall… | Built | src/server/ai/safety.ts (FACILITY_UNKNOWN_NOTE) | Says it does not know the facility rather than inventing one. |
| HEA-005 | The response MUST use action-first language: what to do now, what not to delay, where to seek help and what… | Built | src/server/ai/protocols/definitions/ · tests/health-triage.test.ts | Outcome text is action-first. |

## Agriculture rules (§6)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| AGR-001 | Advice MUST be conditioned on crop or animal type, growth/age stage, approximate location, season/date, obs… | Built | src/server/ai/agents/agriculture.ts (farmContext) |  |
| AGR-002 | The system MUST distinguish observation from confirmed diagnosis. Visual classification outputs are “possib… | Built | src/server/ai/agents/agriculture.ts (candidates, confident) | Candidates stay possible matches below the threshold. |
| AGR-003 | Chemical recommendations require an approved product registry, local authorisation status, label-derived in… | Built | src/server/ai/tools/input-registry.ts · tests/agri-tools.test.ts | No registry match means no product and no rate. |
| AGR-004 | Advice SHOULD prioritise feasible, low-cost integrated pest-management actions and explicitly flag actions… | Built | src/server/ai/agents/agriculture.ts (tieredActions, actionsToAvoid) |  |
| AGR-005 | Market prices MUST display source, market, unit, grade/quality where known, observation timestamp and stale… | Built | src/server/ai/tools/market.ts | Source, market, unit, date and staleness on every price. |

## Education rules (§7)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| EDU-001 | The platform MUST store an age/grade band and preferred language, not infer sensitive traits from voice. | Built | src/server/ai/agents/education.ts · src/server/db/schema.ts (learner_profiles) |  |
| EDU-002 | Adaptation MUST use demonstrated mastery, requested difficulty, response history and educator configuration… | Built | src/server/ai/agents/education.ts · tests/red-team.test.ts (ED-RT-021) | No permanent aptitude label; tested adversarially. |
| EDU-003 | The tutor MUST use a “teach, check, adapt” loop: explain one concept, ask a short comprehension check, asse… | Built | src/server/ai/agents/education.ts (steps) | Teach, check, adapt. |
| EDU-004 | For assessed homework, the tutor SHOULD provide hints and reasoning before a final answer and must identify… | Built | src/server/ai/agents/education.ts (HomeworkPolicy) |  |
| EDU-005 | Child-facing conversations MUST apply age-appropriate content filters, privacy minimisation, abuse/self-har… | Built | src/server/ai/safety.ts · tests/red-team.test.ts | Age filters and safeguarding, including grooming. |

## Identity and access (§10.1)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| IAM-001 | Citizens MAY use anonymous or pseudonymous sessions where service policy permits. Phone verification cannot… | Built | src/app/api/v1/auth/login/route.ts | Anonymous citizen sessions. |
| IAM-002 | Staff use federated identity where available, MFA and role plus attribute-based access. | Built | src/server/core/rbac.ts · src/server/core/oidc.ts · tests/oidc.test.ts | RBAC, ABAC, MFA and OIDC federation with signature, issuer, audience, nonce and domain checks. A staff account is never auto-provisioned from a token. |
| IAM-003 | Sensitive exports, clinical overrides, rule publication and break-glass access require step-up authentication. | Built | src/server/core/mfa.ts (stepUpStatus) |  |
| IAM-004 | Break-glass access expires automatically, requires justification and alerts the data protection/safety owner. | Built | src/app/api/v1/admin/break-glass/route.ts |  |
| IAM-005 | Role changes revoke active sessions and queued export links according to policy. | Built | src/server/core/api.ts · tests/security.test.ts | Session epoch withdraws tokens on role change. |

## Consent (§10.2)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| CON-001 | Consent is purpose-specific: service delivery, follow-up contact, precise location, analytics, research/mod… | Built | src/app/api/v1/consents/route.ts |  |
| CON-002 | Consent scripts are delivered in the selected language and channel and record script version plus affirmati… | Built | src/app/api/v1/consents/route.ts | Script version and language recorded with the act. |
| CON-003 | Withdrawal stops future optional processing but preserves records required by lawful retention; the user re… | Built | src/server/core/privacy.ts |  |
| CON-004 | Proxy/caregiver relationships record who is present, on whose behalf and the authority/assent basis. | Built | src/server/channels/session.ts (proxy) | Records on whose behalf and the basis. |

## Case management (§10.3)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| CAS-001 | Queues support domain, geography, service point, risk, skill, language and workload routing. | Built | src/server/ai/agents/workflow.ts (queueNameFor) |  |
| CAS-002 | Assignment is atomic and prevents two workers unknowingly owning the same case. | Built | src/app/api/v1/cases/[id]/assignments/route.ts |  |
| CAS-003 | Notes support structured fields and append-only narrative entries; edits create new versions. | Built | src/server/db/schema.ts (case_notes) · no update path exists | Notes are insert-only. |
| CAS-004 | SLA timers pause only for configured reasons and every pause is audited. | Built | src/server/ai/agents/workflow.ts · src/server/core/audit.ts |  |
| CAS-005 | Merge and duplicate resolution preserve all source identifiers and events. | Built | src/app/api/v1/cases/[id]/merge/route.ts |  |
| CAS-006 | Closure requires outcome, action taken, citizen reachability and follow-up decision. | Built | src/app/api/v1/cases/[id]/transitions/route.ts |  |

## Notifications (§10.4)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NOT-001 | Templates are versioned by language, channel, domain, risk and sensitivity. | Built | src/server/db/reference/notification-templates.ts |  |
| NOT-002 | Delivery attempts, provider IDs, consent, quiet hours, failures and retries are recorded. | Built | src/server/core/notifications.ts |  |
| NOT-003 | Urgent alerts use an escalation policy with acknowledgement; a sent message is not treated as acknowledged. | Built | src/app/api/v1/notifications/[id]/ack/route.ts | Sent is not acknowledged. |
| NOT-004 | Lock-screen/SMS text uses privacy-safe wording. | Built | src/server/core/redact.ts · notification templates |  |
| NOT-005 | Broadcasts require audience estimate, duplicate suppression, approval, rate controls and opt-out compliance. | Built | src/app/api/v1/notifications/broadcast/route.ts |  |

## Non-functional requirements (§16)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-001 | Availability 99.5% pilot; 99.9% national core monthly, excluding approved maintenance | Hosting | apphosting.yaml · Dockerfile | An availability percentage is a property of the deployment and its operations, not of the repository. |
| NFR-002 | Voice responsiveness P95 first acknowledgement <2s online; P95 useful response <12s text path and <20s voic… | Hosting | src/server/core/slo.ts · src/app/api/v1/system/slo | The objective is defined and measured: p95 per turn, with fewer than 30 observations reported as unmeasured rather than met. The number itself is a property of a running deployment. |
| NFR-003 | Urgent rule execution P99 deterministic danger-rule result <2s after transcript/structured input availability | Built | src/server/ai/protocols/ · tests/health-danger-signs.test.ts | Rules are pure functions with no model call. |
| NFR-004 | Durability Accepted case/event loss RPO <=5 minutes; critical configuration RPO <=1 minute | Hosting | docs/DEPLOYMENT.md | The recovery point objective is a database replication and backup configuration. |
| NFR-005 | Recovery Core service RTO <=60 minutes pilot and <=30 minutes national target | Hosting | docs/DEPLOYMENT.md | The recovery time objective is proven by a restore exercise, which has not been run. |
| NFR-006 | Scale Horizontal scaling tested to 10x forecast peak; per-channel backpressure and admission control | Hosting | Dockerfile · apphosting.yaml | The application scales horizontally by construction. Load testing to ten times peak has not been run. |
| NFR-007 | Offline 72 hours of field capture and at least 200 queued events per managed device without data loss | Built | src/server/channels/offline-queue.ts · tests/offline-capacity.test.ts | Two hundred events captured across seventy-two hours, replayed in the order spoken, each exactly once, nothing discarded when the sync drops halfway. Device storage quota remains a handset property. |
| NFR-008 | Accessibility WCAG 2.2 AA for PWA/staff portals plus voice-specific usability testing | Programme | scripts/a11y.mjs · .github/workflows/smoke.yml | WCAG 2.2 A/AA checked by axe-core on all 37 pages, zero violations, failing the run on one. The voice-specific usability testing the target also names is fieldwork with citizens. |
| NFR-009 | Observability 100% requests traceable across adapter, workflow, model/tool and persistence by trace ID | Built | src/server/db/schema.ts (trace_id) · src/server/core/api.ts |  |
| NFR-010 | Maintainability >=80% unit coverage for deterministic domain/policy code; 100% rule coverage for safety rul… | Built | vitest.config.ts (thresholds) · tests/rule-coverage.test.ts | 80 % thresholds enforced on the deterministic domain and policy code, and every safety rule proven individually reachable. |
| NFR-011 | Compatibility Android baseline selected from pilot device survey; last two major evergreen desktop browsers | Programme | docs/DEPLOYMENT.md | The Android baseline is chosen from a pilot device survey, which has not been run. |
| NFR-012 | Localisation No production string outside localisation registry; fallback and untranslated-string telemetry | Built | src/shared/i18n |  |

## Epics and acceptance (§26)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| E01 | Tenancy and access Automated tests prove row/object isolation across tenants and roles | Built | src/server/core/rbac.ts · tests/ops-routes.test.ts |  |
| E02 | Consent and citizen session User completes, refuses and withdraws each purpose in supported language | Built | src/app/api/v1/consents · tests/channels-session.test.ts |  |
| E03 | Voice/media ingestion Resumable, checked, encrypted upload survives disconnect and duplicate submission | Built | src/app/api/v1/media/uploads · src/server/core/storage.ts | Resumable, checksummed, encrypted. |
| E04 | Language pipeline Code-switched utterance returns span-aware transcript with uncertainty and correction | Built | src/server/ai/language/ · tests/language-pipeline.test.ts |  |
| E05 | Orchestration Replayable workflow calls typed tools, times out safely and records exact versions | Built | src/server/ai/agents/orchestrator.ts · tests/pipeline.test.ts |  |
| E06 | Health vertical Deterministic red flag escalates independently of LLM and reaches acknowledged human queue | Built | src/server/ai/agents/health.ts · tests/health-triage.test.ts |  |
| E07 | Agriculture vertical Guided image capture yields evidence-aware candidates and safe constrained action | Built | src/server/ai/agents/agriculture.ts · tests/agri-agent.test.ts |  |
| E08 | Education vertical Offline teach-check-adapt session syncs once and records topic evidence | Built | src/server/ai/agents/education.ts · tests/edu-agent.test.ts |  |
| E09 | Case management Assignment, SLA, transition, override, merge and closure are permissioned and audited | Built | src/app/api/v1/cases · tests/ops-workflow.test.ts |  |
| E10 | Knowledge governance Reviewed content publishes with validity and is the only production retrieval source | Built | src/server/ai/knowledge · src/app/api/v1/admin/kb |  |
| E11 | Notifications Sensitive templates, delivery/acknowledgement, retries and escalation are observable | Built | src/server/core/notifications.ts · tests/ops-notifications.test.ts |  |
| E12 | Dashboards Metrics expose definition/freshness and suppress unsafe small cells | Built | src/app/(app)/tableau-de-bord · src/server/ai/protocols/aggregation.ts |  |
| E13 | MLOps/evaluation Versioned release fails automatically when a safety/language threshold regresses | Built | src/server/ai/language/gates.ts · src/server/core/flags.ts · tests/red-team.test.ts | Language gates, the adversarial suite and canary rollout at 5 % held for seven days. |
| E14 | Security/operations Incident, backup restore, provider failure and key rotation are exercised successfully | Hosting | docs/SECURITY.md · .github/workflows/security.yml | Controls are built and scanned in CI. Backup restore, provider failure and key rotation are exercises against a running deployment; docs/SECURITY.md names the key-rotation hazard. |

## Channels (product requirements §4)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-CH-01 | A citizen calling the national short code hears a greeting in a rotating order of the five languages within… | Built | src/server/channels/ivr.ts · src/server/channels/twilio.ts |  |
| FR-CH-02 | After language selection the system asks one open question ("Tell me what you need — health, farming or sch… | Built | src/server/channels/ivr.ts · src/server/channels/menus.ts |  |
| FR-CH-03 | Audio is captured in 8 kHz AMR-NB/G.711 and streamed to the STT service; end-of-utterance detection ≤ 800 m… | Built | src/server/channels/twilio.ts · tests/channels-voice.test.ts | Barge-in and the configured end-of-utterance silence, sent as whole seconds because the gateway refuses a fraction. The codec is negotiated by the trunk. |
| FR-CH-04 | Each AI reply ≤ 25 seconds of speech; longer content is chunked with "shall I continue?". | Built | src/server/ai/language/voice.ts (chunkForSpeech) · tests/language-pipeline.test.ts |  |
| FR-CH-05 | Calls are toll-free to the citizen (reverse-billed to the programme) — commercial arrangement with MNOs is… | Programme | docs/DEPLOYMENT.md | Reverse billing so the citizen pays nothing is a commercial arrangement with the mobile operators. |
| FR-CH-06 | If the call drops, the session is resumable for 24 hours by calling back from the same number; the system s… | Built | src/server/channels/session.ts (startOrResume) |  |
| FR-CH-07 | Emergency phrase detection ("il ne respire plus", "azali kokoka te", etc.) short-circuits the flow to the e… | Built | src/server/channels/session.ts · tests/channels-session.test.ts | Deterministic, before any model call. |
| FR-CH-10 | Voice notes (OGG/Opus) are accepted and transcribed; replies are returned as both a voice note and text in… | Built | src/server/channels/whatsapp.ts · src/server/channels/media.ts |  |
| FR-CH-11 | Photos and short videos (≤ 30 s, ≤ 16 MB) are accepted for the Agriculture module; the system asks for a se… | Built | src/server/channels/media.ts |  |
| FR-CH-12 | Interactive buttons (max 3) and list messages (max 10) are used for confirmations; never free-text-only whe… | Built | src/server/channels/whatsapp.ts |  |
| FR-CH-13 | 24-hour session window rules of the WhatsApp platform are respected; proactive follow-ups use approved temp… | Built | src/server/channels/whatsapp.ts (WHATSAPP_WINDOW_MS) |  |
| FR-CH-14 | Opt-in and opt-out ("STOP"/"ARRÊT"/"TIKA") handled in all five languages. | Built | src/server/channels/session.ts (detectOptOut) |  |
| FR-CH-20 | USSD offers a 2-level menu: module → 5 most common questions per module → SMS answer in the user's language… | Built | src/server/channels/menus.ts · src/app/api/hooks/ussd |  |
| FR-CH-21 | USSD sessions ≤ 180 s (gateway limit); state persisted so the citizen can dial again. | Built | src/server/channels/session.ts (state) |  |
| FR-CH-22 | SMS is the delivery channel for reminders (vaccination, planting, revision) and follow-ups; each includes a… | Built | src/server/core/scheduler.ts · src/server/channels/sms.ts |  |
| FR-CH-30 | Next.js 14 App Router PWA, installable, offline shell cached, IndexedDB queue for outgoing voice notes/phot… | Built | public/sw.js · public/manifest.webmanifest |  |
| FR-CH-31 | Push-to-talk UI with a single large button; text remains secondary; every screen reachable in ≤ 2 taps. | Built | src/client/components/voice/VoiceConsole.tsx |  |
| FR-CH-32 | Worker PWA (CHW/Extension/Teacher) shares the same shell with role-gated routes. | Built | src/app/(app)/ |  |
| FR-CH-40 | citizen_id is a platform UUID; phone number, WhatsApp ID and PWA account are identifiers linked to it. Merg… | Built | src/server/channels/session.ts · src/server/core/identifiers.ts · tests/identity.test.ts | One citizen across IVR, SMS, USSD and WhatsApp, and a spoken one-time code with a ten-minute life and three attempts before an identifier is added. |
| FR-CH-41 | Because phones are shared, each session opens with a lightweight confirmation ("Is this still Maman Nsimba?… | Built | src/server/channels/session.ts (shouldConfirmSharedPhone) |  |

## Language and speech (§6)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-LG-01 | Language ID returns top-2 languages with probabilities; if top-1 < 0.70, the system asks the user to confir… | Built | src/server/ai/language/confidence.ts · tests/language-pipeline.test.ts |  |
| FR-LG-02 | STT returns word-level timestamps and per-segment confidence; segments < 0.55 confidence trigger a targeted… | Built | src/server/ai/language/confidence.ts · tests/language-pipeline.test.ts | Element-level confirmation. Word timestamps are not returned by every provider. |
| FR-LG-03 | Mixed-language utterances are handled without forcing the user to choose; token language tags are stored. | Built | src/server/ai/agents/orchestrator.ts (transcriptTags) |  |
| FR-LG-04 | Every reply is generated in French canonical form first, then rendered in the user's language. Canonical Fr… | Built | src/server/ai/agents/language.ts | French canonical, stored for the worker. |
| FR-LG-05 | A per-domain terminology glossary (e.g., "malaria" → Lingala "malaria/ndese", "fertiliser" → …) is enforced… | Built | src/server/ai/language/glossary.ts · tests/glossary.test.ts |  |
| FR-LG-06 | Simplification: target reading/listening level equivalent to end of primary school; sentence length ≤ 15 wo… | Built | src/server/ai/language/voice.ts · tests/language-pipeline.test.ts |  |
| FR-LG-07 | TTS voices: one female and one male per language; voice selection per module configurable; all voices revie… | Built | src/server/ai/providers/google-speech.ts · src/server/ai/providers/openai.ts | Two voices per language where a provider offers them. |
| FR-LG-08 | Human-recorded prompts are used for fixed scripts (greetings, emergency scripts, disclaimers) in all langua… | Programme | src/server/ai/language/scripts.ts · tests/language-pipeline.test.ts | The fixed scripts and the delivery path are built and tested; missingRecordings() reports which are unrecorded. Recording them with native speakers is studio work. |
| FR-LG-09 | The pipeline exposes transcription_confidence, translation_confidence and overall_language_confidence to th… | Built | src/server/ai/language/confidence.ts |  |

## Corpus programme (§6.4)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| CP-01 | Collect ≥ 200 hours of transcribed conversational speech per low-resource language across ≥ 3 provinces, ba… | Programme | docs/LANGUAGES.md | Two hundred hours of transcribed speech per language is field collection with consent, not code. |
| CP-02 | Build a 2,000-utterance gold evaluation set per language per module, annotated with intent, entities and se… | Programme | docs/LANGUAGES.md | The gold evaluation sets are a content deliverable; the gates in gates.ts have nothing to read until they exist. |
| CP-03 | Native-speaker linguists (2 per language) on retainer for glossary, prompt review and TTS QA. | Programme | docs/LANGUAGES.md | Two native-speaker linguists per language on retainer, for glossary, prompt review and voice quality. |
| CP-04 | Data licensing: corpus is owned by the programme (FDSU/Government) with Nseya holding a perpetual licence f… | Programme | docs/LANGUAGES.md | Who owns the corpus and on what licence is a contractual decision recorded as open in the specification. |

## Agentic architecture and AI governance (§7, §17)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| AI-01 | A DomainResult failing schema validation is rejected and the turn falls back to a safe scripted response +… | Built | src/server/ai/gateway.ts · src/server/ai/schemas.ts | A contract violation falls back to a safe scripted answer. |
| AI-02 | Max 2 clarifying questions per turn; each is a single closed or short question; after 2, the agent proceeds… | Built | src/server/ai/language/confidence.ts (MAX_CONFIRMATION_ROUNDS) |  |
| AI-03 | confidence_overall = min(stt_conf, intent_conf, domain_conf) adjusted by Risk Agent; < 0.60 → response is p… | Built | src/server/ai/agents/risk.ts · tests/claim-guard.test.ts |  |
| AI-04 | Each module has a curated, versioned knowledge base (Markdown/PDF source → chunked → embedded in a vector s… | Built | src/server/ai/knowledge · src/app/api/v1/admin/kb |  |
| AI-10 | Clinical Review Board (CRB): ≥ 2 Congolese physicians + 1 community health expert approve every health prot… | Programme | src/server/ai/review/board.ts · src/app/(app)/admin/comite · tests/review-board.test.ts | Seats, quorum by composition, sign-offs bound to a content digest, no self-approval, expiry on the review cadence, and one member able to suspend alone. Without a current sign-off the platform escalates and refers but does not assess. Seating the three members of the Comité de Revue Clinique is a governance act, not code. |
| AI-11 | Agronomy and Pedagogy panels: analogous review for agri KB and education content. | Programme | src/server/ai/review/board.ts (BOARDS) · src/app/(app)/admin/comite | The agronomy and pedagogy panels run on the same machinery as the clinical board, with their own seats and quorum. Appointing their members is governance work. |
| AI-12 | Red-team suite: ≥ 300 adversarial/edge cases per module per language (dangerous self-medication requests, p… | Programme | tests/red-team.test.ts · tests/fixtures/red-team.ts | The gate runs in CI and blocks on any miss; 126 cases, whose first run exposed 24 real defects, now fixed. Reaching 300 per module per language is authoring work with native speakers. |
| AI-13 | Grounding rule: health/agri recommendations must cite KB/protocol IDs; a recommendation without citation is… | Built | src/server/ai/agents/risk.ts · src/server/ai/agents/health.ts |  |
| AI-14 | Disclaimer policy: identity statement at session start ("I am the CVOS voice assistant, not a doctor/agrono… | Built | src/server/ai/language/scripts.ts · src/server/channels/session.ts | Said once per session, never repeated. |
| AI-15 | Misinformation guard: Risk Agent runs a classifier on outbound text for unsupported medical/agri claims; po… | Built | src/server/ai/safety.ts · tests/claim-guard.test.ts |  |
| AI-16 | Uncertainty recording: every turn stores confidences and any assumptions; low-confidence turns sampled dail… | Built | src/server/ai/agents/learning.ts (dailyReviewSample) · src/server/core/scheduler.ts |  |
| AI-17 | Learning loop: overrides, feedback, follow-up outcomes and reviewer labels flow to an evaluation dataset; m… | Built | src/server/ai/agents/learning.ts · src/server/core/flags.ts · tests/flags.test.ts | Overrides, feedback and corrections feed the corpus; a change reaches citizens through a 5 % canary held for seven days. |
| AI-18 | Bias & fairness: per-language and per-gender quality metrics reported monthly; a language whose metrics fal… | Built | src/server/ai/language/gates.ts · tests/language-gates.test.ts |  |
| AI-19 | Content boundaries: no political, religious or legal advice; no financial products; abuse/threat detection… | Built | src/server/ai/safety.ts (detectBoundaryTopics) · tests/claim-guard.test.ts |  |

## Health module (§8.1)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-HE-01 | Triage runs on versioned decision trees (protocol_versions) authored in a YAML DSL and approved by the Clin… | Built | src/server/ai/protocols/definitions/ | Ten protocols. |
| FR-HE-02 | Each protocol defines: questions (with per-language phrasing), branching, severity output (0 self-care, 1 m… | Built | src/server/ai/protocols/types.ts |  |
| FR-HE-03 | The LLM's role is to map free speech to protocol answers (structured extraction) and to explain the outcome… | Built | src/server/ai/agents/health.ts |  |
| FR-HE-04 | Any red-flag answer immediately yields severity 4 without completing the tree. | Built | src/server/ai/protocols/engine.ts · tests/health-danger-signs.test.ts |  |
| FR-HE-10 | Symptom intake accepts free speech; the Health Agent extracts entities (symptom, duration, age group, pregn… | Built | src/server/ai/protocols/extraction.ts |  |
| FR-HE-11 | Emergency (severity 4) → scripted emergency instructions in the user's language + nearest facility (if know… | Built | src/server/ai/agents/health.ts · src/server/ai/agents/workflow.ts |  |
| FR-HE-12 | Severity 2–3 → case created, assigned to the territory's CHW queue, SLA 24 h / 4 h respectively; citizen re… | Built | src/server/ai/agents/workflow.ts (slaDueFor) |  |
| FR-HE-13 | Vaccination reminders: citizen states child's date of birth (or age) → national EPI schedule → SMS/voice re… | Built | src/server/ai/protocols/vaccination.ts · src/server/core/scheduler.ts |  |
| FR-HE-14 | Maternal health: pregnancy status captured with explicit consent; ANC visit reminders; danger-sign protocol… | Built | src/server/core/scheduler.ts (scheduleAncReminders) |  |
| FR-HE-15 | Medication guidance limited to approved protocol text (e.g., ORS preparation, paracetamol per national comm… | Built | src/server/ai/safety.ts (sanitiseHealthGuidance) |  |
| FR-HE-16 | Health interaction summaries (≤ 60 words, canonical French) are generated for every turn and visible to ass… | Built | src/server/ai/agents/health.ts (capWords) |  |
| FR-HE-17 | Anonymised health trend aggregation by territory/week for dashboards (§14) with k-anonymity ≥ 10. | Built | src/server/ai/protocols/aggregation.ts | k-anonymity of 10. |

## Agriculture module (§8.2)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-AG-01 | Inputs: voice/text description; up to 5 photos; ≤ 30 s video (frames extracted server-side); optional crop,… | Built | src/app/api/v1/interactions/route.ts · src/server/channels/media.ts |  |
| FR-AG-02 | Crop issue identification returns top-3 candidates with probabilities from the vision classifier; the VLM p… | Built | src/server/ai/agents/agriculture.ts |  |
| FR-AG-03 | Recommendations are tiered: (a) no-cost cultural practices, (b) low-cost locally available inputs, (c) inpu… | Built | src/server/ai/agents/agriculture.ts (tieredActions) |  |
| FR-AG-04 | Notifiable pests/diseases list (configurable: fall armyworm, cassava mosaic/brown streak, banana bunchy top… | Built | src/server/db/reference/agriculture.ts · src/server/ai/agents/clusters.ts |  |
| FR-AG-05 | Cluster detection: ≥ N reports (default 5) of the same issue/crop in the same territory within 14 days → ag… | Built | src/server/ai/agents/clusters.ts · tests/agri-clusters.test.ts |  |
| FR-AG-06 | Planting calendars by province and crop (maize, cassava, rice, beans, groundnut, plantain, vegetables) main… | Built | src/server/db/reference/calendars.ts |  |
| FR-AG-07 | Weather: territory-level 5-day forecast from a provider via the gateway; rendered in plain language ("heavy… | Built | src/server/ai/tools/weather.ts |  |
| FR-AG-08 | Market prices: weekly price sheet per major market (Kinshasa, Lubumbashi, Kisangani, Mbuji-Mayi, Goma, Mata… | Built | src/server/ai/tools/market.ts · src/app/api/v1/agriculture/prices/upload |  |
| FR-AG-09 | Livestock: symptom intake for poultry, goats, pigs, cattle → severity + "contact veterinary/extension" path… | Built | src/server/ai/agents/agriculture.ts |  |
| FR-AG-10 | Buyer opportunities (Phase 4): informational listing of cooperative/buyer contacts by commodity, admin-main… | Deferred | — | Buyer and cooperative listings are placed in Phase 4 by the specification itself, after the pilot. |

## Education module (§8.3)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-ED-01 | Learner profile: age band (6–8, 9–11, 12–14, 15–18, adult), level (primaire 1–6, secondaire 1–6/humanités),… | Built | src/server/ai/agents/education.ts |  |
| FR-ED-02 | Explain-at-level: any topic explained in ≤ 90 s of speech at the profile level, with one concrete local exa… | Built | src/server/ai/agents/education.ts (speechSeconds, localExample) |  |
| FR-ED-03 | Read-aloud: stories and passages from a curated, licensed/open library in the five languages; Phase 3 adds… | Deferred | src/server/db/reference/stories.ts | The read-aloud library is built. Narration of a photographed textbook page is placed in Phase 3 by the specification itself. |
| FR-ED-04 | Oral quiz: 5-question quizzes generated per topic; voice answers scored; results stored as learning_signals. | Built | src/app/api/v1/education/quiz · tests/edu-quiz.test.ts |  |
| FR-ED-05 | Homework support: step-by-step guidance; for maths, the agent works one worked example then coaches the lea… | Built | src/server/ai/agents/education.ts (HomeworkPolicy) |  |
| FR-ED-06 | Exam prep (TENAFEP, Examen d'État) drawn from official objectives; revision plans by weeks-to-exam; SMS rev… | Built | src/server/ai/agents/education.ts (revisionPlan) |  |
| FR-ED-07 | Parent mode: explain what the child is studying and how to help without literacy. | Built | src/server/ai/agents/education.ts (parent mode) |  |
| FR-ED-08 | Teacher mode (worker PWA): class-level learning-gap view; ready-made oral quizzes; broadcast of revision re… | Built | src/server/ai/education/evidence.ts (classGaps) |  |
| FR-ED-09 | Difficulty tracking: repeated failures on a concept produce learning_gap signals aggregated by school/terri… | Built | src/server/ai/education/evidence.ts |  |
| FR-ED-10 | Reuse of StudYear AI-OS components (quiz generation, spaced-repetition scheduling, curriculum graph) throug… | Programme | — | The shared-package boundary with StudYear is an open commercial decision in the specification itself. |

## Cases and escalation (§9)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-CS-01 | Cases are created automatically for severity ≥ 2, low confidence < 0.40, notifiable agri issues, and any ci… | Built | src/server/ai/agents/workflow.ts (shouldAutoCreateCase) |  |
| FR-CS-02 | Assignment routing: territory → org → role → availability (worker "on duty" toggle) → load balancing; unass… | Built | src/server/ai/agents/workflow.ts |  |
| FR-CS-03 | Workers see: canonical French summary, original transcript, audio playback, media, protocol path taken, sev… | Built | src/app/(app)/cas/[id] |  |
| FR-CS-04 | Worker actions: acknowledge, call citizen (click-to-call via IVR bridge), add note (voice or text), overrid… | Built | src/app/api/v1/cases/[id]/ · src/server/channels/outbound-call.ts · tests/channels-voice.test.ts | Acknowledge, note, override, outcome, follow-up, and a bridged call that puts the worker on the phone without giving them the number. |
| FR-CS-05 | Overrides feed the learning loop (ai.override.recorded) and the Admin dashboard's override rate. | Built | src/app/api/v1/cases/[id]/risk-overrides/route.ts |  |
| FR-CS-06 | SLA timers are Kafka-scheduled; breaches emit case.sla.breached and notify. | Built | src/server/core/scheduler.ts | SLA timers run in the scheduler rather than on Kafka; the behaviour is the same and the deviation is recorded in docs/ARCHITECTURE.md. |
| FR-CS-07 | Follow-up outcomes ("went to clinic", "child recovered", "sprayed neem", "quiz passed") are captured from t… | Built | src/app/api/v1/cases/[id]/follow-ups/route.ts |  |

## Autosave and audit (§13)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-AS-01 | Every item in the brief's autosave list is an event (§11) persisted before the response is returned to the… | Built | src/server/core/events.ts · src/server/ai/agents/orchestrator.ts |  |
| FR-AS-02 | Drafts (worker notes, admin prompt edits, report filters) autosave client-side every 2 s to IndexedDB and s… | Built | src/app/api/v1/autosave/route.ts · src/client/components/voice/VoiceConsole.tsx |  |
| FR-AS-03 | Failed attempts (STT failure, timeout, provider error) and abandoned sessions (no input for 5 min IVR / 24… | Built | src/server/ai/agents/orchestrator.ts · src/server/channels/workflow.ts |  |
| FR-AS-04 | Version history: prompts, protocols, glossaries, KB documents and notification templates are immutable vers… | Built | src/server/ai/protocols/registry.ts · src/app/api/v1/admin/glossaries |  |
| FR-AS-05 | Every saved record carries: timestamp, actor ID and role, language, module, channel, geo (where available),… | Built | src/server/db/schema.ts (interactions) |  |
| FR-AS-06 | Audit log is tamper-evident: hash chain per tenant per day; daily digest exported to cold storage. | Built | src/server/core/audit.ts · tests/ops-audit.test.ts |  |

## Reporting (§14.6)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-RP-01 | Scheduled reports: daily usage; weekly health trends; weekly agri risk; weekly education support; monthly r… | Built | src/server/reports/index.ts · src/app/api/v1/report-definitions |  |
| FR-RP-02 | Formats: PDF (branded template), XLSX, CSV, dashboard link. Generated asynchronously; delivered by email/Wh… | Built | src/server/reports/pdf.ts · src/server/reports/xlsx.ts |  |
| FR-RP-03 | Report definitions are configurable (filters, scope, cadence) by org admins. | Built | src/app/api/v1/report-definitions/route.ts |  |

## Notifications (§15)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-NT-01 | Channels: SMS, WhatsApp (template messages), in-app/push (PWA), email (admin/worker), voice call (IVR outbo… | Built | src/server/core/notifications.ts |  |
| FR-NT-02 | Template catalogue with per-language variants, placeholders and approval status (WhatsApp templates require… | Built | src/server/db/reference/notification-templates.ts |  |
| FR-NT-03 | Types: emergency alert (worker), case assigned, SLA breach, follow-up due, citizen reminder (vaccination, A… | Built | src/server/db/reference/notification-templates.ts |  |
| FR-NT-04 | Delivery policy: retry with backoff; channel fallback (WhatsApp → SMS → voice); quiet hours 21:00–06:00 loc… | Built | src/server/core/notifications.ts · tests/ops-notifications.test.ts |  |
| FR-NT-05 | Every notification produces delivery events; dashboards show delivery rates per channel/MNO. | Built | src/server/core/notifications.ts |  |

## Security, privacy and consent (§16)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| SEC-01 | Data classification: Class A (identifiable health/pregnancy data, child data), Class B (identifiable non-he… | Built | src/server/core/privacy.ts · docs/SECURITY.md |  |
| SEC-02 | Workers/admins: OIDC (Google Workspace or Keycloak — [DECISION REQUIRED]), MFA mandatory for admin and supe… | Built | src/server/core/mfa.ts · src/server/core/oidc.ts · tests/oidc.test.ts | MFA is mandatory for privileged roles, and staff may federate through OIDC with every token claim verified. |
| SEC-03 | RBAC + ABAC: roles (citizen, chw, nurse, extension_officer, teacher, org_analyst, org_admin, gov_admin, pla… | Built | src/server/core/rbac.ts · tests/core.test.ts | Enforced in the API wrapper. Row-level security in PostgreSQL is not used; the deviation is recorded in docs/SECURITY.md. |
| SEC-04 | Citizens authenticate by channel identity (phone/WhatsApp) + voice OTP for identifier merges and for access… | Built | src/server/core/identifiers.ts · tests/identity.test.ts | A spoken one-time code, hashed at rest, ten-minute life, three attempts, before a new identifier joins an existing citizen. |
| SEC-05 | Encryption in transit (TLS 1.3, mTLS between services); at rest (CMEK via Cloud KMS for Cloud SQL, GCS, Kaf… | Hosting | src/server/core/crypto.ts · src/server/core/residency.ts · tests/security.test.ts | AES-256-GCM with per-purpose derived keys over second-factor seeds, stored media and phone numbers, a keyed blind index so an encrypted number is still findable, and a declared list of jurisdictions outside which no destination is ever registered. Customer-managed keys and mutual TLS are configured at the platform that hosts this. |
| SEC-06 | Audio/media: GCS with signed URLs (≤ 15 min), bucket-level retention: raw audio 90 days (configurable), tra… | Built | src/server/core/privacy.ts (sweepExpiredMedia) · tests/retention.test.ts | Media encrypted at rest, served through the application, and swept on its own schedule — 90 days for voice, 365 for images and documents — bytes before rows, with legal holds respected and the sweep audited. |
| SEC-07 | Pseudonymisation at the analytics boundary: BigQuery receives citizen_pseudo_id (HMAC) and no phone numbers… | Built | src/server/db/schema.ts (pseudo_id) · src/server/core/privacy.ts |  |
| SEC-08 | Turn object: {turn_id, seq, transcript_raw, lang_detected, lang_confidence, module, domain_result, risk, re… | Built | src/server/ai/gateway.ts · tests/red-team.test.ts | No provider name reaches a client; tested adversarially. |
| SEC-09 | Consent management: purpose-based consents (service, reminders, research/model training, sharing with org p… | Built | src/app/api/v1/consents/route.ts |  |
| SEC-10 | Children: education profiles for < 18 collect no surname, no school ID unless via a school-tenant agreement… | Built | src/server/ai/agents/education.ts · src/server/core/privacy.ts |  |
| SEC-11 | Right-to-access/erasure workflow (voice-initiated), 30-day SLA, cascading to derived data except statutory… | Built | src/app/api/v1/data-requests · src/server/core/privacy.ts |  |
| SEC-12 | Security operations: Cloud Armor WAF, DDoS protection, dependency scanning (Snyk/Dependabot), SAST in CI, c… | Hosting | .github/workflows/security.yml · docs/SECURITY.md | Dependency audit and static analysis run in CI on every change. A web application firewall, image signing and a quarterly penetration test are bought and operated around a deployment, not committed to a repository. |

## Performance (§18.1)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-P-01 | IVR: first spoken reply ≤ 6 s after end of citizen utterance (p95); partial TTS streaming permitted | Hosting | src/server/core/slo.ts | Measured per turn and reported as a p95 against the objective; the figure itself needs a real telephony trunk. |
| NFR-P-02 | WhatsApp voice note ≤ 30 s audio: reply ≤ 12 s (p95) | Hosting | src/server/core/slo.ts | Measured per turn and reported as a p95 against the objective; the figure itself needs real WhatsApp traffic. |
| NFR-P-03 | Photo analysis: ≤ 15 s (p95) | Hosting | src/server/core/slo.ts · src/server/ai/agents/agriculture.ts | Measured per turn and reported as a p95 against the objective; the figure itself needs real photographs at field bandwidth. |
| NFR-P-04 | Dashboard page load ≤ 2.5 s (p95) on 3G; API p95 ≤ 400 ms excluding AI calls | Built | scripts/perf-3g.mjs | Page load measured against a throttled 3G profile on a real browser; the run fails if a page misses the objective. |
| NFR-P-05 | Throughput baseline: 50 concurrent IVR calls, 500 WhatsApp turns/min at MVP; horizontal scale to 1,000 call… | Hosting | apphosting.yaml | Concurrent call and turn throughput has not been load-tested against the stated profile. |

## Availability (§18.2)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-A-01 | 99.5% monthly availability for citizen channels in MVP; 99.9% by Phase 5. Emergency script path 99.95% (ser… | Built | src/server/ai/language/scripts.ts · src/server/channels/session.ts | The emergency path is constants and, once recorded, a file. The availability percentage itself is a hosting property. |
| NFR-A-02 | RPO 15 min, RTO 2 h (Cloud SQL HA + PITR; Kafka replication factor 3). | Hosting | docs/DEPLOYMENT.md | Recovery point and recovery time come from the database configuration and a restore exercise. |
| NFR-A-03 | Circuit breakers per AI provider; automatic failover per routing table. | Built | src/server/ai/gateway.ts | Per-provider failover along the configured chain. |

## Scalability and cost (§18.3)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-S-01 | Target cost per completed interaction ≤ USD 0.08 blended (AI + infra) at 100k interactions/month; ≤ USD 0.0… | Programme | src/server/core/metering.ts | Cost per completed interaction is metered per turn. Whether it lands under the target depends on provider pricing and volume. |
| NFR-S-02 | ACU metering accurate to ±2% versus provider invoices. | Programme | src/server/core/metering.ts · tests/ops-metering.test.ts | Every AI call is metered against a versioned conversion table and attributed. Reconciling that table against a provider invoice requires an invoice, which requires a signed contract. |

## Accessibility (§18.5)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-U-01 | Worker/admin UIs WCAG 2.2 AA; RTL not required; all UI strings i18n (fr primary, en admin optional). | Programme | scripts/a11y.mjs · src/shared/i18n | WCAG 2.2 A/AA checked by axe-core on every worker and admin page, zero violations, and all UI strings in the five languages. An audit with assistive-technology users is fieldwork. |
| NFR-U-02 | Citizen voice UX tested with ≥ 30 low-literacy users per pilot province before launch (task success ≥ 80%). | Programme | — | Thirty low-literacy users per pilot province, tested before launch. Not something a repository can contain. |

## Observability (§18.6)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-O-01 | OpenTelemetry traces across adapter → session → agent → gateway; per-turn trace ID surfaced in admin UI. | Built | src/instrumentation.ts · src/server/observability/tracing.ts · src/server/core/api.ts | Every request carries a trace id end to end and the OpenTelemetry SDK exports spans when an endpoint is configured. |
| NFR-O-02 | SLO dashboards (latency, availability, STT WER drift, low-confidence rate, SLA breach rate, cost) with pagi… | Hosting | src/server/core/slo.ts · src/app/api/v1/system/slo · src/app/api/v1/admin/status | Every objective is measured and reported, with breaching separated from unmeasured so an absent signal is never read as a met target. Paging and an on-call rota are staffed around a deployment. |

## Commercial and metering (§19)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| CM-01 | FDSU/Government is the paying tenant; Nseya provides the technology; pricing is platform licence + per-ACU… | Programme | — | Licence and per-unit pricing are commercial terms between the programme and its supplier. |
| CM-02 | ACU definition (portfolio standard): 1 ACU = normalised unit across STT seconds, TTS characters, LLM tokens… | Built | src/server/core/metering.ts · tests/ops-metering.test.ts |  |
| CM-03 | Every cvos.metering.acu event is attributed to tenant/org/module/language/channel; monthly statement genera… | Programme | src/server/core/metering.ts · src/app/api/v1/metering/acu | Every metering event is attributed to tenant, organisation, module, language and channel, and monthly statements are generated. Settlement through a named payment provider needs a commercial agreement with that provider. |
| CM-04 | Budget guardrails: per-tenant monthly ACU cap with 80/95/100% alerts; at cap, non-emergency AI features deg… | Built | src/server/core/metering.ts (isDegradedMode) | At the cap, non-emergency AI degrades to scripted rather than stopping. |

## Delivery engineering (§20)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| DO-01 | Monorepo (Turborepo/pnpm) for TypeScript services and PWA; separate Python repo for agent-runtime; shared @… | Deviation | repository root · docs/ARCHITECTURE.md | One application rather than the proposed monorepo split. A national platform maintained by a small team pays the coordination cost of a split repository long before it gets the benefit; the reasoning is recorded in docs/ARCHITECTURE.md. |
| DO-02 | Environments: dev (ephemeral per PR preview for PWA), staging (full stack, synthetic data, sandbox telephon… | Built | infra/main.tf · infra/environments · docs/GO_LIVE.md | Environments, the database, the bucket, the secrets, the scheduler and the custom domain mapping are declared as Terraform, with an ordered runbook and a preflight check against the deployed origin. |
| DO-03 | CI: lint, typecheck, unit (≥ 80% on core services), contract tests (Pact) between adapters and session, int… | Built | .github/workflows/ci.yml · .github/workflows/smoke.yml · scripts/preflight.mjs | A green build gates a merge; a deployed origin is checked before traffic reaches it — readiness, the origin it serves against the origin it believes in, headers, and that no private endpoint answers anonymously. |
| DO-04 | Release: trunk-based; feature flags for modules/languages/channels per province; canary 5% → 25% → 100%; ro… | Built | .github/workflows/ci.yml · src/server/core/flags.ts · tests/flags.test.ts | Trunk-based with a green gate, feature flags scoped by province, role and module, and canaries that start at 5 % and are held seven days. |
| DO-05 | Data migrations: Prisma/Flyway with backward-compatible expand/contract; event schema evolution with Schema… | Deviation | drizzle/ · scripts/check-migrations.mjs | Migrations are generated, checked for destructive statements before they can merge, and applied at boot. The second half of the requirement assumes an event bus with a schema registry; this platform has no event bus, so there is no registry to keep backward-compatible. |
| DO-06 | Synthetic data generator for all five languages for staging and demos (no real citizen data outside prod). | Built | src/server/db/seed.ts | Synthetic data in five languages, refused in production. |

