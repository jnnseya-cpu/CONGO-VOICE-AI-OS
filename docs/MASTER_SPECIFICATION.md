# CONGO VOICE AI OS — Master Specification

**Plateforme Nationale d'Inclusion Numérique Vocale en Santé, Agriculture et Éducation — République Démocratique du Congo**

| Field | Value |
|-------|-------|
| Document | `docs/MASTER_SPECIFICATION.md` — consolidated product and technical specification |
| Consolidates | the founding brief (`docs/PROJECT_REQUIREMENTS.md`), **PRD-CVOS-v1.0** (engineering PRD) and the **Developer-Ready Product Requirements and Technical Specification v1.0** |
| Repository | this repository — Next.js 16 application (frontend + `/api/v1` + channel webhooks), Drizzle/PostgreSQL, provider-neutral AI gateway |
| Status legend | **Implemented** = code + tests in this repository · **Partial** = a working subset, remainder specified · **Planned (Phase n)** = specified, not built |
| Funding logic | Free for citizens. Funded by government, FDSU, donors and NGOs. No citizen is ever charged, metered or up-sold. |
| Core rule | Deterministic safety and human accountability govern the AI. No high-impact workflow is delegated to an unrestricted language model. |

> *Le projet ne demande pas simplement un financement pour développer une application ; il propose une infrastructure nationale d'inclusion numérique capable de connecter les citoyens ruraux aux services essentiels de santé, d'agriculture et d'éducation par la voix, dans les langues nationales congolaises.*

**How to read this document.** Sections 1–4 are product context and the operating picture per user type. Sections 5–11 are the build specification: agents, modules, architecture, data model and APIs, each mapped to real files in this repository. Sections 12–17 cover funding, security, administration, roadmap and quality. Section 18 is the full requirement traceability matrix (every identifier of the brief and of both PRDs). Section 19 lists the decisions that block estimation; section 20 is the glossary.

**Where the two PRDs diverge, both positions are preserved and the implemented choice is stated explicitly.** Divergences are marked `[DIVERGENCE]`; blocking decisions are marked `[DECISION REQUIRED]`.

---

## Table of contents

1. Executive Product Vision
2. Market Gap Deep Review
3. Complete User Ecosystem
4. AI Command Centres per User Type
5. Core AI Agents
6. Full Platform Modules
7. Institutional Billing and Disbursement Door
8. Third-Party Connector Ecosystem
9. Production-Grade Architecture
10. Database Schema
11. API Specification
12. Funding and Sustainability Model
13. Security, Compliance and Risk
14. Admin Super Control Centre
15. Developer Build Roadmap
16. Competitive Advantage
17. Quality, Testing and Release Assurance
18. Requirement Traceability Matrix
19. Decisions Required
20. Glossary

---

# 1. Executive Product Vision

## 1.1 What this is

CONGO VOICE AI OS (CVOS) is a **national, voice-first AI infrastructure** that lets a Congolese citizen obtain health orientation, agricultural support and educational help **by speaking naturally** in French, Lingala, Kikongo, Swahili or Tshiluba — from any phone, without reading, writing, an application, data literacy or a bank account.

It is explicitly **not** a chatbot, not an information website, not a "simple voice assistant". It is an operating system with five layers, and every layer is a distinct engineering artefact in this repository:

| Layer | What it does | Where it lives |
|-------|--------------|----------------|
| **Channels** | Voice call (IVR), WhatsApp, USSD, SMS, PWA, assisted console — one citizen identity across all | `src/server/channels/**`, `src/app/api/hooks/**`, `src/app/api/v1/sessions/**` |
| **Language** | Language ID, code-switch handling, speech-to-text, French pivot, translation, simplification, text-to-speech, continuous learning from every conversation | `src/server/ai/agents/language.ts`, `src/server/ai/agents/learning.ts`, `src/server/ai/gateway.ts` |
| **Agents** | Language, Health, Agriculture, Education, Risk, Workflow, Reporting, Personalisation, Learning — orchestrated **deterministically**, not by an autonomous planner | `src/server/ai/agents/**` |
| **Cases and workflow** | Escalation to community health workers, extension officers and teachers; queues, SLA clocks, assignment, overrides, follow-ups, merges | `src/server/ai/agents/workflow.ts`, `src/app/api/v1/cases/**` |
| **Intelligence** | Regional trends, outbreak and pest early warning, learning gaps, government and NGO dashboards, ACU cost metering, governed reporting | `src/server/ai/agents/reporting.ts`, `src/server/ai/agents/clusters.ts`, `src/server/reports/**`, `src/server/core/metering.ts` |

## 1.2 The core loop

The citizen speaks → the system detects the language → transcribes → understands the intent → asks the minimum safe follow-up questions → gives a practical answer → saves everything → escalates when required → sends reminders and follow-ups.

Implemented end to end in `runInteraction()` (`src/server/ai/agents/orchestrator.ts`), called identically by every channel through `runTurn()` (`src/server/channels/session.ts`). Proven by `tests/pipeline.test.ts` and `tests/channels-session.test.ts`.

## 1.3 The seven-part answer contract

Every answer, in every module and on every channel, states:

1. **what the citizen is asking** (`asking`)
2. **what the system understood** (`understanding`, including assumptions)
3. **what risk exists** (`risk.level`, `risk.score`, `risk.flags`)
4. **what action is recommended** (`action`, low-cost or no-cost first)
5. **whether escalation is required, to whom and why** (`escalation.required | to | reason`)
6. **the confidence** (`confidence.score`, `confidence.low`)
7. **the saved interaction summary** (`summary`)

Contract: `FinalAnswer` in `src/server/ai/schemas.ts`, validated with zod, persisted on `interactions.structured`. **Implemented.**

## 1.4 Non-negotiables

| Rule | Enforcement in code |
|------|--------------------|
| The platform never diagnoses, never prescribes, never gives a dose outside approved protocol text | `sanitiseHealthGuidance()` in `src/server/ai/safety.ts`; forbidden-output regular expressions; `tests/health-triage.test.ts` |
| Severity is decided by a versioned decision tree, never by a model | `runProtocol()` in `src/server/ai/protocols/engine.ts`; `tests/health-protocols.test.ts` |
| Danger-sign detection works with every AI provider switched off | `detectDangerSigns()` / `DANGER_SIGN_KEYWORDS` in `src/server/ai/safety.ts`; offline provider in `src/server/ai/providers/mock.ts` |
| A health or agriculture recommendation without an approved citation is replaced by a scripted fallback | citation enforcement in `src/server/ai/agents/health.ts` §7 and `scoreRisk()` in `src/server/ai/agents/risk.ts` |
| The risk agent may raise severity, never lower it | `scoreRisk()` — "raise only" rule, `tests/health-triage.test.ts` |
| A safeguarding disclosure enters a restricted pathway and never appears in ordinary notifications | `detectSafeguarding()`, `safeguarding_records`, `SAFEGUARDING_NOTIFICATION_BODY` |
| Everything is saved: input, transcript, translation, answer, risk, escalation, override, notification, draft, failure | write-ahead autosave in the orchestrator; `event_store`; `audit_logs` hash chain |
| No provider name, model name, prompt or key ever reaches a client | `src/server/ai/gateway.ts` is the only vendor-aware module; `ai_usage_logs.providerKey` is internal |
| The citizen is never charged, metered against, or refused service for cost reasons; only *non-emergency* AI degrades at a funding cap | `isDegradedMode()` in `src/server/core/metering.ts`, consumed by the orchestrator |

## 1.5 Fundable outcome

For FDSU, the government and donor partners the fundable outcome is: **a measurable increase in access to essential services for populations excluded by language, literacy, connectivity and device barriers, with province-level intelligence that lets institutions act before problems become crises**, and a defensible **cost per completed outcome** published on the same page as the impact figures (`GET /api/v1/metering/acu`, `monthlyStatement()`).

North-star measure (PRD 2 §23.1): **completed, safe and useful service outcomes per 1,000 eligible citizens**, by geography, language and channel. A completed outcome requires more than an answer — comprehension or next action, escalation acknowledgement, or learning/farm follow-up evidence according to the domain. Raw interaction volume is explicitly *not* a success measure.

## 1.6 What is built today

- 53 tables (`drizzle/0000_init.sql`), one migration, PostgreSQL dialect, embedded PGlite for development and tests.
- 100+ `/api/v1` route handlers and 9 channel webhooks, every one of them through the same `handle()` guard.
- 10 approved clinical protocols, 37 approved knowledge documents (`content/kb/**`), 5 languages of scripted safety text.
- 22 Vitest suites, all running **offline** with no API key (`npm test`).
- A complete institutional surface: command dashboard, three module dashboards, case workspace, language console, reports, notifications, admin console, audit journal.

---

# 2. Market Gap Deep Review

## 2.1 The problem in one paragraph

Digital public services in the DRC assume the citizen can read, write, search, use a smartphone application, understand administrative French and afford data. Tens of millions of citizens fail one or more of these assumptions. The result is that health, agriculture and education support — the three services with the highest impact on household welfare — are least accessible to the people who need them most. CVOS inverts the model: **the citizen speaks; the system understands, guides, escalates, records and learns.**

## 2.2 Operating constraints that shape every requirement

| Constraint | Engineering consequence | Implemented as |
|------------|------------------------|----------------|
| Majority of rural users on feature phones | Voice call and USSD/SMS are mandatory, not optional | `src/app/api/hooks/ivr/twilio/**`, `src/app/api/hooks/ussd/route.ts`, `src/app/api/hooks/sms/route.ts` |
| 2G/EDGE common, 3G/4G patchy | Compressed audio, resumable chunked upload, offline queue, background sync | `POST /api/v1/media/uploads`, `src/server/channels/offline-queue.ts` |
| Intermittent electricity | Sessions resumable for 24 h; no long forced sessions; short answers | `findResumableSession()`, `RESUME_WINDOW_MS`, `chunkForSpeech()` |
| Low literacy, low digital confidence | Voice is the primary I/O; menus never deeper than two levels; no jargon | `COMMON_QUESTIONS` (`src/server/channels/menus.ts`), `ModulePage`/`VoiceConsole` |
| Code-switching is the norm | Token-level language tags, French pivot, no forced language choice | `LanguageAnalysis.mixedLanguages`, `interactions.transcriptTags` |
| Shared phones in households | Identity ≠ phone number; lightweight per-session confirmation; anonymous mode | `identifyCitizen()`, `shouldConfirmSharedPhone()`, `sessions.proxy` |
| Trust in institutions varies | The system identifies itself, states what it is not, and offers a human path one utterance away | `DISCLAIMERS` in `src/server/ai/safety.ts`; `shouldAutoCreateCase({humanRequested})` |
| Data sovereignty expectations | Portable stack, exportable data, no provider exposure, documented residency path | `docs/DEPLOYMENT.md` §5, `GET /api/v1/language/export`, `SEC-08` enforcement |

## 2.3 Against existing chatbot and IVR platforms

| Category | Typical product | What it does well | Where it fails the DRC rural case | CVOS answer |
|----------|-----------------|-------------------|-----------------------------------|-------------|
| Generic LLM assistants (consumer chat apps) | broad knowledge, fluent French/English | zero grounding, no escalation, no record, no protocol, invents dosages, needs data and literacy | deterministic protocol engine + citation enforcement + human queue + offline channels |
| Enterprise chatbot builders (dialogue-flow class) | intent trees, WhatsApp/SMS connectors | rigid intents break on code-switched speech; no clinical governance; no case ownership; per-message licensing hostile to a free public service | LLM used only for *understanding and explanation*; state machine and severity are code; ACU metering paid by the funding tenant |
| Telco IVR / call-centre platforms | reliable voice, national reach | menu-only, no natural speech, no learning loop, no analytics beyond call metrics; content changes need vendor tickets | natural speech with DTMF fallback (`FR-CH-02`); every call becomes structured, queryable data |
| Health hotlines (human call centres) | trusted, empathetic | staffing-bound capacity, no coverage at night, no structured record, no trend intelligence, cost per call does not fall with volume | AI answers the routine, humans receive only what must reach them (severity ≥ 2, low confidence, safeguarding); cost per completed outcome falls with volume |
| SMS health/agri advisory services (push-only) | cheap, works on any handset | one-way, no dialogue, no personalisation, no triage, no escalation loop | two-way sessions, reminders as one channel among five, consent-gated |
| Agri-advisory apps and plant-disease apps | good crop classifiers | smartphone-only, English/French text, no extension-officer loop, no registry check before recommending a chemical | photo *plus* voice; evidence quality gate; chemical guard against an authorised input registry; officer referral thresholds |
| Ed-tech / tutoring apps | rich content libraries | require reading, a smartphone and data; no oral assessment; no parent path for a non-reading household | oral quizzes with rubric-based scoring, read-aloud library, parent mode, hint-first homework policy |
| Health-system reporting (DHIS2-class) | national aggregation, ministry standard | starts *after* a facility visit; no citizen-side demand signal | CVOS captures demand and danger signs *before* the facility, and is designed to export to DHIS2 in Phase 5 |
| Humanitarian feedback platforms | complaint capture | not a service; not clinical; not real-time | service delivery *and* feedback in one loop (`POST /api/v1/interactions/{id}/feedback`) |

## 2.4 Against DRC digital public services

| Existing pattern | Gap for the rural citizen | What CVOS changes |
|------------------|---------------------------|-------------------|
| Ministry websites and PDF circulars | require literacy, French, data and a smartphone | voice in five national languages, on any handset |
| USSD services from banks and MNOs | transactional only, numeric menus, no advice | two-level menus that lead into a real conversation, answer by SMS |
| Facility-level paper registers | data arrives weeks later, aggregated by hand | every interaction is an event the same second, with province, module, language, severity |
| Community health worker networks (relais communautaires) | few workers, large territories, no prioritisation tool | prioritised queues with SLA clocks, routing territory → organisation → province → role, load-balanced |
| Agricultural extension services | visit schedules unrelated to where problems actually are | cluster detection opens an *unverified* signal that an officer validates in the field before anything is declared |
| National examinations support | urban, private tutoring | oral revision plans, spaced repetition nudges by SMS, TENAFEP and Examen d'État objectives |

## 2.5 The five gaps CVOS is built to close

1. **Language gap** — services exist in administrative French; citizens live in Lingala, Kikongo, Swahili and Tshiluba, mixed with French. Closed by the language layer *and* a learning loop that improves the four national languages from real conversations (`language_corpus`, `language_lexicon`, `GET /api/v1/language/proficiency`).
2. **Literacy and device gap** — closed by voice-first design and by the IVR/USSD/SMS channels, which need no application, no data and no reading.
3. **Safety gap** — a free-text AI answering health questions at national scale is a liability. Closed by the deterministic protocol engine, the red-flag keyword pass, the citation requirement and the mandatory human path.
4. **Accountability gap** — advice with no owner changes nothing. Closed by the case state machine: exactly one accountable queue, one owner, one clock, mandatory closure data.
5. **Intelligence gap** — institutions learn about outbreaks and learning collapses too late. Closed by the intelligence layer, with privacy suppression and *human validation* before any signal is called an outbreak.

## 2.6 What CVOS deliberately does not do (non-goals)

Carried verbatim in intent from PRD 2 §1.3 and PRD 1 §3.2. The platform MUST NOT:

- diagnose disease, prescribe controlled treatment, replace a clinician, certify a crop disease without adequate evidence, or guarantee market prices;
- act as an emergency service, a school examination authority, a surveillance system, or a source of punitive eligibility decisions;
- make a high-impact decision solely from an LLM response or a hidden model score;
- train third-party foundation models on identifiable citizen data by default;
- require an email address, a smartphone, reading ability or a continuous data connection for the core citizen journey;
- present model confidence as clinical probability or factual certainty;
- charge, meter, rank or profile a citizen commercially — CVOS carries **no citizen wallet, no citizen payment, no advertising and no commercial persuasion** (`scrubCommercial()` in `src/server/ai/education/child-safety.ts` removes it even from a model answer);
- deliver electronic medical records or a patient registry (CVOS produces triage summaries; DHIS2 integration is Phase 5);
- run marketplace transactions for produce (market prices are informational, dated and sourced);
- ship native iOS/Android applications in v1 (PWA first; Android after a device and offline validation).


---

# 3. Complete User Ecosystem

## 3.1 Personas carried from the brief and PRD 1

| ID | Persona | Device and languages | Jobs to be done |
|----|---------|----------------------|-----------------|
| P1 | **Maman Nsimba**, 34, farmer and mother, Kongo-Central | feature phone; Kikongo, some Lingala; not comfortable reading | "Is my child's fever dangerous tonight?" · "Why are my cassava leaves turning yellow?" · "Help my daughter with her homework since I can't" |
| P2 | **Papa Kalombo**, 51, maize and goat farmer, Kasaï-Oriental | basic Android, WhatsApp on shared data; Tshiluba and French | "What is this pest and what do I do that costs nothing?" · "When should I plant this season?" · "What is the maize price in Mbuji-Mayi?" |
| P3 | **Grâce**, 14, student, peri-urban Kinshasa | mother's smartphone in the evening; speaks Lingala, learns in French | "Explain fractions in Lingala" · "Quiz me for the TENAFEP" · "Read this story to me" |
| P4 | **Relais communautaire** (CHW), Équateur | Android, intermittent data | receive escalated cases with a summary, call back, record the outcome, see the village risk picture |
| P5 | **Agronome / extension officer**, Tshopo | Android/desktop | see clusters by territory, broadcast advice, prioritise field visits |
| P6 | **Ministry programme director / FDSU analyst**, Kinshasa | desktop, good connectivity | prove impact by province, spot service gaps, export for donors and cabinet |
| P7 | **Platform administrator** (operations) | desktop | tenants, languages, prompts, model routing, costs, incidents |

Top-level jobs (PRD 1 §2.4) are carried unchanged: JTBD-1 safe answer in one call · JTBD-2 low-cost farm action from a photo or description · JTBD-3 learn by voice at my level · JTBD-4 be found by a human when it is serious · JTBD-5 receive escalations with enough context and close the loop · JTBD-6 see problems emerging · JTBD-7 prove impact with defensible numbers.

## 3.2 Role and permission matrix (implemented)

Roles are the `user_role` enum (`src/server/db/schema.ts`); permissions are the `Permission` union and `ROLE_PERMISSIONS` map (`src/server/core/rbac.ts`). Field roles are additionally **module-scoped** by `ROLE_MODULE_SCOPE`, so a CHW cannot open an agriculture case.

| Implemented role | Permissions | Module scope | Maps to PRD 2 §2.2 role |
|------------------|-------------|--------------|-------------------------|
| `citizen` | `interaction:create`, `interaction:read_own`, `feedback:create`, `notification:read_own`, `autosave:write` | — | Citizen / learner / farmer |
| `chw` | citizen + `case:read/write/assign/escalate`, `language:review`, `dashboard:health` | health | Community health worker |
| `agri_officer` | citizen + case permissions, `language:review`, `dashboard:agri` | agriculture | Extension officer |
| `teacher` | citizen + case permissions, `language:review`, `dashboard:edu` | education | Teacher / education officer |
| `ngo` | citizen + `case:read`, all four dashboards, `report:export`, `language:review`, `language:export` | — (read) | Programme manager / implementing partner |
| `gov_admin` | field permissions + `interaction:read_all`, all dashboards, `report:export`, `audit:read`, `notification:broadcast`, `language:export` | — | National analyst / gov administrator |
| `platform_admin` | everything above + `dashboard:admin`, `admin:config`, `user:manage` | — | Platform operator / super administrator |

