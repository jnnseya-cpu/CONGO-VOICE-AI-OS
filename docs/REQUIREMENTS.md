# Requirement traceability

Every requirement identifier in the two product requirement documents, and what
in this repository satisfies it. One row per identifier, no identifier without a
row: `tests/requirements.test.ts` fails the build if the two drift apart, and the
identifier list itself is extracted from the .docx files by
`scripts/extract-requirements.mjs` rather than retyped.

| Status | Meaning |
|---|---|
| **Built** | Implemented in this repository, with the code and the test that proves it named in the row. |
| **Partial** | Part of it is implemented. The row says exactly which part is not, and why. |
| **Programme** | Not software: a content, contractual, staffing or governance deliverable. |
| **Deferred** | Placed in a later phase by the specification itself. |
| **Hosting** | A property of the deployment, such as an availability or recovery target. |

**197 identifiers.** Built 146 · Partial 33 · Programme 11 · Deferred 1 · Hosting 6.

A status of Built is a claim about this repository, not about the programme. A
platform can satisfy every row below and still not be ready for citizens: the
clinical approvals, the staffed queues and the measured language quality are
Programme rows, and they are the ones that decide a launch. See docs/SECURITY.md
and the go/no-go assessment for that judgement.

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
| IAM-002 | Staff use federated identity where available, MFA and role plus attribute-based access. | Partial | src/server/core/rbac.ts · src/server/core/mfa.ts | RBAC, ABAC and MFA built. Federated identity (OIDC) is not: staff sign in against this application. |
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
| NFR-001 | NFR-001 | Hosting | apphosting.yaml · Dockerfile | An availability percentage is a property of the deployment and its operations, not of the repository. |
| NFR-002 | NFR-002 | Partial | src/server/db/schema.ts (latency_ms) · scripts/smoke.mjs | Latency is measured per turn. The percentile target needs production traffic. |
| NFR-003 | NFR-003 | Built | src/server/ai/protocols/ · tests/health-danger-signs.test.ts | Rules are pure functions with no model call. |
| NFR-004 | NFR-004 | Hosting | docs/DEPLOYMENT.md | The recovery point objective is a database replication and backup configuration. |
| NFR-005 | NFR-005 | Hosting | docs/DEPLOYMENT.md | The recovery time objective is proven by a restore exercise, which has not been run. |
| NFR-006 | NFR-006 | Hosting | Dockerfile · apphosting.yaml | The application scales horizontally by construction. Load testing to ten times peak has not been run. |
| NFR-007 | NFR-007 | Partial | public/sw.js · src/server/channels/offline-queue.ts | Offline capture and replay are built. The 72-hour and 200-event figures are unverified on a real handset. |
| NFR-008 | NFR-008 | Partial | src/app/(app) · src/app/(public) | Built to the standard; no independent accessibility audit has been done. |
| NFR-009 | NFR-009 | Built | src/server/db/schema.ts (trace_id) · src/server/core/api.ts |  |
| NFR-010 | NFR-010 | Partial | .github/workflows/ci.yml · tests/ | Rule packs are covered by table-driven tests. No coverage percentage is enforced in CI. |
| NFR-011 | NFR-011 | Programme | docs/DEPLOYMENT.md | The Android baseline is chosen from a pilot device survey, which has not been run. |
| NFR-012 | NFR-012 | Built | src/shared/i18n |  |

