# 06 — Platform Modules

Module-by-module product specification. Every module records what exists, the
tables and routes that implement it, and what this document set adds. Nothing
existing is removed.

---

## 6.1 Module map

| # | Module | Status | Primary tables | Primary routes |
|---|---|---|---|---|
| M-01 | Interaction Engine | EXISTS | `interactions`, `sessions`, `files` | `/v1/interactions`, `/v1/sessions` |
| M-02 | Channel Gateway | EXISTS | `sessions`, `sync_events` | `/hooks/*` (9) |
| M-03 | Health | EXISTS | `health_triage_records`, `protocol_versions`, `service_directory` | `/v1/health/*` |
| M-04 | Agriculture | EXISTS | `agriculture_reports`, `agri_clusters`, `planting_calendars`, `input_registry`, `market_prices` | `/v1/agriculture/*` |
| M-05 | Education | EXISTS | `education_sessions`, `learner_profiles`, `learning_evidence`, `stories` | `/v1/education/*` |
| M-06 | Case Management | EXISTS | `cases`, `case_events`, `follow_ups`, `tasks` | `/v1/cases/*`, `/v1/queues`, `/v1/tasks` |
| M-07 | Risk & Safety | EXISTS | `risk_assessments`, `ai_overrides`, `safeguarding_records` | within M-01/M-06 |
| M-08 | Notifications | EXISTS | `notifications`, `notification_templates`, `schedules` | `/v1/notifications/*`, `/v1/reminders` |
| M-09 | Reporting & Analytics | EXISTS | `reports`, `report_definitions` | `/v1/reports/*`, `/v1/report-jobs/*`, `/v1/analytics/*` |
| M-10 | Language & Corpus | EXISTS | `language_corpus`, `language_lexicon`, `language_quality`, `glossaries` | `/v1/language/*`, `/v1/admin/languages` |
| M-11 | Knowledge & Protocols | EXISTS | `kb_documents`, `kb_chunks`, `protocol_versions`, `prompt_versions` | `/v1/knowledge/search`, `/v1/admin/kb`, `/v1/admin/protocols` |
| M-12 | Clinical Review Board | EXISTS | `review_boards`, `review_board_members`, `review_submissions`, `review_signoffs` | `/v1/review/*`, `/v1/admin/review/members` |
| M-13 | Identity & Access | EXISTS | `users`, `identifier_claims`, `auth_attempts`, `break_glass_access` | `/v1/auth/*`, `/v1/users`, `/v1/admin/break-glass` |
| M-14 | Privacy & Consent | EXISTS | `consents`, `data_requests`, `files` | `/v1/consents`, `/v1/data-requests`, `/v1/me/delete` |
| M-15 | Media & Storage | EXISTS | `files` | `/v1/media/uploads`, `/v1/files/*`, `/v1/me/photo` |
| M-16 | Offline & Sync | EXISTS | `sync_events`, `idempotency_keys` | `/v1/sync/events`, `/v1/autosave` |
| M-17 | Metering & Cost | EXISTS | `ai_usage_logs`, `admin_config` | `/v1/metering/acu` |
| M-18 | Administration | EXISTS | `admin_config`, `provider_credentials`, feature flags | `/v1/admin/*` (18) |
| M-19 | Tenancy & Territory | EXISTS | `tenants`, `organisations`, `provinces`, `territories` | `/v1/admin/tenants`, `/v1/admin/organisations` |
| M-20 | Observability & SLO | EXISTS | `api_logs`, `slo` measurements | `/v1/system/*` |
| M-21 | Public Site & SEO | EXISTS | `blog` content files | `(public)/*` 15 pages |
| M-22 | **Agent Runtime** | **NEW** | `agent_*` (7 tables) | `/v1/agents/*` |
| M-23 | **Command Centres** | **NEW** | views over the above | `/v1/command-centre/*` |
| M-24 | **Connector Registry** | **NEW** | `connectors`, `connector_health` | `/v1/admin/connectors` |
| M-25 | **Developer Platform** | **NEW** | `service_accounts`, `api_keys`, `webhook_subscriptions` | `/v1/developer/*` |
| M-26 | **Knowledge Graph** | **NEW** | `kg_nodes`, `kg_edges` | internal |
| M-27 | **Sovereign Provisioning** | **NEW** | `tenant_provisioning` | `/v1/admin/tenants/provision` |