`[DIVERGENCE]` PRD 2 §2.2 specifies eleven distinct roles (adding *proxy user/caregiver*, *clinician/supervisor*, *safety reviewer*, *super administrator* as separate identities); PRD 1 §16.2 lists ten. **Implemented choice: seven roles plus orthogonal attributes**, because the additional distinctions are expressed as attributes rather than roles in this codebase:

| PRD 2 role | How it exists today | Status |
|------------|--------------------|--------|
| Proxy user / caregiver | `sessions.proxy`, `consents.proxy` (`{present, onBehalfOf, basis}`), `recordSharedPhoneAnswer()`, `channel = "assisted"` | **Partial** — data model complete, dedicated proxy console Planned (Phase 3) |
| Clinician / supervisor | `gov_admin` acts as supervisor in `TRANSITIONS` (`SUPERVISORS`), MFA-gated overrides | **Partial** — a distinct `nurse`/`supervisor` enum value is Planned (Phase 3) |
| Safety reviewer | `ai.contract.violation` events, `ai_overrides`, `evaluation_runs`, low-confidence sampling | **Partial** — a dedicated review queue UI is Planned (Phase 3) |
| National analyst (de-identified only) | `gov_admin` with `report:export` over suppressed report datasets | **Partial** — a read-only de-identified analyst role is Planned (Phase 4) |
| Super administrator | `platform_admin` + break-glass (`break_glass_access`, `POST /api/v1/admin/break-glass`) | **Implemented** |

## 3.3 Human actors, one by one

### 3.3.1 Citizen (citoyen, apprenant, producteur)
Enters by **Continuer sans compte** (anonymous session, `POST /api/v1/auth/login {anonymous:true}`) or by being recognised from a phone identifier on IVR/WhatsApp/USSD/SMS (`identifyCitizen()`). Owns: own conversations, own consents, own reminders, own feedback, own access/erasure requests. Never sees: another citizen's data, institutional dashboards, case queues. Screens: home OS screen `/`, `/sante`, `/agriculture`, `/education`, `/historique`, `/notifications`, `/messages`, `/parametres`, `/ressources`.

### 3.3.2 Proxy and caregiver
A parent, neighbour, teacher or call-centre agent speaking **on behalf of** someone. Declared at session start on shared phones ("Is this still …?"), stored in `sessions.proxy`, and required on the consent record (`CON-004`). The assisted console (`channel = "assisted"`, `POST /api/v1/cases` with a manual case) is the worker-side entry point.

### 3.3.3 Community health worker — relais communautaire
Receives severity ≥ 2 cases routed to their territory queue, acknowledges within the SLA clock (15 min emergency / 4 h severity 3 / 24 h severity 2), sees the canonical French summary, the original transcript, the protocol path, the triggered rule identifiers, the confidence vector and the citizen's consent status, then records notes, a follow-up and an outcome. Screens: `/tableau-de-bord/sante`, `/cas`, `/cas/[id]`, `/notifications`. Also a **native-speaker reviewer** in `/langues` when they hold `language:review`.

### 3.3.4 Nurse and clinical supervisor
Second escalation tier (`escalated_up`), the only actor allowed to override a deterministic severity — with step-up MFA, a reason code and a mandatory free-text rationale of at least ten characters (`overrideSeverity()`, `requireStepUp()`).

### 3.3.5 Agricultural extension officer
Receives notifiable-disease and zoonotic alerts the moment the agriculture agent detects them, validates or rejects clusters (`unverified → under_review → confirmed | rejected → closed`), compares original evidence with model candidates before deciding, plans field visits and broadcasts advice. Screens: `/tableau-de-bord/agriculture`, `/cas`, `/notifications/envoyer`.

### 3.3.6 Teacher and education officer
Sees class-level learning gaps with small groups suppressed (`classGaps()`, `CLASS_MIN_GROUP`), receives safeguarding cases raised from a learner conversation, verifies learning evidence (`teacherVerified`), broadcasts revision reminders. Screens: `/tableau-de-bord/education`, `/cas`, `/notifications/envoyer`.

### 3.3.7 Programme manager (NGO, donor programme)
Aggregated programme performance, workload and outcome reporting for the territories the organisation covers; report definitions and scheduled deliveries (`/api/v1/report-definitions`); no unapproved row-level national data.

### 3.3.8 Tenant administrator
Users, roles, service points and configuration inside one tenant: `/admin/utilisateurs`, `POST /api/v1/users`, `/api/v1/admin/organisations`, `/api/v1/admin/templates`. Never platform secrets, never another tenant.

### 3.3.9 National analyst
Approved de-identified national data products: `GET /api/v1/analytics/*`, `GET /api/v1/reports/{type}`, `POST /api/v1/report-jobs`. Every export is purpose-coded, expiring and audited (`reports.purpose`, `reports.expiresAt`, `audit_logs`).

### 3.3.10 Safety reviewer
Works the quality signals: `ai.contract.violation` events, override rate, low-confidence sample, red-team regressions, `evaluation_runs`. Authority to downgrade a language to scripted mode and to demand a rollback.

### 3.3.11 Platform operator
Availability, cost, queues and technical metadata: `/admin` (provider chains by internal key, capability consumption, latency, failures, cost per interaction), `GET /api/v1/system/health`, `POST /api/v1/workflow/run`. Domain content is decrypted only through break-glass.

### 3.3.12 Super administrator
Platform configuration under privileged access control: ACU conversion table, cluster thresholds, notifiable list, protocol lifecycle, prompt registry, tenancy. Routine browsing of citizen content is explicitly not part of the role.

## 3.4 Institutional and technical counterparties