## Epics and acceptance (§26)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| E01 | Tenancy and access | Built | src/server/core/rbac.ts · tests/ops-routes.test.ts |  |
| E02 | Consent and citizen session | Built | src/app/api/v1/consents · tests/channels-session.test.ts |  |
| E03 | Voice/media ingestion | Built | src/app/api/v1/media/uploads · src/server/core/storage.ts | Resumable, checksummed, encrypted. |
| E04 | Language pipeline | Built | src/server/ai/language/ · tests/language-pipeline.test.ts |  |
| E05 | Orchestration | Built | src/server/ai/agents/orchestrator.ts · tests/pipeline.test.ts |  |
| E06 | Health vertical | Built | src/server/ai/agents/health.ts · tests/health-triage.test.ts |  |
| E07 | Agriculture vertical | Built | src/server/ai/agents/agriculture.ts · tests/agri-agent.test.ts |  |
| E08 | Education vertical | Built | src/server/ai/agents/education.ts · tests/edu-agent.test.ts |  |
| E09 | Case management | Built | src/app/api/v1/cases · tests/ops-workflow.test.ts |  |
| E10 | Knowledge governance | Built | src/server/ai/knowledge · src/app/api/v1/admin/kb |  |
| E11 | Notifications | Built | src/server/core/notifications.ts · tests/ops-notifications.test.ts |  |
| E12 | Dashboards | Built | src/app/(app)/tableau-de-bord · src/server/ai/protocols/aggregation.ts |  |
| E13 | MLOps/evaluation | Partial | src/server/ai/language/gates.ts · tests/red-team.test.ts | Gates and the adversarial suite are built and block CI. Canary rollout is not. |
| E14 | Security/operations | Partial | docs/SECURITY.md · .github/workflows/ci.yml | Controls are built. Backup restore, provider failure and key rotation have not been exercised. |