---

## 6.2 M-01 Interaction Engine — EXISTS

The single path every citizen question takes, whatever the channel.

### Pipeline (`ai/agents/orchestrator.ts`)

```
1  autosave            persist the raw input before anything can fail
2  transcribe          audio → text (gateway stt)        [skipped for text]
3  transcript quality  assessTranscript() — empty/garbled → clarify, not guess
4  language detect     offline LID first, model second
5  language gate       languageMode() — degraded language changes the channel
6  personalisation     profile context, remembered language
7  DANGER SIGN SCAN    detectRoutingDangerSigns() — DETERMINISTIC, pre-model
8  module routing      hint, else classify
9  courtesy            classifyCourtesy() — short-circuits trivial turns
10 specialist agent    health | agriculture | education | general
11 RISK SCORING        scoreRisk() — DETERMINISTIC thresholds
12 boundary check      detectBoundaryTopics() — refuse out-of-scope safely
13 claim check         checkOutboundClaims() — no unsupported clinical claim
14 localise            French canonical → citizen language + glossary
15 script / voice      scriptText(), toSpokenText() for spoken channels
16 WORKFLOW            shouldAutoCreateCase() → openCase() → assign → notify
17 synthesize          text → audio (gateway tts) if the channel is spoken
18 audit               every step, with actor, role, language, module, version
```

**Steps 7, 11 and 16 are code, not model.** This is the platform's central
safety claim and every step of it is unit-tested.

### Autosave as a design principle

Each step writes its result to the interaction row as it completes. An
abandoned or crashed interaction still leaves a full trace. This is why
`interaction_status` has `abandoned` as a first-class value rather than being
inferred.

### Idempotency

`/v1/interactions` honours `Idempotency-Key` with a request fingerprint
(`withIdempotency`, `requestHash`). A duplicate with the same key and a
different body returns **409** with a citizen-readable French message, not a
silent second case.

### ADDED

| Addition | Why |
|---|---|
| Difficulty signature computed at step 8 and recorded on the row | Feeds the §05.10 model cascade and makes routing auditable |
| STT content-addressed cache, keyed by audio SHA-256 + language | Closes the re-transcription cost leak (§02.3) |
| `retrievalBudget` per module | Bounds context growth as the corpus grows |

---

## 6.3 M-02 Channel Gateway — EXISTS

| Channel | Transport | Inbound auth | Notes |
|---|---|---|---|
| IVR | Twilio voice webhooks (5 routes) | **Signature verified; refused when unverifiable in production** | End-of-utterance tunable (`IVR_END_OF_UTTERANCE_MS`) |
| WhatsApp | Meta Graph (and Twilio for alerts) | Signature verified, fail-closed in production | 24 h free-form window enforced (`WHATSAPP_WINDOW_MS`) |
| USSD | Operator HTTP | **Unsignable by the operator's format** — rate-limited per number under a keyed digest | Menu state machine (`channels/menus.ts`) |
| SMS | Operator HTTP + DLR callback | Same | Max 3 concatenated parts (`MAX_SMS_PARTS`) |
| PWA | HTTPS + session token | Full `handle()` wrapper | Offline outbox, background sync |

### Driver + credentials rule

A channel sends only when **both** the operator and its credentials are
present (`channels/modes.ts`). A driver alone leaves the channel writing to
the log, and the readiness probe reports *"Opérateur nommé sans identifiants"*
rather than claiming a working channel. This is enforced by one rule that both
the senders and the probe consult.

### ADDED

- **Channel capability negotiation** per interaction: what the channel can
  carry (audio length, message size, interactivity) recorded on the session so
  an agent never drafts a 600-character SMS.