| Counterparty | Relationship | Interface | Status |
|--------------|--------------|-----------|--------|
| **Ministry of Health** (and provincial divisions) | clinical authority: approves protocols, emergency scripts, referral directory | `protocol_versions.approvedBy`, `service_directory`, `PATCH /api/v1/admin/protocols/{id}` | Partial — lifecycle implemented, Clinical Review Board constitution is a Phase 0 programme task |
| **Ministry of Agriculture / INERA** | agronomy authority: input registry, notifiable list, planting calendars | `input_registry`, `admin_config["agri.notifiable"]`, `planting_calendars` | Implemented (seed data marked *REFERENCE DATA TO VALIDATE*) |
| **Ministry of Education (EPST)** | curriculum authority: programme national, TENAFEP and Examen d'État objectives | `src/server/ai/education/curriculum.ts` | Implemented (map to validate) |
| **FDSU / funding tenant** | pays the institutional licence and ACU consumption; owns the programme | `tenants` (cap, entitlements), `GET /api/v1/metering/acu`, `monthlyStatement()` | Implemented |
| **NGOs and implementing partners** | operate organisations and queues under a tenant | `organisations` (province/territory scope, routing skills) | Implemented |
| **MNOs and aggregators** (Africa's Talking, Vodacom, Airtel, Orange) | short code, toll-free/reverse billing, USSD, SMS, delivery reports | `src/server/channels/sms.ts`, `/api/hooks/ussd`, `/api/hooks/sms/dlr` | Implemented in code; commercial arrangement is programme risk **R-03** |
| **Twilio (or MNO SIP trunk)** | programmable voice for IVR | `/api/hooks/ivr/twilio/**`, signature validation in `src/server/channels/twilio.ts` | Implemented |
| **Meta / WhatsApp Business Cloud API** | rich channel: voice notes, images, buttons, lists, templates | `/api/hooks/whatsapp`, `src/server/channels/whatsapp.ts` | Implemented; template approval is a Phase 0 dependency (**R-04**) |
| **AI providers** (Claude, Gemini, OpenAI, Google TTS) | capabilities, never identities: reasoning, vision, STT, TTS | `src/server/ai/gateway.ts` only; internal keys `anthropic`/`gemini`/`openai`/`google_tts`/`mock` | Implemented with failover and an offline rules provider |
| **Developers and integrators** | build on the platform | `/api/v1` (OpenAPI publication Planned, Phase 4), event catalogue, webhook contracts | Partial |
| **Linguists on retainer** (2 per language) | verify corpus samples, lexicon, UI strings, TTS quality | `/langues`, `PATCH /api/v1/language/samples/{id}`, `src/shared/i18n/index.ts` | Implemented |
| **Independent evaluator** | pilot go/no-go, red-team, clinical audit | `evaluation_runs`, `tests/**` | Partial |

---

# 4. AI Command Centres per User Type

A **command centre** is the one screen where a given actor sees what is happening, what changed, what is at risk, who owns the response, which SLA is approaching, and what must be done next (PRD 2 §14.1). Every centre below is a built screen; the agent facets listed under each are the roles the built agents play for that actor.

## 4.1 The eight built surfaces

| Surface | Route | File | Who |
|---------|-------|------|-----|
| Home OS screen | `/` | `src/app/page.tsx` | everyone (adapts to role) |
| Voice console (module workspace) | `/sante`, `/agriculture`, `/education` | `src/client/components/voice/ModulePage.tsx`, `VoiceConsole.tsx` | citizens, workers in assisted mode |
| National command dashboard | `/tableau-de-bord` | `src/app/tableau-de-bord/page.tsx` | `dashboard:gov` |
| Module dashboards | `/tableau-de-bord/{sante,agriculture,education}` | `src/client/components/dashboard/ModuleDashboard.tsx` | `dashboard:health` / `:agri` / `:edu` |
| Case workspace | `/cas`, `/cas/[id]`, `/cas/nouveau` | `src/app/cas/**` | `case:read` / `case:write` |
| Language console | `/langues` | `src/app/langues/page.tsx` | `language:review` |
| Reports and analyses | `/rapports` | `src/app/rapports/page.tsx` | `report:export` |
| Admin console + audit journal | `/admin`, `/admin/utilisateurs`, `/admin/audit` | `src/app/admin/**` | `dashboard:admin`, `user:manage`, `audit:read` |

Supporting screens: `/notifications` and `/notifications/envoyer`, `/messages`, `/historique` and `/historique/[id]`, `/recherche`, `/ressources`, `/parametres`, `/connexion`.

## 4.2 Personal AI staff — the agent facets

The brief's "Personal AI Chief of Staff / Analyst / Research / Automation / Growth / Security / Knowledge" agents are **not separate models**. They are the roles the built agents play for a given actor; naming them keeps the brief's intent while the implementation stays a single deterministic orchestrator.

| Facet | Real implementation | What the user experiences |
|-------|--------------------|--------------------------|
| **Chief of Staff** | Workflow agent + scheduler (`src/server/ai/agents/workflow.ts`, `src/server/core/scheduler.ts`) | "here is your queue, ordered by clock; this breaches in 20 minutes; this citizen must be called back today" |
| **Analyst** | Reporting agent (`commandStats`, `moduleDashboard`, `insightOfTheDay`) + report engine | "demand for fever guidance rose 34 % in two provinces this week; here is the recommendation and the basis" |
| **Research** | Knowledge retrieval (`src/server/ai/knowledge/index.ts`) + `/ressources` | "this answer cites KB-HE-FEVER-01 v1.0, authority PCIME/OMS — open the document" |
| **Automation** | Scheduler + notification engine + workflow triggers | reminders fired, deferred messages released, SLA sweep, scheduled reports, audit chain verified — every 5 minutes |
| **Reach and Inclusion** (the brief's "Growth") | Learning agent + language proficiency + coverage analytics | "Tshiluba understanding is at 41 %; 128 samples await review; these two provinces have demand and no worker" |
| **Security** | Audit chain, MFA/step-up, break-glass, redaction, rate limits, signature verification | "the audit chain of 2026-09-05 verifies; one break-glass grant is active and expires in 43 minutes" |
| **Knowledge** | Knowledge base + protocol registry + prompt registry with lifecycle | "protocol child_fever_u5 v1.0.0 is approved; two knowledge documents are due for review" |

## 4.3 Citizen command centre — the home OS screen

**Route** `/` · **Implemented**

| Sees | Can do | Automated for them | Decides |
|------|--------|--------------------|---------|
| One large **Parlez** action; three service tiles (Santé, Agriculture, Éducation); their own recent conversations; live platform activity; language selector in the shell | speak or type a question; attach a photo or a voice note; listen again, repeat, slow down; ask for a human; delete a draft before submitting; review history; manage consents and reminders; request access or erasure | language detection, transcription, translation, protocol run, case creation, reminder scheduling, follow-up capture, offline queueing and replay | which language, which service, whether to consent to each purpose, whether to accept a reminder, whether to ask for a human |

Voice-first interaction contract (PRD 2 §3.2): capture is separated from commitment — a recording is staged, confirmed, then submitted; background speech never creates a case without a positive action. Shared-device privacy (PRD 2 §3.3): quick exit, masked history and "do not save on this device" are **Partial** — the private-mode toggle is Planned (Phase 3); lock-screen-safe notification wording is **Implemented** (`sensitive.generic` template).

## 4.4 Community health worker command centre

**Routes** `/tableau-de-bord/sante`, `/cas`, `/cas/[id]` · **Implemented**

- **Sees**: open cases by severity with the SLA clock and time remaining; unacknowledged urgent cases; maternal and child views; danger-sign categories; referral destinations; follow-up backlog; the week's topics by province.
- **Case workspace shows** (PRD 2 §20.2): citizen-safe identity, risk banner, current state and SLA, the original transcript and audio, the structured intake and the protocol path, triggered rule identifiers, the AI summary **with its sources**, previous contacts, tasks, the referral directory entry, notes, assignment and the *permitted next actions only* (`GET /api/v1/cases/{id}/transitions`).
- **Can do**: acknowledge (stops the clock), take charge, add a note, schedule and capture a follow-up, override severity (MFA + reason), escalate, reassign, merge a duplicate, close with mandatory outcome data.
- **Automated**: routing and assignment, clock start/pause/restart, escalation on breach, notification with channel fallback, follow-up scheduling.
- **Decides**: clinical severity override, closure, and whether a citizen was actually reached.

## 4.5 Extension officer command centre

**Routes** `/tableau-de-bord/agriculture`, `/cas`, `/api/v1/agriculture/clusters` · **Implemented**

- **Sees**: farm observations with their evidence quality; candidate issues with probabilities and the evidence for and against; clusters labelled `unverified | under_review | confirmed | rejected | closed` with privacy suppression below the threshold; market prices with source, unit, grade, observation date and staleness; weather; the planting calendar; workload and open notifiable reports.
- **Can do**: compare the original photo, the model candidates, the farmer's answers and the content version *before* overriding; move a cluster through validation; broadcast advice; plan a field visit task.
- **Automated**: image quality gate before any vision call; chemical guard against `input_registry`; notifiable and zoonotic alerts; cluster detection every run.
- **Decides**: whether a signal is a real outbreak — the platform never declares one.

## 4.6 Teacher command centre

**Route** `/tableau-de-bord/education` · **Implemented**

Sees completed learning loops, objectives attempted, mastery **evidence** (never an ability score), misconception patterns, language and grade coverage, and the safeguarding workload. Class gaps are suppressed below `CLASS_MIN_GROUP`. Can verify evidence, broadcast revision reminders, and receive a safeguarding case. Automated: teach-check-adapt loop, rubric scoring, spaced-repetition scheduling, hint-first homework policy.

## 4.7 Programme manager and national analyst command centre

**Routes** `/tableau-de-bord`, `/rapports` · **Implemented**

National command dashboard KPIs, all live SQL over the operational tables: unique active citizens (day/week/month), interactions by module and language, escalation volume, unacknowledged critical cases, SLA breaches, overdue follow-ups, province table (total, per module, escalated), language share, and the latest interactions with severity. The admin panel adds cost per interaction and ACU burn on the same page — cost transparency is a funder requirement (`DL-08`).

Reports: nine catalogued institutional reports (`REPORT_CATALOGUE`), each carrying its definition, denominator, data-freshness stamp and the small-number suppression rule, rendered as PDF, XLSX or CSV, asynchronous, expiring after seven days, every download audited.

`[DIVERGENCE]` PRD 1 §14 specifies CQRS `rm_*` read models refreshed ≤ 5 min plus BigQuery; PRD 2 §12.1 specifies a separate warehouse fed by CDC. **Implemented choice: direct aggregation over the transactional tables**, which is correct at pilot volume and keeps one source of truth. Read models and the warehouse are **Planned (Phase 4)** and specified in §9.10.

## 4.8 Platform operator and super-admin command centre

**Routes** `/admin`, `/admin/utilisateurs`, `/admin/audit` · **Implemented**

Provider chains by **internal key** with offline-mode flag; capability consumption (calls, failures, latency, cost) over seven days; failed transcriptions; low-confidence rate; escalation volume; server errors and recent error log; feedback score; users by role; language share; the live configuration editor (`admin_config`), the seed action, user creation, and the audit journal with entity filters and CSV export. Full detail in §14.

## 4.9 What each command centre automates, and what it never automates

| Automated without a human | Never automated |
|---------------------------|-----------------|
| Language detection, transcription, translation, simplification, speech synthesis | Clinical severity override |
| Protocol execution and severity determination | Closing a safeguarding record |
| Case creation, routing, assignment, SLA clocks, escalation on breach | Publishing approved knowledge or a protocol version |
| Reminder scheduling and delivery with channel fallback | Declaring an outbreak |
| Cluster candidate detection | Confirming a cluster |
| Report generation and expiry | Changing a national risk rule |
| Audit chain verification, ACU cap alerts, overdue data-request alerts | Re-identifying a pseudonymised record |

---

# 5. Core AI Agents

## 5.1 Orchestration principle

`[DIVERGENCE]` PRD 1 §7 specifies a LangGraph agent runtime in Python 3.12 with a PostgreSQL checkpointer; PRD 2 §9.1 specifies that "the orchestrator is a deterministic workflow service, not an autonomous LLM", owning state, tool permissions, policy checks, retries, timeouts, model routing, event emission and final response assembly.

**Implemented choice: PRD 2's position, in TypeScript.** `runInteraction()` (`src/server/ai/agents/orchestrator.ts`) is a linear, deterministic pipeline; each stage writes its result to the `interactions` row before the next one starts (write-ahead autosave), so a dropped call or a crashed provider still leaves a complete trace. Resumability is delivered by session state (`sessions.state`) and idempotency keys rather than by graph checkpoints. LangGraph remains available as a Phase 3 option if a genuinely branching planner is ever needed; nothing in the contract would change, because agents already communicate through typed schemas.

```
capture ──► autosave (files, interactions)                       ← original input, channel, actor, geo
   └─► emergency short-circuit (keyword rules, five languages)    ← scripted emergency text, CHW alert
        └─► speech-to-text (gateway: openai → gemini → mock)
             └─► language agent (LID, code-switch, French pivot, intent, module)
                  │        + verified corpus examples + local lexicon (in-context learning)
                  └─► personalisation (language, province, recent needs; never health inferences)
                       └─► domain agent   health: protocol engine (deterministic severity 0–4) + citations
                                          agriculture: farm context, top-3 candidates, tiered actions,
                                                       chemical guard, notifiable list, zoonotic check
                                          education: learner band, teach-check-adapt, quiz, hint-first homework
                            └─► risk agent (rules only: raise never lower; low-confidence policy; uncited → fallback)
                                 └─► compose the seven-part answer (French canonical) ──► localise
                                      └─► persist domain record, corpus sample, event, audit
                                           └─► workflow agent (case, queue, SLA, escalation, notification)
                                                └─► text-to-speech (google_tts → openai → on-device)
```

## 5.2 Agent register

| # | Agent | Kind | File | Status |
|---|-------|------|------|--------|
| 1 | Language | domain | `src/server/ai/agents/language.ts` | Implemented |
| 2 | Health | domain | `src/server/ai/agents/health.ts` + `src/server/ai/protocols/**` | Implemented |
| 3 | Agriculture | domain | `src/server/ai/agents/agriculture.ts` + `src/server/ai/tools/**` | Implemented |
| 4 | Education | domain | `src/server/ai/agents/education.ts` + `src/server/ai/education/**` | Implemented |
| 5 | Risk / Policy | deterministic | `src/server/ai/agents/risk.ts` | Implemented |
| 6 | Workflow | deterministic | `src/server/ai/agents/workflow.ts` | Implemented |
| 7 | Reporting | analytical | `src/server/ai/agents/reporting.ts`, `src/server/reports/**` | Implemented |
| 8 | Personalisation | domain | `src/server/ai/agents/personalisation.ts` | Implemented |
| 9 | Learning (language) | domain | `src/server/ai/agents/learning.ts` | Implemented |
| 10 | Onboarding | conversational | `src/server/channels/session.ts`, `/api/v1/consents` | Partial |
| 11 | Compliance and Consent | deterministic | `src/server/core/privacy.ts`, `consents`, `data_requests` | Implemented |
| 12 | Fraud / Anomaly | deterministic | rate limits, idempotency, signature verification, dedupe | Partial |
| 13 | Payment / Disbursement | integration | — | Planned (Phase 4/5), §7 |
| 14 | API Integration | integration | `src/server/ai/tools/**`, `src/server/channels/**` | Partial |
| 15 | Predictive Intelligence | analytical | `src/server/ai/agents/clusters.ts`, `importantAlerts()` | Partial |
| 16 | Admin Control | deterministic | `admin_config`, `/api/v1/admin/**` | Implemented |
| 17 | System Health | operational | `/api/v1/system/health`, `adminStats()`, `runScheduler()` | Partial |
| 18 | Bug Detection | operational runbook | `api_request_logs`, `ai_usage_logs`, `event_store` | Partial |
| 19 | Auto-Repair | operational runbook | gateway failover, degraded modes, retries, dead-letter replay | Partial |
| 20 | Infrastructure Optimisation | operational runbook | ACU metering, model routing, caps | Partial |
| 21 | Release Management | operational runbook | lifecycle statuses, `evaluation_runs`, canary | Partial |
| 22 | AI Governance | governance | protocol/prompt registries, contract violations, overrides | Implemented |

"Operational runbook" means the agent is defined as a **procedure over instrumented signals**, executed by the scheduler plus an on-call human, not as an autonomous model with write access to production. This is deliberate: an autonomous repair agent is exactly the kind of unbounded authority PRD 2 §1.3 forbids.

---

## 5.3 Agent 1 — Language Agent

| Field | Detail |
|-------|--------|
| **Purpose** | Turn any spoken or written utterance, in any of the five languages or a mixture of them, into a French canonical form with a service classification, and render every answer back into the citizen's language. |
| **Inputs** | raw audio or text, preferred language, module hint, verified corpus examples and lexicon entries for the detected language |
| **Outputs** | `LanguageAnalysis { language, confidence, mixedLanguages[], translationFr, module, intent }`; `Localisation { text }` |
| **Permissions** | none of its own; runs inside the orchestrator on behalf of the session |
| **Triggers** | every turn, on every channel |
| **Workflow** | retrieve learning context → LID + translation + module + intent in one structured call → orchestrator persists `language`, `languageConfidence`, `translationFr`, `intent`, `module` → after the answer is composed, `localise()` renders action, understanding and each follow-up question |
| **Escalation** | low language confidence lowers the overall confidence, which the risk agent turns into a human path for health turns |
| **Tools / APIs** | `aiGateway().generateJson`, `aiGateway().transcribe`, `aiGateway().synthesize`, `retrieveLearningContext()` |
| **Hard rules** | the original transcript is never dropped; French canonical is always stored for audit and for workers; safety-critical scripts are **never** model-translated — `EMERGENCY_MESSAGES`, `EMERGENCY_INSTRUCTIONS`, `SAFEGUARDING_RESPONSES`, `DISCLAIMERS`, `FACILITY_UNKNOWN_NOTE` and the channel strings are fixed, reviewed text in all five languages |
| **Value** | a citizen who has never used a digital service is understood in the language they actually speak, and the institution reads one canonical French record |

## 5.4 Agent 2 — Health Agent

| Field | Detail |
|-------|--------|
| **Purpose** | Symptom intake, deterministic triage, public-health education, referral navigation and escalation. Never a doctor. |
| **Inputs** | French pivot text, prior session answers, province/territory/health zone, transcription and language confidence, forced protocol id (worker override) |
| **Outputs** | `HealthTriageResult` including the machine-readable `HealthTriageContract`: `protocolId`, `protocolVersion`, `severityLevel 0–4`, `riskBand`, `triggeredRuleIds[]`, `recommendedTimeToAction`, `careDestinationType`, `clarifications[≤2]`, `selfCareContentIds[]`, `citations[≥1]`, `prohibitedClaimCheck`, `humanReviewRequired`, `followUpDueAt`, `confidenceDimensions`, `explanationSummary`, `safeguarding` |
| **Permissions** | writes `health_triage_records`, `safeguarding_records`; emits `ai.contract.violation` |
| **Triggers** | `module = health` after language analysis, or a module hint from a channel menu |
| **Workflow** | 1. safeguarding screen (keywords in five languages + model flag) → 2. entity extraction + protocol selection → 3. answers: **the model proposes, the deterministic pass disposes** → 4. `runProtocol()` decides severity → 5. knowledge retrieval boosted towards the protocol's own documents → 6. explanation of an outcome that is already frozen → 7. citation enforcement → 8. prohibited-claim sanitisation → 9. emergency script + nearest facility → 10. restricted safeguarding handling → 11. confidence vector and human-review decision |
| **Escalation** | severity 4 → emergency script, CHW alert, case `open_emergency`, 15-minute clock; severity 3 → clinic today, 4 h; severity 2 → clinic within 24 h; low confidence on a health turn → human; safeguarding → restricted pathway, severity floor 3, immediate danger → 4 |
| **Tools** | `runProtocol()`, `searchKnowledge("health", …)`, `approvedDocIds()`, `nearestFacility()` over `service_directory`, `vaccinationStatus()` over the EPI calendar |
| **Hard rules** | the LLM cannot alter severity; no dosage outside approved protocol text; no diagnosis claim; every recommendation cites a protocol id **and** at least one approved document, or the answer is replaced by `UNCITED_FALLBACK_FR`; summaries capped at 60 words |
| **Value** | a child with a danger sign reaches a human within minutes, and the same conversation becomes a defensible clinical record |

**Protocol set (`src/server/ai/protocols/definitions/`)** — ten approved decision trees, each with per-language question phrasing, red flags, severity rules, five outcomes and citations: `child_fever_u5`, `adult_fever`, `cough_breathing`, `diarrhoea_dehydration`, `pregnancy_danger_signs`, `newborn_danger_signs`, `injury_bleeding`, `malnutrition_screening`, `vaccination_schedule`, `general_symptom_intake`. Coverage is enforced by `tests/health-protocols.test.ts`: every question reachable, every branch taken, every red flag reaching severity 4, every severity rule firing, globally unique rule identifiers.

## 5.5 Agent 3 — Agriculture Agent

| Field | Detail |
|-------|--------|
| **Purpose** | Turn a description and a photograph into ranked hypotheses and a safe, feasible, low-cost farm action — and route to a human when the evidence or the risk demands it. |
| **Inputs** | French pivot text, up to five photos and short videos, province, territory, date, history |
| **Outputs** | `AgricultureAssessmentPlus`: farm context (crop/animal, variety, growth stage, symptoms, affected proportion, recent inputs, observed since, location hint), season, ranked `candidates[≤3]` with probability and evidence **for and against**, `missingEvidence`, tiered actions (`noCost`, `lowCost`, `purchase`), `actionsToAvoid`, notifiable matches, zoonotic flag, extension referral with reasons, chemical guard result, evidence quality, citations, prices, weather, calendar |
| **Permissions** | writes `agriculture_reports`; notifies `agri_officer`; emits `agri.notifiable.detected` / `agri.zoonotic.flagged` |
| **Triggers** | `module = agriculture` |
| **Workflow** | evidence gate before any vision call → approved knowledge retrieval → one structured multimodal call → candidate sorting and "possible match" wording below 0.60 → deterministic urgency (spread, wide area, zoonosis, notifiable) → chemical guard on all three action tiers → referral thresholds → data tools (prices, weather, calendar) → citation enforcement → composed recommendation → alerts |
| **Escalation** | notifiable pest/disease, zoonotic sign, more than half the plot or herd affected, rapid spread or mortality, top-1 probability < 0.40, or a blocked chemical mention → extension officer referral and alert |
| **Tools** | `reviewEvidence()` (image quality), `guardChemicalAdvice()` (input registry), `getPrices()`, `getWeather()` (Open-Meteo), `calendarAdvice()`, `searchKnowledge("agriculture", …)`, `detectClusters()` |
| **Hard rules** | AGR-002 observation ≠ diagnosis: candidates stay "correspondance possible" until the threshold is met; AGR-003 **no product name, dose or authorisation is ever invented** — an unmatched chemical mention is deleted and replaced by a referral; AGR-005 a price always carries market, unit, grade, source, observation date and staleness, and is never a live offer |
| **Value** | a farmer gets an action they can take today at no cost, and the extension service learns where the real problems are |

## 5.6 Agent 4 — Education Agent (StudYear Rural)

| Field | Detail |
|-------|--------|
| **Purpose** | Explain, check, adapt. Oral teaching at the learner's confirmed level, in their language, with the school programme as the anchor. |
| **Inputs** | French pivot text, learner profile (age band, level, instruction and explanation languages, exam target and date), mode, province, history |
| **Outputs** | `EducationAssessmentPlus`: objective and curriculum code, teach-check-adapt `steps`, micro-explanation trimmed to 90 s of speech, a Congolese local example, guided and independent attempts, misconceptions with feedback, homework policy, recap, next step, parent summary, revision plan, teacher class view, story, evidence flag, citations |
| **Permissions** | writes `education_sessions`, `learning_evidence`, `schedules` (revision nudges); reads `learner_profiles` |
| **Triggers** | `module = education`; mode detected deterministically (`explain | quiz | read | homework | exam_prep | parent | teacher`) |
| **Workflow** | child-safety screen **before** teaching → curriculum anchor + approved knowledge → one teaching call → commercial and age filters → homework policy → mode-specific work (story, parent summary, revision plan with spaced repetition, class gaps) → evidence recorded only on a real attempt or a repeat request |
| **Escalation** | a safeguarding disclosure abandons the lesson and returns the scripted supportive reply; an adult topic is redirected to a trusted adult; both create a restricted record |
| **Tools** | `findObjective()` (DRC curriculum map), `generateQuiz()` / `scoreAnswer()` (rubric-based, deterministic scoring), `scheduleRevision()` (SM-2 variant), `classGaps()`, `STORIES` read-aloud library, `searchKnowledge("education", …)` |
| **Hard rules** | EDU-001 the age band and level are **confirmed, never inferred from the voice**; EDU-002 no permanent aptitude label and no learning-disability diagnosis; EDU-004 no final answer to graded work before an attempt; FR-ED-06 a parent summary never repeats the child's own words (`stripVerbatim()`); EDU-005 no commercial persuasion, ever |
| **Value** | a household with no reading adult can still support a child's schooling, and a teacher sees where a class actually struggles |

## 5.7 Agent 5 — Risk / Policy Agent

| Field | Detail |
|-------|--------|
| **Purpose** | Decide, from rules alone, what the risk is, whether a human must see this, and whether the answer may be delivered as written. |
| **Inputs** | the domain result, the deterministic protocol severity, language and domain confidence, safety violations, citations, safeguarding flag, upstream human-review demand |
| **Outputs** | `RiskResult { score, level, flags[], escalationRequired, escalationReason, lowConfidence, confidence, severityLevel, riskBand, citationsOk, blocked, blockReason, humanReviewRequired }` |
| **Permissions** | none — it changes no business state; the orchestrator and the workflow agent act on its verdict (PRD 2 §9.2 prohibition respected) |
| **Triggers** | every turn, after the domain agent |
| **Workflow** | module-specific base score → pregnancy and infant floors → confidence floor → protocol severity as the floor, **raise only** → citation enforcement → safeguarding floor → escalation decision and reason |
| **Escalation rules** | `critical` or `high`; or blocked (uncited or prohibited content); or safeguarding; or a health turn with low confidence and score ≥ 0.35 |
| **Value** | escalation behaviour is auditable, testable and identical every time — the property a clinical liability review actually asks for |

## 5.8 Agent 6 — Workflow Agent (case state machine)

| Field | Detail |
|-------|--------|
| **Purpose** | Own accountability: exactly one queue, one owner, one clock per case. |
| **Inputs** | risk verdict, module, geography, organisation, actor, transition request |
| **Outputs** | cases, case events, tasks, follow-ups, assignments, SLA clocks, notifications, domain events |
| **Permissions** | `case:read`, `case:write`, `case:assign`, `case:escalate` — checked at the route, and again per transition against `TransitionSpec.actorRoles` |
| **Triggers** | auto-creation (`shouldAutoCreateCase`: severity ≥ 2, confidence < 0.40, notifiable disease, explicit request for a human, safeguarding); worker action; scheduler sweep |
| **State machine** | `open`/`open_emergency` → `assigned` → `acknowledged` → `in_progress` → `needs_follow_up` → `resolved` → `closed`, with `reassigned`, `escalated`, `escalated_up`, `cancelled`, `duplicate`. Anything not in `TRANSITIONS` is refused with the list of permitted next states. |
| **SLA** | severity 4 → 15 min · 3 → 4 h · 2 → 24 h · 1 → 72 h · 0 → no clock. Effects per transition: `start | keep | pause | resume | restart | stop`; every pause carries a reason and is audited (`CAS-004`). |
| **Routing** | territory → organisation → province → role, on-duty first, then least loaded, deterministic tie-break by id |
| **Atomicity** | assignment and every transition are a compare-and-swap on `cases.version`; the loser receives 409 (`CAS-002`) |
| **Quality gates** | reason ≥ 10 characters for cancellation, reassignment and override; closure requires outcome, action taken, citizen reachability and follow-up decision (`CAS-006`); merges preserve identifiers and move open tasks, follow-ups and schedules (`FR-CS-07`) |
| **Escalation ladder** | unacknowledged past the clock → `slaBreached` (a sticky historical fact) → escalate one level → new clock → supervisor notification + assignee reminder |
| **Value** | an escalation is not a message into the void; it is a clock with a named owner and an auditable outcome |

## 5.9 Agent 7 — Reporting Agent

| Field | Detail |
|-------|--------|
| **Purpose** | Turn the operational log into decisions: what is happening, what changed, what is at risk, and what to do about it. |
| **Inputs** | interactions, cases, triage records, agriculture reports, education sessions, AI usage, ACU ledger, feedback, API logs |
| **Outputs** | `commandStats()` (trends with previous period and delta), `recentActivity()`, `importantAlerts()`, `insightOfTheDay()` (headline + recommendation + next action + **basis**), `moduleDashboard()`, `adminStats()`, `exportCsv()`, and the nine catalogued reports |
| **Permissions** | `dashboard:gov` / `:health` / `:agri` / `:edu` / `:admin`, `report:export`; every export audited with a purpose code |
| **Triggers** | dashboard load; `POST /api/v1/report-jobs`; scheduled definitions fired by `runScheduler()` |
| **Hard rules** | anonymised projections only; small numbers suppressed before publication (`suppress()`, threshold 5); every figure carries its definition, denominator, freshness and the suppression note; a predictive output carries purpose, window, population, performance, uncertainty and a human owner |
| **Value** | an institution can act on Tuesday on something that started on Monday, and can defend the number in front of a donor |

## 5.10 Agent 8 — Personalisation Agent

Purpose: make answers more relevant over time without ever profiling anyone. Stores **only** language preference, province, top intents and the last three interaction summaries (`getProfileContext()`), and remembers a language only above 0.75 confidence. **Explicitly stores no health inference** (brief §7, PRD 1 §7.5) — this is why the platform is safe on shared phones (`R-08`). Escalation: none. Value: the second call is shorter than the first.

## 5.11 Agent 9 — Learning Agent (languages)

| Field | Detail |
|-------|--------|
| **Purpose** | Make the platform better at listening, understanding and speaking Lingala, Kikongo, Swahili, Tshiluba and Congolese French — from real conversations and native-speaker corrections. |
| **Inputs** | every transcript with its French meaning, audio reference, province, intent, module and system confidence; citizen "you did not understand me" flags and 1–5 speech ratings; reviewer corrections |
| **Outputs** | `language_corpus` samples, `language_lexicon` entries with pronunciation hints, per-language proficiency (listening, understanding, speaking, level), JSONL fine-tuning datasets |
| **Permissions** | `language:review` to verify or correct, `language:export` to download a dataset (audited) |
| **Triggers** | every interaction (capture); citizen feedback; reviewer action; export request |
| **Workflow** | capture → citizen signal → native-speaker verification, correction or rejection with lexicon enrichment → verified samples and lexicon retrieved on **every** subsequent turn and injected into the prompt (in-context learning, improvement without retraining) → export for speech-model fine-tuning |
| **Hard rules** | corrections are versioned and separated from the immutable original; production feedback enters a **curated** dataset and never automatically fine-tunes a model (PRD 2 §8.4); training use requires the `research` consent purpose |
| **Value** | the languages that no commercial vendor will improve for the DRC improve here, and the corpus is a national asset |

## 5.12 Agent 10 — Onboarding Agent — **Partial**

Purpose: bring a citizen from "a phone rang" to "consented, language chosen, service chosen" in under 30 seconds. Implemented today: rotating five-language greeting with DTMF fallback (`nextGreetingLanguage`, `languageMenu`), one open question then intent routing, identifier resolution across channels, shared-phone confirmation, consent snapshot on the session, opt-in/opt-out keywords in five languages, 24-hour resume with a "where we left off" line. Planned (Phase 3): a spoken consent script per purpose with recorded evidence (`CON-002` voice method exists in the data model; the recording capture is not built), and the guided first-run tutorial.

## 5.13 Agent 11 — Compliance and Consent Agent — **Implemented**

Purpose: make lawfulness a runtime property, not a policy document. Purpose-specific consents (`service`, `reminders`, `precise_location`, `analytics`, `research`, `partner_sharing`, `pregnancy_data`, `child_profile`, `cross_programme_referral`) with version, method, language and proxy context; consent re-checked **at send time**, not at scheduling time (`fireDueSchedules()`), so a revocation yesterday stops a reminder today; withdrawal preserves lawfully retained records; access packages and erasure tombstones with a 30-day clock and legal-hold blocking; overdue requests alert the platform administrators every scheduler run. Escalation: any overdue request or broken audit chain raises an acknowledged alert.

## 5.14 Agent 12 — Fraud and Anomaly Agent — **Partial**

| Signal | Implemented control |
|--------|--------------------|
| Request flooding | sliding-window rate limiter per user or IP, `default` 120/min and `ai` 30/min (`src/server/core/rate-limit.ts`) |
| Replay and duplicate submission | `Idempotency-Key` with stored responses, request-hash conflict detection (`src/server/core/idempotency.ts`); WhatsApp message ids processed once |
| Forged webhooks | `X-Hub-Signature-256` HMAC (Meta), `X-Twilio-Signature` (Twilio), cron secret |
| Notification abuse | dedupe window, weekly frequency cap, quiet hours, opt-out enforcement |
| Data exfiltration through exports | purpose code, expiry, audit row, step-up for identifiable exports |
| Anomalous escalation or override patterns | override rate and low-confidence rate on the admin console |
| Account takeover on privileged roles | TOTP MFA with step-up window; role changes revoke sessions (`IAM-005`) — **Planned (Phase 3)** |
| Behavioural anomaly scoring (per device, per queue) | **Planned (Phase 4)** — see §9.9 |

## 5.15 Agent 13 — Payment / Disbursement Agent — **Planned (Phase 4/5), optional**

Not built and deliberately out of the citizen path. Specified in §7: institutional settlement of the licence and ACU statement, and an optional programme-disbursement door (CHW stipends, farmer input vouchers, cash transfers) with sandbox and live keys, webhooks, settlement, refunds, disputes and monitoring. No citizen wallet; no citizen ever pays.

## 5.16 Agent 14 — API Integration Agent — **Partial**

Purpose: keep every external dependency behind a typed, replaceable adapter so no vendor can hold the programme hostage. Implemented adapters: AI providers (four + offline), Twilio voice, Meta WhatsApp Graph, Africa's Talking SMS/USSD, Open-Meteo weather, GCS or local storage, PostgreSQL or PGlite. Each is fronted by a module that degrades to a log or rules mode with no credential, which is what makes `npm test` run entirely offline. Planned (Phase 4): DHIS2 export, identity federation (OIDC), a published OpenAPI 3.1 contract and partner API keys.

## 5.17 Agent 15 — Predictive Intelligence Agent (the brief's "Predictive Growth") — **Partial**

| Capability | Status | Implementation |
|------------|--------|----------------|
| Agricultural cluster / pest early warning | **Implemented** | `detectClusters()`: ≥ N reports (default 5) of the same issue and crop, same territory (else province), within a rolling window (default 14 days) → `agri_clusters` row `unverified` + `agri.cluster.detected` + officer alert; privacy suppression below `privacyMin`; validation transitions; nothing is ever published as a confirmed outbreak |
| Health trend rise detection | **Implemented** | `importantAlerts()`: this week vs last week per province and topic, ≥ 3 and > 1.3× → alert; `insightOfTheDay()` with headline, recommendation, next action and **basis** |
| Learning-gap detection | **Implemented** | `classGaps()` and `moduleDashboard("education")` with small-group suppression |
| Outbreak *forecasting* (model-based) | **Planned (Phase 4)** | requires denominators, a training window, a documented population and a named human owner (PRD 2 §14.4) |
| Learning-gap forecasting | **Planned (Phase 4)** | same governance requirements |
| Service-gap heatmap (demand vs worker capacity) | **Partial** | province demand table and queue depth exist; the joined heatmap is Planned (Phase 4) |

Hard rule for every predictive output: purpose, training window, population, performance, uncertainty and human owner published with the number; dashboards must never encourage punitive action against a village, family, learner or farmer.

## 5.18 Agent 16 — Admin Control Agent — **Implemented**

Everything an operator can change is a stored, audited configuration entity, not a code deployment: ACU conversion table (`acu.conversion`), cluster thresholds (`agri.cluster`), notifiable list (`agri.notifiable`), notification templates (versioned, lifecycle status, per language and channel), protocol lifecycle (`draft → review → approved → canary → active → retired`), tenants with entitlements and monthly caps, organisations with province and territory scope and routing skills. Every write goes through `audit()` with before and after values.

## 5.19 Agent 17 — System Health Agent — **Partial**

Implemented: liveness/readiness probe (`GET /api/v1/system/health`); provider chain status by internal key with an offline-mode flag (`aiGateway().status()`); per-capability call volume, failure count, mean latency and cost over seven days; API error count and mean duration over 24 hours; failed transcription and low-confidence counts; queue depth with the oldest waiting item and the next due clock; scheduler run report with a per-step error list. Planned (Phase 3/4): OpenTelemetry traces across adapter → session → agent → gateway with the trace id surfaced in the admin UI (`NFR-O-01`, `NFR-009` — `interactions.traceId` and `event_store.traceId` columns exist and are unpopulated), SLO dashboards and paging.

## 5.20 Agent 18 — Bug Detection Agent — **Partial (operational runbook)**

Signals: `api_request_logs` (status ≥ 500, duration), `ai_usage_logs.success = false`, `interactions.status = failed` with `failureReason`, `ai.contract.violation` events, `sync_events.status = conflict`, notification `failureReason`, scheduler step errors, audit-chain break. Runbook: the scheduler surfaces the counts each run; the admin console lists the ten most recent server errors; a broken audit chain raises an emergency, acknowledgement-required alert to every platform administrator. Planned (Phase 4): automatic error clustering and a defect-rate SLO.

## 5.21 Agent 19 — Auto-Repair Agent — **Partial (operational runbook)**

What repairs itself today, by design rather than by inference:

| Failure | Automatic behaviour |
|---------|--------------------|
| One LLM/vision provider fails or returns invalid JSON | next provider in the chain, same request (`generateJson` loop) |
| All providers unavailable | offline rules provider: protocol trees still run, explanations from approved protocol text, low-confidence flag |
| STT unavailable or a language below its gate | text or DTMF/USSD-guided mode with fixed prompts |
| TTS unavailable | on-device speech synthesis in the browser or handset (`synthesize()` returns `null`) |
| Notification channel outage | WhatsApp → SMS → voice, two attempts per channel with backoff, every attempt recorded |
| ACU cap reached | non-emergency AI degrades to scripted mode; safeguards never switch off |
| Client offline | IndexedDB outbox + service-worker background sync, replay protected by idempotency keys |
| Persistence failure while answering | the reply is still delivered; the failure is recorded and retried (`FR-AS-01`) |
| Duplicate case | merge preserves identifiers and moves open work |
| Expired report file | scheduler deletes the object and marks the job expired |

Planned (Phase 4): dead-letter queue with permissioned replay preserving original causation (PRD 2 §17).

## 5.22 Agent 20 — Infrastructure Optimisation Agent — **Partial (operational runbook)**

Levers that exist: per-capability routing order (`AI_LLM_ORDER`, `AI_VISION_ORDER`, `AI_STT_ORDER`, `AI_TTS_ORDER`); model weight in the ACU conversion table so a frontier model costs more ACU for the same tokens; the evidence gate that refuses to spend a vision call on an unusable photo; the scripted degrade at the cap; per-tenant caps with 80/95/100 % alerts; cost per interaction on the admin console and in the metering endpoint. Cost-degradation policy (PRD 2 §17): reduce optional summarisation and analytics work first — **never** disable a deterministic health safeguard. Planned (Phase 3/4): response caching for repeated USSD menu answers, small-model routing for intent extraction, self-hosted STT for the low-resource languages.

## 5.23 Agent 21 — Release Management Agent — **Partial (operational runbook)**

Implemented: lifecycle status on protocols, prompts, knowledge documents and notification templates (`draft → review → approved → canary → active → retired`); a protocol in `draft` or `retired` is refused at load time (`loadApprovedProtocol()`); `evaluation_runs` records suite, module, language, model and prompt version, metrics and pass/fail; the whole test suite is a release gate that runs offline. Planned (Phase 3/4): canary at 5 % → 25 % → 100 % with automatic rollback on a guardrail regression (`AI-17`, `DO-04`), signed artefacts and GitOps promotion.

## 5.24 Agent 22 — AI Governance Agent — **Implemented**

Purpose: make model behaviour a governed, reviewable, reversible artefact.

- **Registries**: `protocol_versions` (immutable definition JSON, approver, approval timestamp), `prompt_versions`, `model_configs` (task, language, primary and fallback provider, ACU rate, live flag), `kb_documents` (authority, geography, validity dates, evidence grade, approver, checksum, supersession).
- **Contract enforcement**: a `DomainResult` that fails schema validation is rejected and the turn falls back to a safe scripted response with a low-confidence flag; the failure is an `ai.contract.violation` event (`AI-01`).
- **Grounding**: uncited health or agriculture recommendations are blocked and replaced (`AI-13`).
- **Uncertainty**: the confidence vector is stored per interaction (`interactions.confidenceDimensions`) rather than a single deceptive score (PRD 2 §9.5).
- **Human override telemetry**: `ai_overrides` + `ai.override.recorded` feed the override rate on the admin console and the monthly AI performance report.
- **Boards**: clinical safety, child safeguarding and education, agriculture content, language inclusion, data ethics and privacy, model risk — constitution is a Phase 0 programme task; the data model already records their decisions.

---

# 6. Full Platform Modules

Twelve modules. Each one states its scope, its data, its routes, its rules and its status. Code lives under `src/server/**` (aliased `@server/*`); the frontend is `src/client/**` (`@client/*`); contracts shared by both are `src/shared/**` (`@shared/*`).

## 6.1 Health module — *AI Rural Health OS*

**Scope (brief §1):** symptoms, malaria signs, fever, pregnancy, child illness, diarrhoea, vaccination reminders, nutrition, maternal health, emergency warning signs, medication guidance, clinic referral. Structured follow-up questions, emergency detection, severity classification, safe non-diagnostic guidance, clinic recommendation, high-risk escalation, interaction summaries, anonymised trends, support for CHWs, nurses, NGOs and public health teams. **Never pretends to replace a doctor.**

| Element | Detail |
|---------|--------|
| Agent | `src/server/ai/agents/health.ts` |
| Protocol engine | `src/server/ai/protocols/{types,engine,extraction,registry,lifecycle,aggregation}.ts` + ten definitions |
| Knowledge | 15 approved documents in `content/kb/health/` (triage, fever, respiratory, diarrhoea, pregnancy, newborn, injury, nutrition, vaccination, medicines, prevention, WASH, mental health, epidemic, emergency) |
| Data | `health_triage_records`, `risk_assessments`, `safeguarding_records`, `cases`, `follow_ups`, `schedules` |
| Routes | `GET /api/v1/health/protocols`, `/health/vaccination-schedule`, `/health/facilities`, `GET/PATCH /api/v1/admin/protocols[/{id}]`, `GET /api/v1/analytics/module/health` |
| Screens | `/sante` (voice console), `/tableau-de-bord/sante`, `/cas`, `/cas/[id]` |
| Severity scale | 0 self-care · 1 monitor at home · 2 clinic within 24 h · 3 clinic today · 4 emergency now |
| Risk bands | `emergency`, `urgent`, `routine`, `self_care`, `insufficient_information` |
| Care destinations | `self_care_home`, `community_health_worker`, `health_centre`, `hospital`, `emergency_referral` |
| Follow-up clocks | severity 4 → 2 h · 3 → 6 h · 2 → 24 h · 1 → 72 h · 0 → 168 h |
| Special flows | vaccination (EPI schedule lookup and reminders), maternal health (ANC contacts, pregnancy consent purpose), safeguarding (restricted pathway), medication (approved text only, otherwise "ask a nurse or pharmacist") |
| Status | **Implemented**; MUAC-based malnutrition measurement input and facility geolocation are **Partial** (screening protocol exists, no measurement device integration) |

Acceptance criteria carried from PRD 1 §8.1.3 and PRD 2 §5.8 and covered by `tests/health-triage.test.ts` and `tests/health-protocols.test.ts`: a configured red-flag utterance creates an urgent event and notification **even with the LLM provider unavailable**; a prohibited diagnosis claim is blocked and replaced; an override requires step-up authentication, a reason code and a rationale; an unacknowledged urgent case escalates and shows as an SLA breach; exported health data excludes direct identifiers unless the requester has explicit scope and an audited purpose.

## 6.2 Agriculture module — *AI Agriculture OS*

**Scope (brief §2):** crop disease, pests, soil, seeds, fertiliser, livestock, planting calendars, harvest timing, weather, storage, market prices, buyer opportunities; voice notes, photos (crops, leaves, soil, livestock) and short videos; likely-issue identification, missing-context questions, next farm action, urgent disease flags, low-cost interventions, recurring issues by region, risk patterns, market and productivity intelligence.

| Element | Detail |
|---------|--------|
| Agent | `src/server/ai/agents/agriculture.ts`; clusters in `clusters.ts` |
| Tools | `src/server/ai/tools/image-quality.ts` (header-level JPEG/PNG/WebP/GIF checks, information-density heuristic, truncation, video-as-evidence-only), `input-registry.ts` (chemical guard), `market.ts` (prices with staleness and CSV upload parser), `weather.ts` (Open-Meteo with 26 province centroids and a seasonal offline fallback) |
| Reference data | `src/server/db/reference/agriculture.ts`: agro-ecological zones, planting calendars by province × crop, input registry seed, market price series, notifiable list |
| Knowledge | 13 approved documents in `content/kb/agriculture/` |
| Data | `agriculture_reports`, `agri_clusters`, `planting_calendars`, `market_prices`, `input_registry` |
| Routes | `GET /api/v1/agriculture/{prices,calendar,weather,registry}`, `POST /agriculture/prices/upload`, `GET/POST/PATCH /agriculture/clusters` |
| Screens | `/agriculture`, `/tableau-de-bord/agriculture` |
| Status | **Implemented**. Buyer opportunities (FR-AG-10) are **Planned (Phase 4)**: an admin-maintained cooperative and buyer directory, informational only. Video frame extraction is **Planned (Phase 3)** — video is stored as evidence and never sent to vision today. |

## 6.3 Education module — *AI Education Voice OS (StudYear Rural)*

**Scope (brief §3):** homework explanation, reading, maths, exam preparation, lesson summaries, study planning, revision questions, career guidance, parent guidance, teacher support; simple explanations, French ↔ national language translation, age-adapted level, quizzes, step-by-step guidance, learning-difficulty tracking, study actions, low-literacy households.

| Element | Detail |
|---------|--------|
| Agent | `src/server/ai/agents/education.ts` |
| Sub-modules | `src/server/ai/education/{curriculum,profile,quiz,evidence,spaced-repetition,child-safety}.ts` |
| Knowledge | 9 approved documents in `content/kb/education/` |
| Reference | `src/server/db/reference/stories.ts` — original, programme-licensed read-aloud stories, at least two per language, 150–250 words each |
| Data | `education_sessions`, `learner_profiles`, `learning_evidence`, `stories`, `schedules` (revision) |
| Routes | `GET/PUT /api/v1/education/profile`, `POST /education/quiz`, `POST /education/quiz/{id}/answer`, `GET /education/stories`, `POST /education/lessons`, `GET /education/evidence`, `POST /education/plan` |
| Screens | `/education`, `/tableau-de-bord/education` |
| Modes | `explain`, `quiz`, `read`, `homework`, `exam_prep`, `parent`, `teacher` — detected deterministically from the utterance |
| Session stages | objective → prior-knowledge check → micro-explanation → example → guided attempt → feedback → independent attempt → mastery signal → recap → next |
| Status | **Implemented**. Textbook-page OCR read-aloud (FR-ED-03 Phase 3) is **Planned**. `[DECISION REQUIRED]` D-06/FR-ED-10: the StudYear component-reuse boundary — quiz generation, spaced repetition and the curriculum graph are implemented natively here rather than imported from a shared package. |

## 6.4 Channels module

| Channel | Adapter | Capabilities | Status |
|---------|---------|--------------|--------|
| Voice call (IVR) | `/api/hooks/ivr/twilio` + `/gather`, `/recording`, `/continue`, `/media/[id]` | audio in/out, DTMF, no long text, spoken reply, 400-char chunks | **Implemented** |
| WhatsApp | `/api/hooks/whatsapp` (GET verify, POST signed) | audio, images, video, ≤ 3 buttons, ≤ 10 list rows, 4096 chars, location | **Implemented** |
| USSD | `/api/hooks/ussd` (`CON`/`END`) | 160 chars, numbered menus, two levels, answer delivered by SMS | **Implemented** |
| SMS | `/api/hooks/sms`, `/api/hooks/sms/dlr` | ≤ 3 concatenated parts, delivery reports | **Implemented** |
| PWA | the application itself + `/api/v1/sessions/**` | audio, images, video, long text, background sync, offline outbox | **Implemented** |
| Assisted console | `channel = "assisted"`, `POST /api/v1/cases`, `/cas/nouveau` | worker records an interaction with declared proxy status | **Partial** |
| Android application | `channel = "android"` in the enum, capabilities defined | offline-first field worker experience | **Planned (Phase 4)** |
| Call-centre handoff | SIP transfer to a partner call centre | — | **Planned (Phase 5)** |

Shared services: capability negotiation (a client may narrow a channel, never widen it), identity resolution across channels, consent gate, opt-out and opt-in in five languages, emergency short-circuit, spoken chunking with a continuation prompt, 24-hour resume, background work for channels that must acknowledge fast (USSD, telephony webhooks), signed short-lived media URLs for telephony fetches, the channel error contract.

## 6.5 Cases and workflow module

Covered in §5.8. Routes: `GET/POST /api/v1/cases`, `GET/PATCH /cases/{id}`, and the sub-resources `/escalate`, `/acknowledge`, `/transitions`, `/assignments`, `/risk-overrides`, `/follow-ups`, `/notes`, `/merge`, plus `/api/v1/tasks[/{id}]` and `/api/v1/queues`. Screens: `/cas`, `/cas/[id]`, `/cas/nouveau`. Tests: `tests/ops-workflow.test.ts` (16 cases), `tests/ops-routes.test.ts`. **Implemented.**

## 6.6 Notifications module

Template catalogue in five languages with lifecycle status, module, risk level and sensitivity; render with placeholder filling and unknown-placeholder dropping; delivery policy: quiet hours 21:00–06:00 Africa/Kinshasa (UTC+1, no daylight saving), weekly cap of three non-emergency messages per citizen, consent required for reminders and broadcasts, duplicate suppression in a 24-hour window, channel fallback WhatsApp → SMS → voice with two attempts each and exponential backoff, every attempt recorded in the delivery trail; **a sent message is never treated as acknowledged** — acknowledgement is a human act (`NOT-003`); sensitive subjects leave the platform only in lock-screen-safe wording. Providers: Africa's Talking, Twilio, Meta, and a log provider so the platform runs offline. Routes: `GET /api/v1/notifications`, `PATCH /notifications/{id}`, `POST /notifications/{id}/ack`, `GET/POST /notifications/broadcast`. Screens: `/notifications`, `/notifications/envoyer`, `/messages`. Tests: `tests/ops-notifications.test.ts`. **Implemented.**

The brief's example texts are implemented as templates: *« Ce cas de santé nécessite une revue urgente. »* · *« Les signalements de maladie des cultures augmentent dans cette zone. »* · *« Cet apprenant demande souvent de l'aide sur les fractions. »* · *« Ce cas n'a pas été suivi dans le délai requis. »*

## 6.7 Reminders and scheduling module

`schedules` rows of kind `vaccination | anc | planting | revision | follow_up | sla | report`, created from reference calendars: the DRC Programme Élargi de Vaccination schedule (BCG/VPO-0 at birth, three series at 6/10/14 weeks, measles and yellow fever at 9 months, measles booster at 15 months), WHO 2016 antenatal contacts, provincial sowing windows, and revision lead days before an examination. `runScheduler()` fires everything due, re-checking consent at send time, and is the single cron entry point (`POST /api/v1/workflow/run` with `x-cron-secret`, or `npm run workflow:run`). Routes: `GET/POST/DELETE /api/v1/reminders[/{id}]`. **Implemented.**

## 6.8 Reports and analytics module

Nine catalogued reports (`REPORT_TYPES`): `daily_usage`, `weekly_health_trends`, `weekly_agri_risk`, `weekly_education_support`, `monthly_regional_activity`, `monthly_ngo_impact`, `quarterly_government_programme`, `monthly_ai_performance`, `monthly_cost_usage`. Three formats: branded PDF (pdfkit — programme name, title, period and page number on every page; summary first; definitions, denominators, freshness and the suppression rule last), XLSX (exceljs — cover sheet, one sheet per section, a governance sheet), CSV (UTF-8 with a governance header). Jobs are asynchronous, purpose-coded, audited, expiring after seven days, and the download route refuses an expired link and deletes the object. Report definitions carry a cadence and recipients and are fired by the scheduler. Direct CSV exports: `GET /api/v1/reports/{interactions|cases|health|agriculture|education|audit|usage}?days=30`. Screens: `/rapports`. Tests: `tests/ops-reports.test.ts`. **Implemented.**

Live analytics: `GET /api/v1/analytics/{dashboard,activity,alerts,insight}` and `/analytics/module/{module}`. **Implemented.**

## 6.9 Admin module

Covered in §14. Routes under `/api/v1/admin/**`: `status`, `stats`, `config`, `seed`, `kb`, `protocols[/{id}]`, `tenants[/{id}]`, `organisations[/{id}]`, `templates[/{id}]`, `break-glass`; plus `/api/v1/users` and `/api/v1/audit-logs`. Screens: `/admin`, `/admin/utilisateurs`, `/admin/audit`. **Implemented.**

## 6.10 Language learning module

Covered in §5.11. Routes: `GET /api/v1/language/samples`, `PATCH /language/samples/{id}`, `GET/POST /language/lexicon`, `GET /language/proficiency`, `GET /language/export?language=`. Screen: `/langues` — proficiency meters per language (listening, understanding, speaking, level), the native-speaker review queue with correction and lexicon capture, the lexicon table, and the dataset export for holders of `language:export`. **Implemented.**

Quality gates before a language goes live in a module (PRD 1 §6.5, `docs/LANGUAGES.md`): WER ≤ 20 % clean and ≤ 30 % field audio (French ≤ 12 %), intent accuracy ≥ 90 % health and ≥ 85 % agriculture/education, emergency-class recall ≥ 98 %, TTS intelligibility MOS ≥ 3.8, language ID ≥ 95 %. A language below its gate is served in scripted or DTMF-guided mode. Gate **measurement** against gold sets is **Planned (Phase 2/3)** — the corpus, the review workflow, the proficiency metric and `evaluation_runs` exist; the annotated 2,000-utterance gold sets per language and module (`CP-02`) are a programme deliverable.

## 6.11 Consent and privacy module

Covered in §5.13 and §13. Routes: `GET/POST /api/v1/consents`, `GET/POST /api/v1/data-requests`, `GET/PATCH /data-requests/{id}`. Screen: `/parametres` (language, province, preferences, consents, reminders, data rights). **Implemented.**

## 6.12 Metering module

Covered in §12. `acu_ledger` + `ai_usage_logs`, the conversion table in `admin_config`, monthly consumption with cap and percentage, breakdown by task, module and language, cost per interaction, cap alerts at 80/95/100 %, degraded mode at the cap, and the monthly statement. Route: `GET /api/v1/metering/acu?scope=&period=`. Tests: `tests/ops-metering.test.ts`. **Implemented.**

## 6.13 Search, resources and history

`/recherche` — tenant- and role-filtered search across interactions and cases, module-scoped for field officers, `interaction:read_all` required for the national scope. `/ressources` — the approved knowledge base with authority, version, evidence grade and status, plus the protocol register. `/historique` and `/historique/[id]` — the citizen's own conversations with the full seven-part answer. **Implemented.**

---

# 7. Institutional Billing and Disbursement Door

> **Scope discipline.** This section describes an **institutional** rail, not a consumer product. Citizens are never charged, never hold a wallet, and never see a price. Nothing in this section is required for the platform to operate; it is the optional door through which a funding institution settles what it owes and, if a programme decides so, disburses money to the people who deliver the service. **Planned (Phase 4/5), optional.**

## 7.1 What the source PRDs said, and what changes

PRD 1 §19 (CM-01..04) placed BitriPay as the institutional billing rail: "FDSU/Government is the paying tenant … invoicing and settlement via BitriPay institutional rails; **no citizen is ever charged**". PRD 1 §3.2 explicitly put citizen payments out of scope for v1. This specification keeps that position exactly and adds one optional capability the brief's payment agent implied: **programme disbursement**.

## 7.2 Door A — institutional settlement (billing)

| Element | Specification |
|---------|--------------|
| Payer | the funding tenant (`tenants` row: FDSU national programme, a ministry, an NGO programme) |
| What is settled | the institutional licence plus metered ACU consumption plus telephony, SMS and WhatsApp pass-through, itemised |
| Source of truth | `acu_ledger` (every AI call attributed to tenant, organisation, module, language, channel and task) and `ai_usage_logs` |
| Statement | `monthlyStatement(tenantId)` → total ACU, cost, interactions, cost per interaction, breakdown by task, module and language, and the conversion table version used — already produced today (`src/server/core/metering.ts`) |
| Settlement rail | BitriPay institutional API, or a bank transfer against the same statement. **Planned.** The statement is the contract; the rail is replaceable. |
| Accuracy requirement | ACU metering accurate to ±2 % against provider invoices (`NFR-S-02`) |
| Citizen exposure | none |

## 7.3 Door B — programme disbursement (optional)

Some funders want the platform that *proves* delivery to also *pay* for it. Three programme flows are in scope if a funder asks for them:

| Flow | Trigger | Control |
|------|---------|---------|
| CHW stipend | verified activity: cases acknowledged within SLA, follow-ups captured, outcomes recorded over a period | a programme manager approves a disbursement batch; the evidence is the case record, not a self-declaration |
| Farmer input voucher | an extension officer confirms a validated cluster response or a field visit outcome | voucher, not cash; redeemable at listed suppliers; never triggered by a model |
| Cash transfer | an external programme rule (nutrition, school retention) | CVOS provides the eligibility evidence; the decision is the programme's |

Never automatic, never model-triggered, never a citizen-facing balance.

## 7.4 Integration surface (specification)

| Concern | Specification |
|---------|--------------|
| Keys | API keys per tenant, per environment; `sandbox` and `live` separated by key prefix and by base URL; keys in the secret manager, never in the database, never in a client bundle |
| Idempotency | every disbursement request carries an `Idempotency-Key`; the existing `withIdempotency()` mechanism applies unchanged |
| Webhooks | inbound provider callbacks are signature-verified exactly as the WhatsApp and Twilio webhooks are; events: `payout.created`, `payout.settled`, `payout.failed`, `payout.reversed`, `dispute.opened`, `dispute.resolved` |
| Settlement | daily settlement file reconciled against the ledger; unmatched lines raise an alert requiring acknowledgement |
| Refunds and reversals | a reversal is a new ledger entry, never an edit; the original is immutable |
| Disputes | a dispute opens a case in a dedicated `finance` queue with its own SLA and a named owner |
| Monitoring | payout success rate, settlement lag, unmatched lines, dispute rate, per-provider availability on the admin console |
| Audit | every disbursement action writes an `audit_logs` row with actor, role, before, after, purpose and IP, inside the same hash chain as everything else |
| Authorisation | step-up MFA on approval; four-eyes approval for a batch above a configured threshold |
| Mobile money | M-Pesa (Vodacom), Airtel Money, Orange Money and Afrimoney through one aggregator adapter, so the programme is not locked to one MNO |
| PCI-DSS | card data is **never** touched. Mobile money and bank transfer only; the platform stores a masked destination and a provider reference. This keeps CVOS out of PCI-DSS scope — see §13.6. |

## 7.5 Data model additions (Planned)

`payment_accounts` (tenant, provider, environment, masked destination, status) · `disbursement_batches` (programme, period, approver, four-eyes approver, total, status) · `disbursements` (batch, recipient user, amount, currency, provider reference, status, failure reason, evidence link) · `settlement_lines` (provider file, matched disbursement, variance) · `disputes` (disbursement, case, status, resolution). All under the same tenancy, audit and retention rules as the rest of the schema.

## 7.6 Why this stays optional

A public-good service must be able to run with the payment door closed. Nothing in the citizen path, the clinical path or the reporting path depends on it. If a funder settles by bank transfer against the monthly statement, Door A is a PDF; if a programme pays stipends elsewhere, Door B is simply not enabled for that tenant (`tenants.entitlements`).

---

# 8. Third-Party Connector Ecosystem

Every category the master prompt lists is assessed against one question: **does a public-good, free-for-citizens voice service in the DRC actually need it?** Categories are marked **Core** (in the critical path), **Programme** (needed by the funding institution), **Optional** (enable per tenant) or **Not applicable** (correctly absent, and absent on purpose).

## 8.1 Connector register

| # | Category | Why it would be needed | Where it connects | Data exchanged | Best-fit providers | Verdict and status |
|---|----------|----------------------|-------------------|----------------|--------------------|---------------------|
| 1 | **AI providers** (LLM, vision, STT, TTS) | understanding, explanation, transcription, speech | `src/server/ai/gateway.ts` only | prompt text (pseudonymous), audio bytes, images; never a phone number or a name | Anthropic Claude (reasoning), Google Gemini (audio for kg/lua), OpenAI (Whisper-family STT, TTS), Google Cloud TTS (fr, sw) | **Core — Implemented**, four adapters plus an offline rules provider, failover per capability |
| 2 | **SMS** | reminders, USSD answers, fallback delivery, delivery reports | `src/server/channels/sms.ts`, `/api/hooks/sms`, `/api/hooks/sms/dlr` | destination MSISDN, message text, provider message id, delivery status | Africa's Talking (DRC coverage), Twilio, direct MNO SMPP | **Core — Implemented** |
| 3 | **Voice / telephony (IVR)** | the primary rural channel | `/api/hooks/ivr/twilio/**`, `src/server/channels/twilio.ts` | caller id (hashed on our side), recording URL, DTMF digits, TwiML | Twilio Programmable Voice, Africa's Talking Voice, MNO SIP trunk | **Core — Implemented**; `[DECISION REQUIRED]` D-02 provider choice and toll-free arrangement |
| 4 | **WhatsApp** | the rich channel: voice notes, photos, buttons | `/api/hooks/whatsapp`, `src/server/channels/whatsapp.ts` | WhatsApp id (hashed), media ids, message content, template names | Meta WhatsApp Business Cloud API (direct), Twilio as a reseller | **Core — Implemented**; template approval is a Phase 0 dependency |
| 5 | **USSD** | menu access with no data and no smartphone | `/api/hooks/ussd` | session id, MSISDN, menu text | Africa's Talking, MNO USSD gateway via an aggregator | **Core — Implemented** |
| 6 | **Push notifications** | worker alerts on the PWA and a future Android app | notification engine | device token, redacted payload | Web Push (VAPID), Firebase Cloud Messaging | **Programme — Planned (Phase 3)**; in-app, SMS, WhatsApp and voice cover the need today |
| 7 | **Email** | administrator and supervisor alerts, report delivery | `sendEmail()` in `src/server/core/notifications.ts` | institutional address, alert text, report link | Postmark, Amazon SES, SendGrid | **Programme — Partial** (log provider implemented; a real provider is a configuration change) |
| 8 | **Cloud storage** | audio, photos, video, generated reports | `src/server/core/storage.ts` | media bytes, checksum, MIME, retention class | Google Cloud Storage (reference target), any S3-compatible store | **Core — Implemented** (local driver and GCS driver) |
| 9 | **Maps and geodata** | province and territory reference, facility location, cluster maps | `src/server/db/reference/geography.ts`, `service_directory`, `PROVINCE_CENTROIDS` | administrative names, centroids | official INS/Ministry of the Interior nomenclature; OpenStreetMap for display; PostGIS if precise geometry is ever needed | **Core reference data — Implemented (to validate)**; interactive map tiles **Planned (Phase 4)**; exact citizen coordinates are deliberately *not* collected |
| 10 | **Weather** | planting, spraying and harvest advice | `src/server/ai/tools/weather.ts` | province centroid, forecast | Open-Meteo (free, no key — implemented), national meteorological agency | **Core — Implemented** |
| 11 | **Market price data** | informational prices with source and date | `market_prices`, `POST /api/v1/agriculture/prices/upload` | market, commodity, unit, grade, price, observation date, source | national statistics service, provincial agriculture inspectorates, FAO/WFP price monitors | **Core — Implemented** (administrative CSV upload; a live feed is Phase 4) |
| 12 | **Identity / SSO for staff** | federated login, MFA, device-bound sessions | `src/server/core/auth.ts`, `mfa.ts` | subject id, role claims | Keycloak (self-hosted, sovereign) or Google Workspace OIDC | **Programme — Partial**: phone + PIN with scrypt and TOTP MFA implemented; OIDC federation **Planned (Phase 3)**; `[DECISION REQUIRED]` D-05 |
| 13 | **Analytics / warehouse** | national analytics beyond operational SQL | Planned CDC feed from `event_store` | de-identified, contract-tested data products | BigQuery, ClickHouse, DuckDB for a sovereign small-scale option | **Programme — Planned (Phase 4)** |
| 14 | **Document generation** | branded PDF and XLSX reports | `src/server/reports/{pdf,xlsx,csv}.ts` | report document structure | pdfkit and exceljs, in-process — no third party, no data leaves the platform | **Core — Implemented** (deliberately not a SaaS) |
| 15 | **Support / ticketing** | institutional support desk for workers and administrators | — | ticket subject, no citizen content | Zammad (self-hosted), Freshdesk | **Optional — Planned (Phase 4)**; the case system is not a support desk and must not become one |
| 16 | **Payments (institutional)** | settle the licence and ACU statement | §7 Door A | invoice, statement totals | BitriPay institutional rails, bank transfer | **Optional — Planned (Phase 4)** |
| 17 | **Mobile money (disbursement)** | CHW stipends, input vouchers, cash transfers | §7 Door B | recipient MSISDN, amount, provider reference | M-Pesa, Airtel Money, Orange Money, Afrimoney, through one aggregator | **Optional — Planned (Phase 5)** |
| 18 | **Banking-as-a-Service** | issuing accounts or cards | — | — | — | **Not applicable.** CVOS holds no funds, issues nothing, and is not a financial institution. |
| 19 | **KYC / KYB** | identity verification of a paying business | — | — | — | **Not applicable to citizens** — CVOS is explicitly usable anonymously (`IAM-001`). Institutional KYB, if a payment provider requires it, is the funder's obligation, performed by the provider, never by CVOS. |
| 20 | **AML / sanctions screening** | screening money movements | — | — | — | **Not applicable** unless Door B is enabled; then screening is the payment provider's regulated obligation. CVOS holds no funds and performs no screening. |
| 21 | **Fraud prevention (payments)** | card and transaction fraud scoring | — | — | — | **Not applicable.** No cards, no citizen transactions. Platform abuse controls are in §5.14 and §9.9. |
| 22 | **Open banking** | account aggregation | — | — | — | **Not applicable.** |
| 23 | **FX** | multi-currency conversion | — | — | — | **Not applicable** in the citizen path. Programme reporting uses CDF for market prices and USD for cost per interaction, with the rate stated on the report, not fetched live. |
| 24 | **Subscription billing** | recurring consumer charges | — | — | — | **Not applicable — and forbidden.** No citizen subscription exists. The institutional licence is an annual contract settled against a statement (§12). |
| 25 | **Accounting** | posting the funder's costs to a ledger | statement export | statement totals, cost centres | the funder's own system; CSV/XLSX export is sufficient | **Optional — Partial** (statement export exists; no direct integration) |
| 26 | **Tax** | tax computation | — | — | — | **Not applicable** to a free public service; any tax obligation sits with the contracting entity, not the platform. |
| 27 | **CRM** | institutional relationship management (ministries, NGOs, donors) | — | organisation contacts | the programme's own CRM | **Optional — Not built.** Citizens must never be entered into a CRM; the case system is a service record, not a sales pipeline. |
| 28 | **Data enrichment** (third-party profile data) | enriching a person's profile | — | — | — | **Not applicable — and forbidden.** Data minimisation (`SEC-01`, PRD 2 §15.2) prohibits enriching a citizen record from external sources. |
| 29 | **E-signature** | signing programme agreements and protocol approvals | `protocol_versions.approvedBy` | approver identity, document hash | DocuSign, or a signed PDF held by the programme | **Optional — Planned (Phase 4)**; today an approval is an audited database record, which is sufficient evidence internally |
| 30 | **Health interoperability** | sharing triage outcomes with the national health information system | Planned FHIR mapping at the integration boundary | Patient/Person, Practitioner, Organization, Location, Observation, RiskAssessment, ServiceRequest, Task, Consent, Provenance, AuditEvent | DHIS2 (national), HL7 FHIR R4 profiles | **Programme — Planned (Phase 5)**; internal guidance must never be misrepresented as a confirmed FHIR diagnosis |
| 31 | **Error tracking / APM** | production diagnostics | structured logs today | scrubbed messages only — `safeLog` and `redact()` run first | Sentry (self-hosted), Grafana Cloud, Google Cloud Operations | **Programme — Partial**; Cloud Logging picks up structured logs today |
| 32 | **Secret management** | provider keys, session secret, telephony tokens | environment variables from a secret manager | secrets, never in the image or the repository | Google Secret Manager, HashiCorp Vault | **Core — Implemented by deployment** (`docs/DEPLOYMENT.md`) |
| 33 | **WAF / DDoS / CDN** | edge protection for public webhooks | in front of the application | request metadata | Google Cloud Armor, Cloudflare | **Core — Deployment-provided**, see §9.9 |

## 8.2 Connector rules that apply to all of them

1. **One adapter, one file, one internal key.** No vendor SDK leaks past its adapter; nothing outside `src/server/ai/gateway.ts` knows an AI vendor exists.
2. **Every connector degrades.** Missing credential means log mode or rules mode, never a broken citizen journey. This is what makes the whole test suite run offline.
3. **Never send more than the turn needs.** Prompts use pseudonymous identifiers and only the context required (PRD 2 §15.2).
4. **Secondary training disabled where the provider supports it**, and no identifiable citizen data is used for third-party model training by default (PRD 2 §1.3).
5. **Exit test.** Each connector must have a documented replacement and a tested fallback; provider exit tests are a Phase 5 gate.
6. **No connector may become a dependency of a safety path.** The emergency script, the danger-sign detection and the protocol engine run with every third party unreachable.

---

# 9. Production-Grade Architecture

## 9.1 Shape of the system

`[DIVERGENCE]` PRD 1 §5.3 specifies eleven NestJS microservices plus a Python LangGraph runtime on GKE with a Kafka backbone; PRD 2 §19.1 recommends "a well-bounded modular monolith plus independent media/orchestration workers, then extract only where scale or team boundaries justify it".

**Implemented choice: PRD 2's position.** One Next.js 16 application containing the frontend, the `/api/v1` surface and the channel webhooks, with hard internal module boundaries (`@server/{core,db,ai,channels,reports}`) that map one-to-one onto PRD 1's service catalogue. Every one of PRD 1's services exists as a bounded module, so extraction is a deployment decision rather than a rewrite:

| PRD 1 service | Module here | Extractable to a service |
|---------------|-------------|--------------------------|
| ivr-adapter | `src/server/channels/{ivr,twilio,media}.ts` + `/api/hooks/ivr/**` | yes |
| whatsapp-adapter | `src/server/channels/whatsapp.ts` + `/api/hooks/whatsapp` | yes |
| ussd-sms-adapter | `src/server/channels/{sms,menus}.ts` + `/api/hooks/{ussd,sms}` | yes |
| web-gateway (BFF) | `src/app/api/v1/**` through `handle()` | yes |
| identity | `src/server/core/{auth,users,mfa}.ts`, `citizen_identifiers`, `consents` | yes |
| session | `src/server/channels/session.ts`, `sessions`, `interactions` | yes |
| agent-runtime | `src/server/ai/agents/**` | yes |
| ai-gateway | `src/server/ai/gateway.ts` + `src/server/core/metering.ts` | yes |
| case | `src/server/ai/agents/workflow.ts` | yes |
| notification | `src/server/core/notifications.ts` | yes |
| reporting | `src/server/ai/agents/reporting.ts`, `src/server/reports/**` | yes |
| admin-config | `admin_config` + `/api/v1/admin/**` | yes |
| scheduler | `src/server/core/scheduler.ts` + `POST /api/v1/workflow/run` | already a separate cron entry point |

## 9.2 Frontend

Next.js 16 App Router, React 19, Tailwind 4, TypeScript strict. Server components read server modules directly; client components call `/api/v1`. `src/client/**` holds the shell (sidebar, topbar, language provider, service worker registration), the home OS screen, the voice console, dashboards, case components, language review, notifications, reports and admin components. `src/shared/**` holds contracts used by both sides: types, the `FinalAnswer` shape, the five-language UI dictionary and formatters — with **no server imports**. Installable PWA with an offline shell and an IndexedDB outbox. Accessibility target WCAG 2.2 AA (`NFR-U-01`, `NFR-008`): keyboard operation, non-colour status cues, large touch targets, visible transcripts; a formal audit is **Planned (Phase 3)**.

## 9.3 Backend and API gateway

Every `/api/v1` route is `handle({ permission | auth, limit }, fn)` from `src/server/core/api.ts`, which provides, in order: authentication (signed cookie or bearer) → permission check against the RBAC matrix → rate limiting (`default` 120/min, `ai` 30/min per user or IP) → typed body validation with zod → uniform error envelope `{ error: { code, message, details? } }` → request logging into `api_request_logs` with method, path, user, role, status, duration and IP. Channel webhooks are **signature-verified** instead of session-authenticated and answer with the channel error contract. Errors never contain provider traces, prompts, secrets or SQL.

## 9.4 Database

PostgreSQL dialect through Drizzle ORM; `DATABASE_URL` selects node-postgres, otherwise an embedded PGlite database under `DATA_DIR/pglite` (in-memory under test). `src/server/db/schema.ts` is the single source of truth; `drizzle/0000_init.sql` is the one pre-release migration, applied automatically at boot so the platform starts from a clean checkout. Full table catalogue in §10.

## 9.5 Authentication, RBAC and ABAC

- **Citizens**: anonymous or pseudonymous sessions are first-class (`IAM-001`); phone verification is never the only route. Channel identity resolves a citizen across IVR, SMS, USSD and WhatsApp by peppered SHA-256 identifier hashes.
- **Institutional users**: phone + PIN (scrypt with a per-row salt), stateless HMAC-signed session cookie, TOTP MFA mandatory for `gov_admin` and `platform_admin`, step-up verification within a 15-minute window for high-risk actions (severity override, identifiable export, break-glass).
- **RBAC**: `ROLE_PERMISSIONS` — permissions are declared once and never inlined as role checks.
- **ABAC**: module scope for field roles; province and territory scope on organisations; queue ownership; `mine=1` filters; per-tenant caps and entitlements.
- **Row-level security**: `[DIVERGENCE]` both PRDs require PostgreSQL RLS keyed on tenant and scope. **Implemented choice today: application-level enforcement** in `handle()` plus per-query scoping; **PostgreSQL RLS policies are Planned (Phase 3)** and specified as: `ALTER TABLE cases ENABLE ROW LEVEL SECURITY` with a policy on `tenant_id = current_setting('app.tenant_id')::uuid AND (role in ('platform_admin','gov_admin','auditor') OR territory_id = ANY(...))`, the session variables being set per request in the database client. This is the single largest security gap between the specification and the code, and it is stated plainly here so it cannot be missed.

## 9.6 AI orchestration and the gateway

`src/server/ai/gateway.ts` is the only vendor-aware module. Providers register only when their credential is present. Chains per capability, environment-configurable:

| Capability | Default chain | Rationale |
|------------|---------------|-----------|
| LLM | `anthropic → gemini → openai → mock` | judgement-heavy structured output, two independent fallbacks, rules keep the platform alive |
| Vision | `anthropic → gemini → openai → mock` | multimodal understanding with the same failover |
| STT | `openai → gemini → mock` | Whisper-family is strong on French and Swahili; Gemini listens directly to Kikongo and Tshiluba audio |
| TTS | `google_tts → openai → on-device` | natural voices where they exist; the browser or handset speaks otherwise |

Every call is tried down the chain; every attempt — success or failure — is logged to `ai_usage_logs` and, on success, metered into `acu_ledger`. Structured outputs are validated with zod on every provider; a schema failure or a refusal moves to the next provider. Provider names, model names, prompts and keys never reach a client (`SEC-08`).

## 9.7 Agent memory and the knowledge store

| Memory kind | Where | Scope and limits |
|-------------|-------|------------------|
| Turn state | `interactions` row, written stage by stage | one turn |
| Session state | `sessions.state` (IVR step, USSD position, continuation chunks, opt-out, shared-phone answer, last question and answer) | 24 hours, resumable |
| Citizen memory | `getProfileContext()` — language, province, top three intents, last three summaries | consent-scoped; **never** a health inference |
| Learner memory | `learner_profiles` (confirmed, never inferred) + `learning_evidence` events | education only |
| Corpus memory | `language_corpus` + `language_lexicon`, retrieved per turn into the prompt | verified entries only |
| Knowledge | `kb_documents` + `kb_chunks` from `content/kb/**`, front-matter governed, checksum-versioned | approved status only; filters before ranking |

**Retrieval**: PostgreSQL French full-text search (`to_tsvector('french', …)` with `ts_rank`) and an accent-folded in-memory keyword fallback for PGlite, with protocol-cited documents boosted to the top and at most one chunk per document so *k* sources means *k* documents. `[DIVERGENCE]` Both PRDs specify pgvector embeddings with an HNSW index; **implemented choice: lexical retrieval with hard pre-filters**, because at the current corpus size it is deterministic, explainable, offline-capable and free. **pgvector is Planned (Phase 3)**: the `kb_chunks` table already carries the chunk, language and checksum columns an embedding column would join.

## 9.8 Event-driven workflow, webhooks and notifications

- **Event store**: `event_store`, append-only, with the full envelope required by PRD 2 §13.4 — `event_id`, `event_type`, `event_version`, `occurred_at`, `recorded_at`, `tenant_id`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `actor`, `trace_id`, `correlation_id`, `causation_id`, `classification`, `payload`, plus channel, language and module. `emitEvent()` never throws: a reply is never lost because logging failed.
- `[DIVERGENCE]` PRD 1 §11 specifies Kafka topics `cvos.*` with a schema registry, 30 days hot and permanent storage in the event store plus BigQuery. **Implemented choice: the PostgreSQL event store is the log.** Kafka is **Planned (Phase 4)** as a fan-out for external consumers; the event names and envelope are already Kafka-shaped, so adding a producer is additive. The outbox pattern PRD 1 §18.4 requires for Kafka unavailability is inherent here: the events *are* the outbox.
- **Inbound webhooks**: `/api/hooks/whatsapp` (Meta `X-Hub-Signature-256` HMAC and GET challenge), `/api/hooks/ivr/twilio/**` (`X-Twilio-Signature`), `/api/hooks/ussd`, `/api/hooks/sms`, `/api/hooks/sms/dlr`. Idempotent by provider message id.
- **Outbound webhooks** to partner systems: **Planned (Phase 4)**.
- **Notification engine**: §6.6.
- **Scheduler**: one cron entry point running seven independent steps; a failure in one never stops the others, and the run report lists every error.

## 9.9 Cybersecurity command centre

| Control area | Implemented today | Planned |
|--------------|-------------------|---------|
| **Zero trust** | every request re-authenticated and re-authorised at the route; no implicit trust from network position; webhooks trusted only by signature; server-only modules cannot be imported by a client bundle (`import "server-only"`) | mTLS between extracted services (Phase 4) |
| **MFA and step-up** | TOTP (RFC 6238) on `node:crypto`, mandatory for administrator roles, 15-minute step-up window for high-risk actions, constant-time verification with ±1 step drift | WebAuthn (Phase 5) |
| **Device signals** | session cookie is HttpOnly, SameSite=Lax, Secure in production; unsynchronised-item count shown before logout | device binding for the worker PWA, rooted-device restriction on sensitive downloads (`PRD 2 §11.3`, Phase 4) |
| **Threat detection** | 5xx rate, provider failure rate, contract-violation rate, override rate, audit-chain verification, unacknowledged-alert sweep | SIEM export, anomaly baselines (Phase 4) |
| **Fraud prevention** | §5.14 | behavioural scoring (Phase 4) |
| **DDoS** | rate limiter in-process; Cloud Armor or an equivalent WAF in front (`docs/DEPLOYMENT.md`) | distributed rate limiting in Redis when horizontally scaled (Phase 3) |
| **SQL injection** | Drizzle parameterised queries throughout; no string-built SQL; `sql` templates bind values | — |
| **XSS** | React escaping by default; no `dangerouslySetInnerHTML` in the codebase; TwiML is XML-escaped (`escapeXml`) | CSP header (Phase 3) |
| **CSRF** | SameSite=Lax cookies plus a bearer-token alternative; state-changing routes require an explicit permission | double-submit token for cookie-only clients (Phase 3) |
| **Session hijacking** | HMAC-signed stateless sessions with expiry; secret rotation documented; timing-safe comparison | session revocation list on role change (`IAM-005`, Phase 3) |
| **Account takeover / credential stuffing** | scrypt PIN hashing, failed-login auditing, rate limiting on the login route | lockout with backoff, breached-credential check for staff (Phase 3) |
| **API abuse** | per-class rate limits, idempotency keys, request logging with duration, permission checks on every route | per-tenant quotas, API keys for partners (Phase 4) |
| **Bots and scraping** | anonymous sessions are rate-limited by IP; no bulk citizen endpoint exists | WAF bot rules (deployment) |
| **Encryption in transit** | HTTPS only; TLS 1.2+ terminated at the edge; provider calls over TLS | mTLS internally (Phase 4) |
| **Encryption at rest** | database and object-store encryption by the platform (Cloud SQL, GCS with CMEK per `docs/DEPLOYMENT.md`) | field-level encryption for Class A columns with per-tenant keys (`SEC-05`, Phase 3) |
| **Encryption in use** | not attempted; the honest position is that confidential computing is out of scope | evaluate confidential VMs at national scale (Phase 5) |
| **Tokenisation and pseudonymisation** | identifiers stored as peppered hashes plus last four digits; `users.pseudoId` for analytics; erasure replaces the account with a stable tombstone token | HMAC pseudonymisation at the analytics boundary with two-person re-identification approval (`SEC-07`, Phase 4) |
| **Log safety** | `redact()` and `safeLog` scrub phone numbers, e-mails, identity tokens, UUID tails and cued names before anything reaches stdout | log-pipeline scanning (Phase 4) |
| **Audit integrity** | per-day SHA-256 hash chain, verified daily by the scheduler, break raises an emergency acknowledged alert | daily digest export to cold storage (`FR-AS-06`, Phase 3) |
| **Break-glass** | time-boxed, justified, scoped grants with an alert and an audit row | automatic expiry job and weekly review report (Phase 3) |
| **Supply chain** | pinned dependencies, minimal surface (12 runtime dependencies), no vendor SDK outside its adapter | SAST, dependency and container scanning, SBOM, image signing in CI (`DO-03`, `SEC-12`, Phase 2/3) |
| **Penetration testing** | — | quarterly, plus one independent test before national scale (`SEC-12`, PRD 2 §15.1) |

## 9.10 Data intelligence layer

| Component | Today | Planned |
|-----------|-------|---------|
| **Transactional system of record** | PostgreSQL, 53 tables, one migration | partitioning of `event_store` and `interactions` by month (Phase 4) |
| **Object store** | local disk or GCS, checksum on every object, retention by prefix | lifecycle rules per media class (Phase 3) |
| **Event stream** | `event_store` (append-only, full envelope) | Kafka fan-out with a schema registry, BACKWARD compatibility (Phase 4) |
| **Read models / CQRS** | live SQL aggregation | `rm_usage_daily`, `rm_health_trends`, `rm_agri_clusters`, `rm_edu_gaps`, `rm_language_usage`, `rm_cost_daily` rebuilt from events (Phase 4) |
| **Warehouse / lakehouse** | — | CDC-fed, de-identified, contract-tested data products (Phase 4) |
| **Vector store** | — | pgvector on `kb_chunks` (Phase 3) |
| **Knowledge graph** | the curriculum map is a prerequisite graph; protocols are decision graphs | a formal domain graph only if a use case demands it — not speculative |
| **Real-time analytics** | dashboards over live tables, `force-dynamic` | streaming aggregates (Phase 4) |
| **Predictive engine** | rule-based cluster and trend detection | governed forecasting with published performance and a human owner (Phase 4) |
| **Behavioural engine** | usage patterns per language, province and channel | equity analytics: who is *not* reaching the service (Phase 4) |
| **Recommendation engine** | `insightOfTheDay()` — one data-backed recommendation with its basis | next-best-action for queues (Phase 4) |
| **Decision engine** | the protocol engine, the risk agent and the workflow state machine — deterministic, versioned, testable | unchanged; this is the design, not a stepping stone |
| **Caching** | in-process ACU conversion cache, reference-data memoisation | Redis for sessions, rate limits and hot menu answers (Phase 3) |

## 9.11 Non-functional targets

| ID | Requirement | Target | Position today |
|----|-------------|--------|----------------|
| NFR-P-01 / NFR-002 | IVR first spoken reply | ≤ 6 s p95 (PRD 1); P95 first acknowledgement < 2 s, useful response < 12 s text and < 20 s voice (PRD 2) | Both preserved. Measured per turn in `interactions.latencyMs`; chunking and the emergency short-circuit protect the first response |
| NFR-P-02 | WhatsApp voice note ≤ 30 s | reply ≤ 12 s p95 | as above |
| NFR-P-03 | Photo analysis | ≤ 15 s p95 | evidence gate avoids wasted vision calls |
| NFR-P-04 | Dashboard load | ≤ 2.5 s p95 on 3G; API p95 ≤ 400 ms excluding AI | server components, no client data fetching on first paint |
| NFR-P-05 | Throughput | 50 concurrent IVR calls and 500 WhatsApp turns/min at MVP; 1,000 / 10,000 by Phase 5 | load profile **Planned (Phase 3)** |
| NFR-003 | Deterministic danger-rule result | P99 < 2 s after the transcript is available | keyword pass runs before any model call |
| NFR-A-01 / NFR-001 | Availability | 99.5 % pilot, 99.9 % national; emergency path 99.95 % from cached human-recorded audio | degraded modes implemented; recorded prompts **Planned** |
| NFR-A-02 / NFR-004/005 | RPO / RTO | RPO ≤ 15 min (PRD 1) or ≤ 5 min for accepted events and ≤ 1 min for critical configuration (PRD 2); RTO 2 h (PRD 1) or ≤ 60 min pilot and ≤ 30 min national (PRD 2) | Both preserved; **implemented choice: the stricter PRD 2 targets**, delivered by managed PostgreSQL HA with point-in-time recovery |
| NFR-S-01 | Cost per completed interaction | ≤ USD 0.08 blended at 100k/month; ≤ USD 0.04 at 1M — excluding telephony and WhatsApp fees, reported separately | measured live: `costPerInteractionUsd` in `/api/v1/metering/acu` and on `/admin` |
| NFR-006 | Scale | horizontal scaling tested to 10× forecast peak, per-channel backpressure | **Planned (Phase 3)** |
| NFR-007 | Offline | 72 h of field capture, ≥ 200 queued events per managed device | outbox implemented; the 72 h device profile is **Planned (Phase 4)** with the Android app |
| NFR-O-01 / NFR-009 | Observability | 100 % of requests traceable by trace id across adapter, workflow, model and persistence | `traceId` columns exist; OpenTelemetry wiring **Planned (Phase 3)** |
| NFR-010 | Maintainability | ≥ 80 % unit coverage on deterministic domain and policy code; **100 % rule coverage on safety rule packs** | rule coverage enforced by `tests/health-protocols.test.ts` |
| NFR-012 | Localisation | no production string outside the localisation registry; untranslated-string telemetry | UI dictionary implemented; telemetry **Planned (Phase 3)** |

## 9.12 Degraded modes (explicit, never improvised)

| Failure | Behaviour |
|---------|-----------|
| One LLM provider down | next provider in the chain, same request |
| All providers down | offline rules provider: protocol trees still run, scripted explanations, low-confidence flag |
| STT unavailable or a language below its gate | text or DTMF/USSD-guided mode with fixed prompts |
| TTS unavailable | on-device speech synthesis |
| WhatsApp API outage | SMS fallback with a callback short code |
| Notification channel outage | WhatsApp → SMS → voice with retries and delivery events |
| ACU cap reached | non-emergency AI degrades to scripted mode; safeguards never switch off |
| Client offline | voice notes and photos queue locally and sync with idempotency keys |
| Event or audit write fails | the citizen still receives the reply; the failure is recorded and retried |
| Database unreachable | `GET /api/v1/system/health` returns 503; the load balancer removes the instance |

---

# 10. Database Schema

Source of truth: `src/server/db/schema.ts`. Migration: `drizzle/0000_init.sql` — **53 tables, 11 enumerated types, 26 indexes**, PostgreSQL dialect, applied automatically at boot.

**Data classification** follows `SEC-01` and PRD 2 §12.3: `public` · `internal` · `confidential` (identifiable non-health) · `sensitive` (health, pregnancy, child) · `restricted` (safeguarding, authentication secrets, precise location). Classification drives encryption, log redaction, export permission, retention, backup and support access.

**Retention** column states the programme default; every value is configurable per tenant, entity, domain, purpose and legal basis (PRD 2 §12.4). Erasure is a workflow: media deleted, free text blanked, account tombstoned, statutory audit retained (`src/server/core/privacy.ts`).

## 10.1 Enumerated types

`user_role` (citizen, chw, agri_officer, teacher, ngo, gov_admin, platform_admin) · `module_type` (health, agriculture, education, general) · `language_code` (fr, ln, kg, sw, lua) · `interaction_status` (received, processing, completed, failed, abandoned) · `case_status` (open, open_emergency, assigned, acknowledged, in_progress, needs_follow_up, reassigned, escalated, escalated_up, resolved, closed, cancelled, duplicate) · `channel_type` (pwa, ivr, whatsapp, ussd, sms, assisted, android) · `lifecycle_status` (draft, review, approved, canary, active, retired) · `severity_level` (low, medium, high, critical) · `notification_channel` (in_app, sms, whatsapp, email) · `notification_status` (queued, sent, failed, read) · `file_kind` (audio, image, video, document).

## 10.2 Identity and tenancy

| Table | Purpose | Key fields | Relationships | Indexes | Class | Retention | Audited |
|-------|---------|-----------|---------------|---------|-------|-----------|---------|
| `users` | every human: citizens (often anonymous), field workers, administrators | `id`, `phone` (unique), `name`, `isAnonymous`, `role`, `languagePreference`, `province`, `territory`, `organisation`, `consentStatus`, `pinHash`, `preferences`, `tenantId`, `organisationId`, `territories[]`, `onDuty`, `pseudoId` (unique), `ageBand`, `sex`, `mfaEnabled`, `mfaSecret`, `status` | → `tenants`, `organisations`; ← everything | `users_role_idx`, `users_province_idx`, `users_org_idx` | confidential (restricted for `pinHash`, `mfaSecret`) | account lifetime; tombstoned on erasure | yes |
| `tenants` | programme owner: FDSU national programme, a ministry, an NGO programme | `id`, `name`, `type`, `legalName`, `status`, `acuMonthlyCap`, `entitlements[]`, `settings` | ← `organisations`, `users`, `acu_ledger` | pk | internal | contract lifetime | yes |
| `organisations` | operational organisation under a tenant with geographic scope and routing skills | `id`, `tenantId`, `parentId`, `name`, `type`, `provinceScope[]`, `territoryScope[]`, `routingSkills[]` | → `tenants`, self-referencing | pk | internal | contract lifetime | yes |
| `citizen_identifiers` | one citizen, many channel identities | `id`, `userId`, `kind` (msisdn, whatsapp, pwa_account, ivr_caller), `valueHash` (peppered SHA-256), `valueLast4`, `verifiedAt` | → `users` (cascade) | `citizen_identifiers_kind_hash_idx` | confidential | deleted on erasure | yes |
| `consents` | purpose-specific consent events, never overwritten | `id`, `userId`, `purpose`, `status`, `version`, `method` (voice, button, ussd, worker_assisted), `language`, `proxy`, `evidenceUri`, `occurredAt` | → `users` (cascade) | `consents_user_purpose_idx` | confidential | statutory (proof of lawful basis) | yes |

## 10.3 Conversation

| Table | Purpose | Key fields | Relationships | Indexes | Class | Retention | Audited |
|-------|---------|-----------|---------------|---------|-------|-----------|---------|
| `sessions` | channel-agnostic conversation: one call, one WhatsApp thread, one USSD dial, one PWA visit | `id`, `tenantId`, `userId`, `channel`, `channelRef` (identifier hash), `language`, `module`, `status`, `province`, `territory`, `capabilities`, `proxy`, `consentSnapshot`, `state`, `turnCount`, `startedAt`, `lastTurnAt`, `endedAt` | → `users` | `sessions_channel_ref_idx`, `sessions_user_idx` | confidential | 12 months | via events |
| `interactions` | one turn, end to end — the autosave core | `id`, `userId`, `userRole`, `module`, `channel`, `language`, `languageConfidence`, `province`, `audioFileId`, `attachmentIds[]`, `originalInput`, `transcript`, `translationFr`, `intent`, `understanding`, `response`, `responseLanguage`, `structured`, `followUpQuestions[]`, `confidence`, `riskScore`, `severity`, `escalationRequired`, `caseId`, `status`, `summary`, `errorMessage`, `latencyMs`, `version`, `auditStatus`, `sessionId`, `seq`, `idempotencyKey`, `transcriptTags`, `confidenceDimensions`, `citations[]`, `promptVersion`, `protocolVersion`, `modelRoute`, `acu`, `failureReason`, `traceId`, `safeguarding` | → `users`, `sessions`, `cases`, `files` | `interactions_session_idx`, `_user_idx`, `_module_idx`, `_created_idx`, `_status_idx` | sensitive when `module = health` or `safeguarding`, else confidential | structured record per programme policy; free text blanked on erasure | yes (`interaction.completed`, `interaction.failed`) |
| `files` | every uploaded or generated media object | `id`, `userId`, `interactionId`, `kind`, `storageKey`, `mimeType`, `sizeBytes`, `sha256` | → `users` | pk | sensitive (media of a person) | raw audio 90 days (configurable); agricultural media 12 months | deletion audited |

## 10.4 Cases and accountability

| Table | Purpose | Key fields | Relationships | Indexes | Class | Retention | Audited |
|-------|---------|-----------|---------------|---------|-------|-----------|---------|
| `cases` | the unit of accountability | `id`, `module`, `userId`, `interactionId`, `title`, `severity`, `status`, `escalationLevel`, `assignedTo`, `province`, `territory`, `queue`, `severityLevel 0–4`, `aiSeverityLevel`, `overriddenSeverityLevel`, `overrideReason`, `slaDueAt`, `slaBreached`, `slaPausedReason`, `acknowledgedAt/By`, `resolvedAt`, `closedAt`, `outcome`, `actionTaken`, `citizenReachability`, `followUpDecision`, `safeguarding`, `isNotifiable`, `mergedInto`, `version` | → `users`, `interactions`, `tenants`, `organisations` | `cases_queue_idx`, `_sla_idx`, `_status_idx`, `_module_idx`, `_assigned_idx` | sensitive (health) / confidential | 5 years or programme policy | yes, every transition |
| `case_events` | the case's own history: created, assigned, status_changed, escalated, note, follow_up, merged, sla_breached, severity_overridden, task_completed, reminder | `id`, `caseId`, `type`, `fromValue`, `toValue`, `actorUserId`, `note` | → `cases` | pk | confidential | with the case | append-only |
| `tasks` | the work a case implies | `id`, `caseId`, `type` (acknowledge, call_citizen, field_visit, follow_up, validate_cluster, review_override), `ownerUserId`, `queue`, `priority`, `dueAt`, `status`, `acknowledgedAt`, `completedAt`, `evidence` | → `cases` | `tasks_case_idx`, `tasks_owner_idx` | confidential | with the case | yes |
| `follow_ups` | the citizen's own answer, captured later | `id`, `caseId`, `userId`, `scheduledFor`, `channel`, `status`, `outcome`, `outcomeText`, `capturedAt` | → `cases` | pk | confidential | with the case | yes |
| `risk_assessments` | a superseding record of every risk decision | `id`, `interactionId`, `caseId`, `rulePackVersion`, `triggeredRules[]`, `dimensions`, `band`, `severityLevel`, `score`, `escalate`, `reasons[]`, `supersededBy` | → `interactions`, `cases` | pk | sensitive | with the case | append-only |
| `ai_overrides` | every time a human overruled the model | `id`, `caseId`, `interactionId`, `workerId`, `field`, `aiValue`, `humanValue`, `reasonCode`, `reason` | → `cases`, `interactions` | pk | confidential | 5 years (model governance evidence) | yes |
| `safeguarding_records` | restricted disclosures: violence, abuse, exploitation, self-harm, unsafe home | `id`, `interactionId`, `caseId`, `category`, `isChild`, `ownerRole`, `status`, `restrictedNotes` | → `interactions`, `cases` | pk | **restricted** — never in ordinary notifications, exports or dashboards | safeguarding policy | yes |

## 10.5 Domain records

| Table | Purpose | Key fields | Class | Retention |
|-------|---------|-----------|-------|-----------|
| `health_triage_records` | one triage outcome per health turn | `interactionId`, `caseId`, `symptoms[]`, `ageGroup`, `pregnancyStatus`, `emergencyFlags[]`, `topic`, `recommendation`, `referralStatus`, `followUpStatus`, `province`, `territory`, `healthZone`, `protocolId`, `protocolVersion`, `answers`, `severityLevel 0–4`, `riskBand`, `triggeredRuleIds[]`, `timeToAction`, `careDestinationType`, `referralFacilityId`, `followUpAt`, `followUpOutcome`, `safeguarding` | **sensitive** | structured record per health policy |
| `agriculture_reports` | one field observation per agriculture turn | `interactionId`, `caseId`, `cropType`, `issueType`, `evidenceFileIds[]`, `province`, `territory`, `season`, `growthStage`, `affectedProportion`, `recentInputs`, `aiDiagnosis`, `recommendation`, `confidence`, `urgent`, `candidates[]`, `topProb`, `isNotifiable`, `evidenceQuality`, `missingEvidence[]`, `actionsToAvoid[]`, `tieredActions`, `followUpStatus`, `followUpOutcome` | confidential | 24 months |
| `agri_clusters` | a candidate outbreak signal, never a declaration | `province`, `territory`, `crop`, `issue`, `reportCount`, `windowStart`, `windowEnd`, `status` (unverified, under_review, confirmed, rejected, closed), `validatedBy` | internal | 5 years |
| `education_sessions` | one learning session per education turn | `interactionId`, `userId`, `learnerAgeGroup`, `subject`, `topic`, `difficultyLevel`, `explanation`, `quiz`, `progressSignal`, `province`, `mode`, `objective`, `score`, `steps`, `masterySignal` | confidential (child data → sensitive) | school-year policy |
| `learner_profiles` | the confirmed learner model, one row per learner | `userId` (pk), `ageBand`, `level`, `instructionLanguage`, `explainLanguage`, `schoolOrganisationId`, `examTarget`, `examDate` | sensitive (child identity) | until withdrawal |
| `learning_evidence` | topic-level evidence events, never an ability score | `userId`, `sessionId`, `subject`, `topic`, `objective`, `rubric`, `difficulty`, `assistanceLevel`, `response`, `result`, `misconception`, `modelVersion`, `teacherVerified`, `province`, `territory`; index `learning_evidence_user_idx` | sensitive | school-year policy |

## 10.6 Reference data (public, seeded on every environment)

| Table | Purpose | Key fields | Notes |
|-------|---------|-----------|-------|
| `provinces` | the 26 provinces of the 2015 découpage | `code` (pk), `name` (unique), `capital` | **REFERENCE DATA TO VALIDATE** against the official INS nomenclature |
| `territories` | territoires, villes and communes | `id`, `provinceCode`, `name`, `type`; index `territories_province_idx` | same caveat |
| `service_directory` | referral directory: health centres, hospitals, veterinary posts, extension offices, schools, call centre | `type`, `name`, `province`, `territory`, `healthZone`, `phone`, `notes`, `active`; index `service_directory_geo_idx` | `phone: null` means "no verified number" — the platform then gives directions only |
| `planting_calendars` | sowing windows by province and crop | `province`, `crop`, `sowWindows[]`, `notes`, `source`, `version` | |
| `market_prices` | dated, sourced market observations | `market`, `commodity`, `unit`, `priceCdf`, `grade`, `source`, `observedAt`; index `market_prices_commodity_idx` | never a live offer |
| `input_registry` | the authorised agricultural input registry — the chemical guard | `name`, `activeIngredient`, `category`, `targetCrops[]`, `targetIssues[]`, `authorisationStatus`, `labelInstructions`, `ppe`, `preHarvestIntervalDays`, `reEntryHours`, `source` | only `authorised` entries may ever be recommended |
| `stories` | the read-aloud library | `language`, `title`, `level`, `body`, `licence` | original, programme-licensed |
| `notification_templates` | the five-language template catalogue | `key`, `channel`, `language`, `module`, `riskLevel`, `sensitivity`, `title`, `body`, `version`, `status`, `approvedBy`; index `notification_templates_key_idx` | `sensitive` variants are lock-screen safe |

## 10.7 AI governance

| Table | Purpose | Key fields | Class |
|-------|---------|-----------|-------|
| `protocol_versions` | every clinical decision tree ever used, as immutable JSON | `protocolId`, `version`, `module`, `title`, `definition`, `status`, `approvedBy`, `approvedAt`; index `protocol_versions_idx` | internal |
| `prompt_versions` | versioned system prompts with approval | `name`, `version`, `module`, `body`, `status`, `approvedBy/At`, `createdBy`; index `prompt_versions_idx` | internal (never exposed) |
| `model_configs` | routing policy per task and language | `task`, `language`, `primaryProvider`, `primaryModel`, `fallbackProvider`, `fallbackModel`, `params`, `acuRate`, `isLive` | internal |
| `kb_documents` | approved knowledge with full provenance | `docId` (unique citation key), `module`, `title`, `authority`, `source`, `version`, `language`, `geography`, `effectiveFrom`, `reviewDate`, `evidenceGrade`, `status`, `approvedBy`, `checksum`, `supersedes`, `body`; index `kb_documents_module_idx` | public (approved content) |
| `kb_chunks` | retrieval units | `documentId`, `docId`, `module`, `chunkIndex`, `text`, `language`, `checksum`; index `kb_chunks_doc_idx` | public |
| `evaluation_runs` | gold-set, red-team, protocol-coverage and language-gate results | `suite`, `module`, `language`, `modelVersion`, `promptVersion`, `metrics`, `passed` | internal |

## 10.8 Operations, audit and metering

| Table | Purpose | Key fields | Class | Retention |
|-------|---------|-----------|-------|-----------|
| `audit_logs` | tamper-evident audit trail | `action`, `actorUserId`, `actorRole`, `entityType`, `entityId`, `beforeValue`, `afterValue`, `systemEvent`, `aiSummary`, `ip`, `tenantId`, `traceId`, `purpose`, `prevHash`, `hash`; indexes `audit_created_idx`, `audit_entity_idx` | internal (no free-text personal data) | statutory — survives erasure |
| `event_store` | append-only domain event log | `eventId` (unique), `eventType`, `eventVersion`, `aggregateType/Id/Version`, `tenantId`, `actor`, `traceId`, `correlationId`, `causationId`, `channel`, `language`, `module`, `classification`, `payload`, `occurredAt`, `recordedAt`; indexes `event_store_type_idx`, `event_store_aggregate_idx` | per event `classification` | permanent (payloads pseudonymised at the analytics boundary) |
| `notifications` | every message, before and after dispatch | `userId`, `channel`, `type`, `title`, `body`, `status`, `payload` (delivery trail), `sentAt`, `readAt`, `templateKey`, `language`, `tenantId`, `to`, `attempts`, `scheduledFor`, `deliveredAt`, `acknowledgedAt`, `providerMessageId`, `failureReason`; indexes `notifications_user_idx`, `notifications_scheduled_idx` | confidential | 12 months |
| `schedules` | reminders and timers | `userId`, `caseId`, `kind`, `channel`, `language`, `scheduledFor`, `payload`, `status`, `firedAt`; index `schedules_due_idx` | confidential (sensitive for ANC) | until fired + 90 days |
| `autosave_drafts` | client-side drafts with version history | `userId`, `clientKey`, `module`, `language`, `payload`, `version`; index `autosave_user_key_idx` | confidential | short — abandoned drafts never enter outcome metrics |
| `feedback` | citizen rating of an answer | `interactionId`, `userId`, `rating`, `useful`, `comment` | confidential | 24 months |
| `api_request_logs` | every API request | `method`, `path`, `userId`, `role`, `statusCode`, `durationMs`, `ip`, `error`; index `api_logs_created_idx` | internal | 90 days |
| `ai_usage_logs` | every AI call attempt | `interactionId`, `capability`, `providerKey` (**internal only**), `model`, `inputTokens`, `outputTokens`, `audioSeconds`, `estimatedCostUsd`, `durationMs`, `success` | internal | 24 months |
| `acu_ledger` | the billing ledger | `tenantId`, `organisationId`, `interactionId`, `module`, `language`, `channel`, `task`, `providerKey`, `units`, `acu`, `occurredAt`; indexes `acu_ledger_time_idx`, `acu_ledger_tenant_idx` | internal | 7 years (financial) |
| `admin_config` | live configuration | `key` (pk), `value`, `updatedBy`, `updatedAt` | internal | current + audit history |
| `reports` | report jobs | `type`, `format`, `scope`, `period`, `status`, `requestedBy`, `definitionId`, `storageKey`, `sizeBytes`, `error`, `purpose`, `expiresAt`, `completedAt` | confidential (may contain identifiable extracts) | file 7 days, row 24 months |
| `report_definitions` | scheduled report configuration | `name`, `type`, `format`, `cadence`, `scope`, `organisationId`, `recipients[]`, `enabled`, `lastRunAt`, `createdBy` | internal | contract lifetime |
| `idempotency_keys` | exactly-once acceptance | `key` (pk), `userId`, `requestHash`, `responseStatus`, `responseBody` | internal | 30 days |
| `sync_events` | offline replay ledger | `id` (client UUIDv7, pk), `deviceId`, `userId`, `localSeq`, `clientTimestamp`, `schemaVersion`, `type`, `payload`, `status`, `conflictReason`; index `sync_events_device_idx` | confidential | 90 days |
| `data_requests` | access and erasure requests | `userId`, `type`, `status`, `method`, `legalHold`, `dueAt`, `completedAt`, `evidence` | confidential | statutory |
| `break_glass_access` | time-boxed emergency access grants | `userId`, `justification`, `scope`, `expiresAt`, `revokedAt` | restricted | statutory |

## 10.9 Language learning

| Table | Purpose | Key fields | Class | Retention |
|-------|---------|-----------|-------|-----------|
| `language_corpus` | what the system heard, what it understood, and what a native speaker corrected | `interactionId`, `audioFileId`, `language`, `sourceText`, `translationFr`, `correctedSourceText`, `correctedTranslationFr`, `correctedLanguage`, `province`, `intent`, `module`, `systemConfidence`, `reviewStatus`, `reviewedBy/At`, `citizenFlagged`, `speechRating`; indexes `corpus_lang_status_idx`, `corpus_interaction_idx` | confidential; **the corrected pair is the immutable original plus a version, never an overwrite** | corpus policy; erased text is replaced by `[effacé]` on an erasure request |
| `language_lexicon` | verified local terms with pronunciation hints | `language`, `term`, `meaningFr`, `domain`, `region`, `pronunciation`, `verified`, `addedBy`, `usageCount`; index `lexicon_lang_term_idx` | public (linguistic asset) | permanent |

## 10.10 Schema rules

1. Every citizen-touching row carries **timestamp, actor, role, language, module, channel and geography where available** (`FR-AS-05`).
2. Nothing is deleted to correct it: corrections are new rows or versioned columns; duplicates are merged with a tombstone; erasure blanks free text and keeps the analytic skeleton.
3. `cases.version` and `interactions.version` support optimistic concurrency; every conflicting write returns 409.
4. Money and cost columns are `real`/`numeric` for reporting only; the ledger is the source of truth.
5. `[DECISION REQUIRED]` health-zone and health-area reference tables (PRD 1 §10) are not yet modelled: `health_triage_records.healthZone` is a free-text column. Promoting health zones to a reference table with foreign keys is **Planned (Phase 3)** and is a prerequisite for health-zone-level k-anonymity.

---

# 11. API Specification

## 11.1 Conventions

| Aspect | Rule |
|--------|------|
| Transport | HTTPS only, JSON UTF-8, or `multipart/form-data` for media |
| Version | everything under `/api/v1`; channel webhooks under `/api/hooks` |
| Authentication | signed session cookie `cvai_session` (HttpOnly, SameSite=Lax, Secure in production) **or** `Authorization: Bearer <token>` returned by login. Webhooks: provider signature. Cron: `x-cron-secret`. |
| Authorisation | one `Permission` per route, checked in `handle()` against `ROLE_PERMISSIONS`; field roles additionally module-scoped |
| Rate limits | `default` 120 req/min, `ai` 30 req/min, per user or IP, sliding window; `none` for streaming and autosave |
| Idempotency | `Idempotency-Key` on turn submission and offline replay; the stored response is returned verbatim on a replay |
| Errors | `{ "error": { "code", "message", "details"? } }` with codes `bad_request` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `rate_limited` (429), `internal_error` (500) |
| Channel errors | session, turn and sync routes additionally use the PRD contract: `{ code, message_key, safe_localised_message, retryable, fields[], request_id }` with `CONSENT_REQUIRED`, `MEDIA_QUALITY_LOW`, `LANGUAGE_UNSUPPORTED`, `CLARIFICATION_REQUIRED`, `SAFETY_ESCALATION_CREATED`, `STATE_CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `POLICY_BLOCKED`, `NOT_FOUND`, `VALIDATION_FAILED`, `UNAUTHORISED`, `INTERNAL_ERROR` |
| Never returned | provider names, model names, prompts, secrets, SQL, stack traces |
| Logging | every request lands in `api_request_logs`; a `X-Request-Id` header is echoed on channel routes |
| Pagination | `limit` (default 50, max 200) and `offset`; cursor pagination is **Planned (Phase 4)** |
| OpenAPI 3.1 publication | **Planned (Phase 4)** |

## 11.2 Route catalogue

### Authentication and profile

| Method and path | Permission | Purpose |
|-----------------|-----------|---------|
| `POST /api/v1/auth/login` | public | `{phone, pin}` or `{anonymous:true, language, province?, consent}` → `{user, token}` + cookie |
| `POST /api/v1/auth/logout` | public | clears the cookie |
| `GET /api/v1/auth/me` · `PATCH /api/v1/auth/me` | session | profile, language, province, preferences |
| `GET /api/v1/auth/mfa/setup` · `POST /api/v1/auth/mfa/setup` | session | TOTP status; begin enrolment (returns secret and `otpauth://` URI) |
| `POST /api/v1/auth/mfa/verify` | session, `ai` limit | verify a six-digit code; completes enrolment and refreshes the step-up window |

```http
POST /api/v1/auth/login
{ "anonymous": true, "language": "ln", "province": "Kinshasa", "consent": true }

200 { "user": { "id": "…", "role": "citizen", "language": "ln", "anonymous": true }, "token": "…" }
```

### Interactions (the single-turn API)

| Method and path | Permission | Limit |
|-----------------|-----------|-------|
| `POST /api/v1/interactions` | `interaction:create` | `ai` |
| `GET /api/v1/interactions?module=&scope=all&limit=&offset=` | `interaction:read_own` (`interaction:read_all` for `scope=all`) | default |
| `GET /api/v1/interactions/{id}` | `interaction:read_own` | default |
| `POST /api/v1/interactions/{id}/feedback` | `feedback:create` | default |

```http
POST /api/v1/interactions        (JSON form)
{ "text": "Mon enfant de 2 ans a de la fièvre et il ne peut pas boire", "module": "health", "wantsAudio": true }

200 {
  "interactionId": "…", "status": "completed", "module": "health",
  "language": "fr", "languageConfidence": 0.95,
  "transcript": "Mon enfant de 2 ans a de la fièvre et il ne peut pas boire",
  "intent": "fever_child",
  "answer": {
    "asking": "…",
    "understanding": "…",
    "risk": { "level": "critical", "score": 0.95, "flags": ["danger:ne peut pas boire", "protocole:niveau_4"] },
    "action": "Partez maintenant vers le centre de santé le plus proche … Sources : child_fever_u5@1.0.0, KB-HE-FEVER-01.",
    "escalation": { "required": true, "to": "agent de santé communautaire", "reason": "Signes de danger : orientation immédiate vers un centre de santé" },
    "confidence": { "score": 0.72, "low": false },
    "summary": "[santé] fever child — risque critical, escaladé. …"
  },
  "answerLocalised": { "…": "same shape, rendered in the citizen's language" },
  "responseText": "…", "followUpQuestions": [], "caseId": "…",
  "audioUrl": "/api/v1/files/…", "audioAvailable": true, "latencyMs": 812
}
```

Multipart form fields: `text`, `module`, `province`, `wantsAudio`, `audio` (one file, audio/* or video/*), `images` (repeatable, image/* or video/*).

### Sessions (the channel-agnostic conversation API)

| Method and path | Permission | Notes |
|-----------------|-----------|-------|
| `POST /api/v1/sessions` | `interaction:create` | creates a session, negotiates capabilities, returns consent requirements |
| `GET /api/v1/sessions/{id}` | `interaction:create` | session state, capabilities, turn count |
| `POST /api/v1/sessions/{id}/resume` | `interaction:create` | resumes within 24 h with the "where we left off" summary |
| `POST /api/v1/sessions/{id}/turns` | `interaction:create`, `ai` limit | one turn; JSON or multipart; `Idempotency-Key` honoured |
| `GET /api/v1/sessions/{id}/stream` | `interaction:create`, no limit | server-sent events: processing stage updates |
| `GET /api/v1/workflows/{id}` | `interaction:create`, no limit | canonical processing status: `received → transcribing → understanding → reasoning → composing → completed | failed` |

```http
POST /api/v1/sessions/{id}/turns
Idempotency-Key: 018f3b2c-...-7a
Content-Type: multipart/form-data
input_kind=voice; audio=<voice-note.ogg>; lang_hint=sw

200 {
  "session_id": "…", "seq": 3, "status": "completed", "interaction_id": "…",
  "language": "sw", "module": "health",
  "text": "<first ~25 s chunk>", "full_text": "<complete answer>",
  "has_more": true, "continuation_prompt": "Je continue ?",
  "follow_up_questions": ["…"], "audio_url": "/api/v1/files/…",
  "case_id": "…", "emergency": false, "escalated": true, "low_confidence": false,
  "notice": { "code": "SAFETY_ESCALATION_CREATED", "message_key": "channel.error.safety_escalation_created",
              "safe_localised_message": "Mhudumu amearifiwa na atakupigia simu…", "retryable": false,
              "fields": [], "request_id": "…" },
  "replayed": false, "request_id": "…"
}
```

### Media

| Method and path | Permission | Purpose |
|-----------------|-----------|---------|
| `POST /api/v1/files` | `interaction:create` | multipart `files[]` upload |
| `GET /api/v1/files/{id}` | owner or `case:read` | secure download; telephony fetches use a separately signed short-lived URL |
| `POST /api/v1/media/uploads` | `interaction:create` | resumable upload: `{action:"init", mimeType, sizeBytes, sha256?, fileName?}` → `{upload_id, chunkSize, …}`; `{action:"complete", upload_id, sha256?}` → `{fileId}` with checksum verification |
| `PUT /api/v1/media/uploads` | `interaction:create`, no limit | one chunk with `Content-Range` |

### Speech

`POST /api/v1/tts` — `{text, language}` → audio bytes, or `204 No Content` meaning "use on-device synthesis". Permission `interaction:create`, `ai` limit.

### Cases, tasks and queues

| Method and path | Permission |
|-----------------|-----------|
| `GET /api/v1/cases?status=&module=&severity=&mine=1&limit=` · `POST /api/v1/cases` | `case:read` / `case:write` |
| `GET /api/v1/cases/{id}` · `PATCH /api/v1/cases/{id}` | `case:read` / `case:write` |
| `GET /api/v1/cases/{id}/transitions` · `POST /api/v1/cases/{id}/transitions` | `case:read` / `case:write` |
| `GET /api/v1/cases/{id}/assignments` · `POST /api/v1/cases/{id}/assignments` | `case:read` / `case:assign` |
| `POST /api/v1/cases/{id}/acknowledge` | `case:write` |
| `POST /api/v1/cases/{id}/escalate` | `case:escalate` |
| `GET/POST /api/v1/cases/{id}/risk-overrides` | `case:read` / `case:write` **+ step-up MFA** |
| `GET/POST /api/v1/cases/{id}/notes` · `/follow-ups` | `case:read` / `case:write` |
| `POST /api/v1/cases/{id}/merge` | `case:write` |
| `GET /api/v1/tasks` · `POST /api/v1/tasks` · `GET/PATCH /api/v1/tasks/{id}` | `case:read` / `case:write` |
| `GET /api/v1/queues?module=&province=` | `case:read` |

```http
GET /api/v1/cases/{id}/transitions
200 { "status": "assigned",
      "transitions": [ { "to": "acknowledged", "label": "Accusé de réception", "slaEffect": "stop", "reasonRequired": false },
                       { "to": "reassigned",  "label": "Réattribution",       "slaEffect": "keep", "reasonRequired": true } ] }

POST /api/v1/cases/{id}/risk-overrides
{ "severityLevel": 2, "reason": "Enfant examiné par téléphone, aucun signe de danger", "reasonCode": "clinical_review" }
200 { "case": { "severityLevel": 2, "overrideReason": "…", "aiSeverityLevel": 4 }, "override": { "id": "…" } }
403 { "error": { "code": "forbidden", "message": "Vérification de sécurité requise : saisissez votre code à 6 chiffres." } }
```

### Notifications, reminders, autosave, feedback

`GET /api/v1/notifications?unread=1` · `PATCH /api/v1/notifications/{id}` · `POST /api/v1/notifications/{id}/ack` · `GET/POST /api/v1/notifications/broadcast` (audience estimate then approved send) · `GET/POST/DELETE /api/v1/reminders[/{id}]` · `PUT/GET /api/v1/autosave` · `POST /api/v1/feedback`.

### Analytics and reports

`GET /api/v1/analytics/dashboard` (`dashboard:gov`) · `/analytics/activity` and `/analytics/alerts` (`case:read`) · `/analytics/insight` (`dashboard:gov`) · `/analytics/module/{health|agriculture|education}` (per-module dashboard permission) · `GET /api/v1/reports/{type}?days=30` CSV (`report:export`) · `GET/POST /api/v1/report-jobs`, `GET /report-jobs/{id}`, `GET /report-jobs/{id}/download` · `GET/POST /api/v1/report-definitions`, `PATCH/DELETE /report-definitions/{id}` · `GET /api/v1/metering/acu?scope=&period=`.

### Knowledge, protocols and domain reference

`GET /api/v1/knowledge/search?module=&q=` (session, `ai` limit) · `GET /api/v1/health/protocols`, `/health/vaccination-schedule`, `/health/facilities` · `GET /api/v1/agriculture/{prices,calendar,weather,registry}`, `POST /agriculture/prices/upload`, `GET/POST/PATCH /agriculture/clusters` · `GET/PUT /api/v1/education/profile`, `POST /education/quiz`, `POST /education/quiz/{id}/answer`, `GET /education/stories`, `POST /education/lessons`, `GET /education/evidence`, `POST /education/plan`.

### Language learning

`GET /api/v1/language/samples?language=&limit=` · `PATCH /api/v1/language/samples/{id}` (verify, correct, reject, add lexicon entries) · `GET/POST /api/v1/language/lexicon` · `GET /api/v1/language/proficiency` · `GET /api/v1/language/export?language=` (JSONL, audited).

### Consent and privacy

`GET/POST /api/v1/consents` · `GET/POST /api/v1/data-requests` · `GET/PATCH /api/v1/data-requests/{id}`.

### Administration

`GET /api/v1/admin/status` (provider chains by internal key) · `GET /api/v1/admin/stats` · `GET/PUT /api/v1/admin/config` · `POST /api/v1/admin/seed` · `GET/POST /api/v1/admin/kb` · `GET/POST /api/v1/admin/protocols`, `GET/PATCH /admin/protocols/{id}` · `GET/POST /api/v1/admin/tenants`, `GET/PATCH /admin/tenants/{id}` · `GET/POST /api/v1/admin/organisations`, `GET/PATCH /admin/organisations/{id}` · `GET/POST /api/v1/admin/templates`, `PATCH/DELETE /admin/templates/{id}` · `GET/POST /api/v1/admin/break-glass` · `GET /api/v1/users`, `POST /api/v1/users` · `GET /api/v1/audit-logs?action=&entityType=&entityId=`.

### System and synchronisation

`GET /api/v1/system/health` (public probe) · `POST /api/v1/workflow/run` (`x-cron-secret` or `admin:config`) · `POST /api/v1/sync/events`.

```http
POST /api/v1/sync/events
{ "deviceId": "pixel-4a-…", "events": [
    { "id": "018f…", "localSeq": 12, "clientTimestamp": "2026-09-06T08:12:04Z",
      "schemaVersion": 1, "type": "draft.upsert",
      "payload": { "clientKey": "case-note-…", "payload": { "text": "…" } } } ] }

200 { "results": [ { "id": "018f…", "status": "applied" } ], "request_id": "…" }
```

Conflict policy: `append_only` for `observation.*`, `turn.*`, `interaction.*`, `telemetry.*`; `server_authoritative` for `risk.*`, `severity.*`, `case.*`, `escalation.*`, `consent.*` (stored as `conflict`, never applied); `last_write_wins` on the client timestamp for drafts and preferences; a repeated event id returns `duplicate`.

## 11.3 Channel webhooks

| Endpoint | Verification | Behaviour |
|----------|--------------|-----------|
| `GET /api/hooks/whatsapp` | `WHATSAPP_VERIFY_TOKEN` challenge | subscription verification |
| `POST /api/hooks/whatsapp` | `X-Hub-Signature-256` HMAC over the raw body | text, voice notes, images, short videos, button and list replies; answers with text plus a voice note when synthesis is available; buttons (≤ 3) and lists (≤ 10) for confirmations; templates outside the 24 h window; `STOP`/`ARRÊT`/`TIKA` opt-out |
| `POST /api/hooks/ivr/twilio` | `X-Twilio-Signature` | rotating five-language greeting within 6 s, DTMF fallback, open question routing |
| `POST /api/hooks/ivr/twilio/gather` | same | keypad and speech capture |
| `POST /api/hooks/ivr/twilio/recording` | same | recording fetch, transcription, spoken reply in ≤ 25 s chunks |
| `POST /api/hooks/ivr/twilio/continue` | same | next chunk on request |
| `GET /api/hooks/ivr/twilio/media/{id}` | expiring HMAC in the URL | lets the telephony provider fetch synthesised audio anonymously |
| `POST /api/hooks/ussd` | operator form post | `CON`/`END`, two-level menu, answer sent by SMS in the background |
| `POST /api/hooks/sms` | operator form post | inbound SMS turn, opt-out handling |
| `POST /api/hooks/sms/dlr` | operator form post | delivery report matched to `notifications.providerMessageId` |

## 11.4 Event catalogue

Emitted through `emitEvent()` into `event_store` with the full envelope. Names follow `<aggregate>.<event>`; the `cvos.` prefix is used by the channel layer, matching PRD 1 §11 topic naming.

| Event | Producer | Payload highlights |
|-------|----------|--------------------|
| `cvos.session.started` / `.resumed` / `.abandoned` | channel session service | capabilities, turn count |
| `cvos.session.turn.received` / `.turn.completed` | channel session service | seq, media flags, interaction id, case id, escalated, latency, chunks |
| `cvos.safety.emergency_shortcircuit` | channel session service | matched danger flags (classification `sensitive`) |
| `cvos.consent.revoked` | channel session service | reason (`opt_out_keyword`) |
| `cvos.sync.batch_accepted` | sync route | count, accepted, conflicts |
| `ai.contract.violation` | health agent, orchestrator | rule (`AI-04`, `HEA-001`), reason, protocol id and version, claimed citations |
| `ai.override.recorded` | workflow agent | field, AI value, human value, reason |
| `case.created` / `.assigned` / `.reassigned` / `.acknowledged` / `.status.changed` / `.escalated` / `.closed` / `.merged` / `.note.added` | workflow agent | status, severity level, queue, SLA due, routing tier, outcome |
| `case.sla.breached` | scheduler sweep | severity level, overdue minutes, queue, assignee |
| `case.followup.scheduled` / `.captured` | workflow agent | follow-up id, outcome |
| `task.created` / `.acknowledged` / `.completed` | workflow agent | case id, type, due |
| `agri.notifiable.detected` / `agri.zoonotic.flagged` | agriculture agent | notifiable matches, province, territory, crop |
| `agri.cluster.detected` / `.validated` | cluster agent | issue, crop, geography, report count, window, transition |
| `notification.queued` / `.sent` / `.failed` / `.suppressed` / `.acknowledged` | notification engine | channel, channel used, attempts, failure reason, suppression reason |
| `reminder.vaccination.scheduled` / `reminder.anc.scheduled` / `reminder.cancelled` / `reminder.suppressed` | scheduler | dose or contact count, suppression reason |
| `acu.cap.threshold_reached` | metering | threshold, percentage, ACU, cap |
| `privacy.request.access` / `.erasure` / `privacy.erasure.executed` | privacy module | due date, tombstone token, files deleted |
| `audit.chain.broken` | scheduler | date, broken index and reason (classification `restricted`) |
| `scheduler.run.completed` | scheduler | every step's result and the error count |

Planned event families (PRD 2 §13.4, Phase 3/4): `transcription.completed`, `risk.assessed`, `knowledge.published`, `model.execution.completed`, `safeguarding.created`, `analytics.signal_changed`. The envelope already supports them; only the emission points are missing.

## 11.5 Internal contracts

`FinalAnswer` (the seven-part answer) · `HealthTriageContract` (the machine-readable triage output) · `AgricultureFieldAssessment` · `EducationTeachingSession`, `EducationQuizSet`, `EducationRevisionPlan`, `EducationParentSummary` · `LanguageAnalysis`, `Localisation` · `RiskResult` · `TurnResult`. All in `src/server/ai/schemas.ts` and `src/server/channels/session.ts`, validated with zod at the boundary of every model call. `domain_result.citations` and `model_route` are omitted from citizen-facing payloads (`SEC-08`).