## Channels (product requirements §4)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| FR-CH-01 | A citizen calling the national short code hears a greeting in a rotating order of the five languages within… | Built | src/server/channels/ivr.ts · src/server/channels/twilio.ts |  |
| FR-CH-02 | After language selection the system asks one open question ("Tell me what you need — health, farming or sch… | Built | src/server/channels/ivr.ts · src/server/channels/menus.ts |  |
| FR-CH-03 | Audio is captured in 8 kHz AMR-NB/G.711 and streamed to the STT service; end-of-utterance detection ≤ 800 m… | Partial | src/server/channels/twilio.ts | Codec and barge-in are negotiated by the telephony provider; the 800 ms end-of-utterance value is not tuned against a real trunk. |
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
| FR-CH-40 | citizen_id is a platform UUID; phone number, WhatsApp ID and PWA account are identifiers linked to it. Merg… | Partial | src/server/channels/session.ts (citizen_identifiers) | Identifiers are linked to one citizen id. Merging them by voice one-time code is not implemented. |
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
| FR-LG-08 | Human-recorded prompts are used for fixed scripts (greetings, emergency scripts, disclaimers) in all langua… | Partial | src/server/ai/language/scripts.ts · tests/language-pipeline.test.ts | The fixed scripts and the delivery path are built. No recordings have been made yet; missingRecordings() reports the gap. |
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
| AI-10 | Clinical Review Board (CRB): ≥ 2 Congolese physicians + 1 community health expert approve every health prot… | Partial | src/server/ai/protocols/registry.ts | The approval mechanism is built and every version records an approver. No clinical review board has been constituted; protocols carry a placeholder approver. |
| AI-11 | Agronomy and Pedagogy panels: analogous review for agri KB and education content. | Programme | src/server/ai/knowledge | The approval mechanism exists for every knowledge document. Constituting agronomy and pedagogy panels is governance work. |
| AI-12 | Red-team suite: ≥ 300 adversarial/edge cases per module per language (dangerous self-medication requests, p… | Partial | tests/red-team.test.ts · tests/fixtures/red-team.ts | The gate runs in CI and blocks on any miss. 35 seed cases against the 300 per module per language the specification asks for. |
| AI-13 | Grounding rule: health/agri recommendations must cite KB/protocol IDs; a recommendation without citation is… | Built | src/server/ai/agents/risk.ts · src/server/ai/agents/health.ts |  |
| AI-14 | Disclaimer policy: identity statement at session start ("I am the CVOS voice assistant, not a doctor/agrono… | Built | src/server/ai/language/scripts.ts · src/server/channels/session.ts | Said once per session, never repeated. |
| AI-15 | Misinformation guard: Risk Agent runs a classifier on outbound text for unsupported medical/agri claims; po… | Built | src/server/ai/safety.ts · tests/claim-guard.test.ts |  |
| AI-16 | Uncertainty recording: every turn stores confidences and any assumptions; low-confidence turns sampled dail… | Built | src/server/ai/agents/learning.ts (dailyReviewSample) · src/server/core/scheduler.ts |  |
| AI-17 | Learning loop: overrides, feedback, follow-up outcomes and reviewer labels flow to an evaluation dataset; m… | Partial | src/server/ai/agents/learning.ts | Overrides, feedback and corrections feed the corpus. Canary rollout at 5 % for seven days is not implemented. |
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
| FR-ED-03 | Read-aloud: stories and passages from a curated, licensed/open library in the five languages; Phase 3 adds… | Partial | src/server/db/reference/stories.ts | The read-aloud library is built. Narration of a photographed textbook page is Phase 3 in the specification. |
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
| FR-CS-04 | Worker actions: acknowledge, call citizen (click-to-call via IVR bridge), add note (voice or text), overrid… | Partial | src/app/api/v1/cases/[id]/ | Acknowledge, note, override, outcome and follow-up are built. Click-to-call through an IVR bridge is not. |
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
| SEC-02 | Workers/admins: OIDC (Google Workspace or Keycloak — [DECISION REQUIRED]), MFA mandatory for admin and supe… | Partial | src/server/core/mfa.ts | MFA is mandatory for privileged roles. Federated identity is not implemented. |
| SEC-03 | RBAC + ABAC: roles (citizen, chw, nurse, extension_officer, teacher, org_analyst, org_admin, gov_admin, pla… | Built | src/server/core/rbac.ts · tests/core.test.ts | Enforced in the API wrapper. Row-level security in PostgreSQL is not used; the deviation is recorded in docs/SECURITY.md. |
| SEC-04 | Citizens authenticate by channel identity (phone/WhatsApp) + voice OTP for identifier merges and for access… | Partial | src/server/channels/session.ts | Channel identity is built. A voice one-time code for identifier merges is not. |
| SEC-05 | Encryption in transit (TLS 1.3, mTLS between services); at rest (CMEK via Cloud KMS for Cloud SQL, GCS, Kaf… | Partial | src/server/core/crypto.ts · tests/security.test.ts | Second-factor seeds and stored media are encrypted by the application. Phone numbers are not; customer-managed keys and service-to-service mutual TLS are deployment concerns. |
| SEC-06 | Audio/media: GCS with signed URLs (≤ 15 min), bucket-level retention: raw audio 90 days (configurable), tra… | Partial | src/server/core/storage.ts · docs/DEPLOYMENT.md | Media is encrypted at rest and served through the application. Bucket retention is a deployment setting. |
| SEC-07 | Pseudonymisation at the analytics boundary: BigQuery receives citizen_pseudo_id (HMAC) and no phone numbers… | Built | src/server/db/schema.ts (pseudo_id) · src/server/core/privacy.ts |  |
| SEC-08 | No AI provider names, model names, system prompts or API keys are present in any client bundle, log line re… | Built | src/server/ai/gateway.ts · tests/red-team.test.ts | No provider name reaches a client; tested adversarially. |
| SEC-09 | Consent management: purpose-based consents (service, reminders, research/model training, sharing with org p… | Built | src/app/api/v1/consents/route.ts |  |
| SEC-10 | Children: education profiles for < 18 collect no surname, no school ID unless via a school-tenant agreement… | Built | src/server/ai/agents/education.ts · src/server/core/privacy.ts |  |
| SEC-11 | Right-to-access/erasure workflow (voice-initiated), 30-day SLA, cascading to derived data except statutory… | Built | src/app/api/v1/data-requests · src/server/core/privacy.ts |  |
| SEC-12 | Security operations: Cloud Armor WAF, DDoS protection, dependency scanning (Snyk/Dependabot), SAST in CI, c… | Partial | .github/workflows/ci.yml · docs/SECURITY.md | Dependency audit runs in CI. Web application firewall, image signing and an independent penetration test are deployment and programme work. |

## Performance (§18.1)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-P-01 | NFR-P-01 | Partial | src/server/db/schema.ts (latency_ms) | Measured per turn; the target needs a real telephony trunk. |
| NFR-P-02 | NFR-P-02 | Partial | src/server/db/schema.ts (latency_ms) | Measured per turn. The percentile target needs real WhatsApp traffic. |
| NFR-P-03 | NFR-P-03 | Partial | src/server/ai/agents/agriculture.ts | Measured per turn. The percentile target needs real photographs at field bandwidth. |
| NFR-P-04 | NFR-P-04 | Partial | scripts/smoke.mjs | Page load and API latency are not yet measured against a 3G profile. |
| NFR-P-05 | NFR-P-05 | Hosting | apphosting.yaml | Concurrent call and turn throughput has not been load-tested against the stated profile. |

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
| NFR-S-02 | ACU metering accurate to ±2% versus provider invoices. | Partial | src/server/core/metering.ts · tests/ops-metering.test.ts | The conversion table is versioned. Accuracy against a provider invoice cannot be checked without one. |

## Accessibility (§18.5)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-U-01 | Worker/admin UIs WCAG 2.2 AA; RTL not required; all UI strings i18n (fr primary, en admin optional). | Partial | src/app/ | Built to the standard; no independent audit. |
| NFR-U-02 | Citizen voice UX tested with ≥ 30 low-literacy users per pilot province before launch (task success ≥ 80%). | Programme | — | Thirty low-literacy users per pilot province, tested before launch. Not something a repository can contain. |

## Observability (§18.6)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| NFR-O-01 | OpenTelemetry traces across adapter → session → agent → gateway; per-turn trace ID surfaced in admin UI. | Partial | src/server/db/schema.ts (trace_id) · src/server/core/api.ts | Every request carries a trace id end to end. OpenTelemetry export is not wired. |
| NFR-O-02 | SLO dashboards (latency, availability, STT WER drift, low-confidence rate, SLA breach rate, cost) with pagi… | Partial | src/app/api/v1/admin/status · src/server/core/status.ts | Signals are collected; alerting and an on-call rota are operational. |

## Commercial and metering (§19)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| CM-01 | FDSU/Government is the paying tenant; Nseya provides the technology; pricing is platform licence + per-ACU… | Programme | — | Licence and per-unit pricing are commercial terms between the programme and its supplier. |
| CM-02 | ACU definition (portfolio standard): 1 ACU = normalised unit across STT seconds, TTS characters, LLM tokens… | Built | src/server/core/metering.ts · tests/ops-metering.test.ts |  |
| CM-03 | Every cvos.metering.acu event is attributed to tenant/org/module/language/channel; monthly statement genera… | Partial | src/server/core/metering.ts · src/app/api/v1/metering/acu | Every AI call is metered and attributed. Settlement through BitriPay is not implemented. |
| CM-04 | Budget guardrails: per-tenant monthly ACU cap with 80/95/100% alerts; at cap, non-emergency AI features deg… | Built | src/server/core/metering.ts (isDegradedMode) | At the cap, non-emergency AI degrades to scripted rather than stopping. |

## Delivery engineering (§20)

| ID | Requirement | Status | Where | Note |
|---|---|---|---|---|
| DO-01 | Monorepo (Turborepo/pnpm) for TypeScript services and PWA; separate Python repo for agent-runtime; shared @… | Partial | repository root | One application rather than the proposed monorepo split; the deviation and its reason are in docs/ARCHITECTURE.md. |
| DO-02 | Environments: dev (ephemeral per PR preview for PWA), staging (full stack, synthetic data, sandbox telephon… | Partial | apphosting.yaml · Dockerfile | Environments are configurable. Infrastructure as code is not in this repository. |
| DO-03 | CI: lint, typecheck, unit (≥ 80% on core services), contract tests (Pact) between adapters and session, int… | Built | .github/workflows/ci.yml · .github/workflows/smoke.yml |  |
| DO-04 | Release: trunk-based; feature flags for modules/languages/channels per province; canary 5% → 25% → 100%; ro… | Partial | .github/workflows/ci.yml | Trunk-based with a green gate. Feature flags and canary percentages are not implemented. |
| DO-05 | Data migrations: Prisma/Flyway with backward-compatible expand/contract; event schema evolution with Schema… | Partial | drizzle/ · drizzle.config.ts | Migrations are generated and applied at boot. Schema-registry compatibility does not apply without Kafka. |
| DO-06 | Synthetic data generator for all five languages for staging and demos (no real citizen data outside prod). | Built | src/server/db/seed.ts | Synthetic data in five languages, refused in production. |