- **Channel failover for alerts**: WhatsApp → SMS → voice already exists as
  `fallbackChain()`; extended with per-territory channel reachability learned
  from delivery reports.

---

## 6.4 M-03 Health — EXISTS

| Capability | Implementation |
|---|---|
| Symptom understanding | `ai/agents/health.ts` against approved protocol text only |
| Protocol engine | `ai/protocols/engine.ts`, `extraction.ts`, `aggregation.ts` — deterministic |
| Vaccination schedule | `ai/protocols/vaccination.ts`, `/v1/health/vaccination-schedule` |
| Facility directory | `service_directory`, `/v1/health/facilities` — institutional contact data, deliberately readable |
| Danger signs | `ai/safety.ts` — deterministic lists per protocol, pre-model |
| Severity | 4 levels; severity 4 → emergency script + human alert |
| Safeguarding | `safeguarding_records`, attached by `attachSafeguardingCase()` |

**Three prohibitions, enforced and tested:** never diagnose; never give a dose
outside approved protocol text; never claim a human was alerted when no channel
could carry the alert.

### ADDED

- `health_clusters` table mirroring `agri_clusters`, fed by the §05.4.3
  space-time scan.
- Referral loop closure: a case referred to a facility gets a follow-up asking
  whether the citizen reached it — the only outcome signal the platform can
  honestly collect.

---

## 6.5 M-04 Agriculture — EXISTS

| Capability | Implementation |
|---|---|
| Crop/livestock advisory | `ai/agents/agriculture.ts` |
| Photo diagnosis | Gateway `vision` + `ai/tools/image-quality.ts` pre-check (HEIC/HEVC decode supported) |
| Planting calendar | `planting_calendars`, `/v1/agriculture/calendar` |
| Market prices | `market_prices`, `ai/tools/market.ts`, CSV upload route |
| Input registry | `input_registry` — approved seed, fertiliser, pesticide |
| Weather | `ai/tools/weather.ts` |
| Clusters | `agri_clusters`, `/v1/agriculture/clusters` |

**Image quality pre-check is a cost and a safety control**: a blurred or
unusable photo is refused with guidance before a vision model is paid for and
before a wrong diagnosis becomes possible.

---

## 6.6 M-05 Education — EXISTS

| Capability | Implementation |
|---|---|
| Curriculum alignment | `ai/education/curriculum.ts` |
| Lessons & explanation | `/v1/education/lessons`, `/v1/education/plan` |
| Quizzes | `/v1/education/quiz`, `/answer`, `ai/education/quiz.ts` |
| Spaced repetition | `ai/education/spaced-repetition.ts` |
| Learner profile | `learner_profiles`, `/v1/education/profile` |
| Evidence of learning | `learning_evidence`, `/v1/education/evidence` |
| Stories | `stories`, `/v1/education/stories` |
| **Child safety** | `ai/education/child-safety.ts` — content filter, disclosure routing, no unsupervised clinical or personal advice |

**Hard rule:** no generated content reaches a child unless the content version
it derives from has board approval. Enforced at the gate, not at the prompt.

---

## 6.7 M-06 Case Management — EXISTS

### State machine (`caseStatusEnum`, transitions in `ai/agents/workflow.ts`)

13 states: `open`, `open_emergency`, `assigned`, `acknowledged`, `in_progress`,
`needs_follow_up`, `reassigned`, `escalated`, `escalated_up`, `resolved`,
`closed`, `cancelled`, `duplicate`.

`closed`, `cancelled` and `duplicate` are terminal. `open → resolved` is
permitted — a case correctly answered at first contact should not be forced
through ceremony.

| Operation | Route |
|---|---|
| List / create | `/v1/cases` |
| Read / update | `/v1/cases/[id]` |
| Acknowledge | `/v1/cases/[id]/acknowledge` |
| Assign | `/v1/cases/[id]/assignments` |
| Escalate | `/v1/cases/[id]/escalate` |
| Transition | `/v1/cases/[id]/transitions` |
| Notes | `/v1/cases/[id]/notes` |
| Follow-ups | `/v1/cases/[id]/follow-ups` |
| Merge duplicates | `/v1/cases/[id]/merge` |
| Risk override | `/v1/cases/[id]/risk-overrides` |
| **Bridged call** | `/v1/cases/[id]/call` — platform calls the worker, then bridges to the citizen. **The worker never sees the citizen's number** |

The bridged call is a privacy control disguised as a convenience: once a number
is in a private handset it is out of the platform's reach for ever.

### SLA

`sla_sweep` and `blocked_cases` run in the scheduler. Breach escalates by rule.

### ADDED

- Territory scope on case reads (closes G-08) — §11.3.
- Shift handover artefact generated by the §04.3 Handover agent.

---

## 6.8 M-08 Notifications — EXISTS

| Property | Value |
|---|---|
| Channels | `in_app`, `sms`, `whatsapp`, `voice`, `email` |
| Status | `queued`, `sent`, `failed`, `read` |
| Fallback chain | whatsapp → sms → voice; sms → voice |
| Consent | `hasReminderConsent()` gates every reminder |
| Quiet hours | `NOTIFY_QUIET_START_HOUR` / `END_HOUR` |
| Weekly cap | `NOTIFY_WEEKLY_CAP` — a public service must not become a nuisance |
| Dedupe | `NOTIFY_DEDUPE_WINDOW_HOURS` |
| Retry | `NOTIFY_RETRY_ATTEMPTS` with backoff |
| Templates | `notification_templates`, localised |
| Broadcast | `/v1/notifications/broadcast`, scoped by `core/notification-scope.ts` |
| Acknowledgement | `/v1/notifications/[id]/ack` |

**The voice channel exists because of the platform's premise**: the people most
likely to need an escalation followed up are the least likely to read the SMS
about it.

---

## 6.9 M-09 Reporting & Analytics — EXISTS

| Capability | Implementation |
|---|---|
| Live dashboards | `/v1/analytics/dashboard`, `/activity`, `/alerts`, `/insight`, `/module/[module]` |
| Direct exports | `/v1/reports/[type]` — 7 types, CSV |
| Async jobs | `/v1/report-jobs` → `statusUrl` → terminal status `ready` → `/download` |
| Formats | CSV, XLSX (`exceljs`), PDF (`pdfkit`) |
| Scheduled definitions | `report_definitions`, scheduler `scheduled_reports` |
| Expiry | `expire_reports` sweep |
| **Small-count suppression** | Enforced in `reporting.ts` — a cell below threshold is suppressed, not rounded |

### ADDED

- **Input-hash memoisation**: a scheduled report whose inputs are unchanged
  returns the prior artefact instead of regenerating (cost leak §02.3).
- **Denominator enforcement**: every numeric cell carries its denominator or is
  rejected at render time (§04.5).

---

## 6.10 M-10 Language & Corpus — EXISTS

The module that makes the platform honest about what it does not know.

| Capability | Implementation |
|---|---|
| Detection | `ai/language/detect.ts` — offline LID first |
| Confidence | `ai/language/confidence.ts` — a vector, not a scalar |
| **Gates** | `ai/language/gates.ts` — `languageMode()` returns the operating mode per language |
| Scripts | `ai/language/scripts.ts` — orthography normalisation |
| Voice | `ai/language/voice.ts` — spoken-form rendering |
| Scripted fallbacks | `ai/language/scripted.ts` — approved fixed text when generation is not safe |
| Glossary | `glossaries`, `ai/language/glossary.ts` |
| Corpus | `language_corpus`, `/v1/language/samples` |
| Lexicon | `language_lexicon`, `/v1/language/lexicon` |
| Quality | `language_quality`, `/v1/language/proficiency` |
| Export | `/v1/language/export` — the corpus is a national asset and must be exportable |

**What a gate does when a language degrades:** it changes the channel's
behaviour — scripted responses, French fallback with an offer to be called
back, or refusal to answer generatively — rather than producing confident
nonsense. Scheduler step `language_gates` evaluates daily.

---

## 6.11 M-19 / M-27 Tenancy, Territory and Sovereign Provisioning

### EXISTS

`tenants` → `organisations` → `territories` / `provinces`. Row-level isolation
by tenant on every scoped query.

### NEW — provisioning a sovereign instance

A ten-step workflow, each step gated and auditable:

| Step | Action | Gate |
|---|---|---|
| 1 | Create tenant; declare `DATA_RESIDENCY` and `DEPLOYMENT_JURISDICTION` | Residency policy must be satisfiable by at least one available provider, or the tenant runs offline-only |
| 2 | Load territory and population reference data | Denominators are mandatory — a tenant without them cannot render analytics |
| 3 | Declare languages and initial gate thresholds | Every declared language starts **degraded** until corpus and review raise it |
| 4 | Fork protocol set from the reference tenant | Forked protocols enter `draft`, never `active` |
| 5 | Appoint the review board and seats | Quorum composition is the tenant's decision |
| 6 | Board signs protocols | `clinicalReadiness()` blocks service until quorum signs |
| 7 | Configure channels and credentials | Driver + credentials rule applies |
| 8 | Create the first `platform_admin` via bootstrap token | Single-use, expiring |
| 9 | Run `scripts/smoke.mjs` against the instance | Must pass |
| 10 | Canary at 5 % for 7 days | Release agent watches |

**Exit is a first-class requirement.** A tenant must be able to export every
table it owns, its corpus, its protocols and its audit chain, in open formats,
on demand. A public institution that cannot leave has not been given software;
it has been given a dependency.

---

## 6.12 M-22 Agent Runtime — NEW

| Component | Responsibility |
|---|---|
| Registry | `agent_definitions` — the compiled contract of each agent |
| Authority | `agent_authority` — autonomy per agent × action × tenant |
| Scheduler | Trigger evaluation; cron, event and on-demand |
| Executor | Runs an agent with budget, timeout, scoped db, checkpointing |
| Proposal store | `agent_proposals` with mandatory evidence |
| Action ledger | `agent_actions` with reversal payloads |
| Fault store | `agent_faults` — feeds the governance agent |
| Watchdog | Auto-reverses an L3 action whose signal has not cleared |

Routes: `/v1/agents` (list), `/v1/agents/[id]/runs`, `/v1/proposals`,
`/v1/proposals/[id]/accept|reject`, `/v1/actions/[id]/reverse`,
`/v1/admin/agents/[id]/authority`, `/v1/admin/agents/kill-switch`.

---

## 6.13 M-24 Connector Registry — NEW

Closes G-14. Each external dependency becomes a declared connector with health,
quota, failover and residency metadata rather than bespoke code. Full catalogue
in §07.

---

## 6.14 M-25 Developer Platform — NEW

| Component | Specification |
|---|---|
| Service accounts | Extends `core/service-identity.ts`; owned by an organisation |
| API keys | Scoped to permissions ⊆ the owning organisation's; prefix-identifiable; last-4 shown, never the value |
| Sandbox | A dedicated tenant with synthetic data only. **No production citizen data is ever reachable from a sandbox key** |
| Webhooks | `webhook_subscriptions` with HMAC signing, replay window, dead-letter and redelivery |
| Documentation | Generated OpenAPI 3.1 from the route definitions |
| Rate limits | Per key, per minute and per day, with published headers |

**What this is not:** it is not an app marketplace and it carries no payment or
billing. Integrators are institutions, and access is granted by agreement.

---

## 6.15 M-21 Public Site & SEO — EXISTS

15 public pages plus a 29-article blog, each article passing a build-time SEO
gate (`PASS_MARK = 90`). Pages: accès, accessibilité, aide, blog (+ category and
tag indexes), conditions, confidentialité, contact, financement, gouvernance,
langues-nationales, partenaires, programme, services, urgence.

The public site is **part of the trust architecture**, not marketing. `/urgence`
must render and give correct emergency guidance with no JavaScript, no session
and no network beyond the first byte.
