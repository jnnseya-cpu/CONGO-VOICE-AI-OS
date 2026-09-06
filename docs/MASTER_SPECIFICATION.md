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
| **Channels** | Voice call (IVR), WhatsApp, USSD, SMS, PWA, assisted console — one citizen identity across all | `src/lib/channels/**`, `src/app/api/hooks/**`, `src/app/api/v1/sessions/**` |
| **Language** | Language ID, code-switch handling, speech-to-text, French pivot, translation, simplification, text-to-speech, continuous learning from every conversation | `src/lib/ai/agents/language.ts`, `src/lib/ai/agents/learning.ts`, `src/lib/ai/gateway.ts` |
| **Agents** | Language, Health, Agriculture, Education, Risk, Workflow, Reporting, Personalisation, Learning — orchestrated **deterministically**, not by an autonomous planner | `src/lib/ai/agents/**` |
| **Cases and workflow** | Escalation to community health workers, extension officers and teachers; queues, SLA clocks, assignment, overrides, follow-ups, merges | `src/lib/ai/agents/workflow.ts`, `src/app/api/v1/cases/**` |
| **Intelligence** | Regional trends, outbreak and pest early warning, learning gaps, government and NGO dashboards, ACU cost metering, governed reporting | `src/lib/ai/agents/reporting.ts`, `src/lib/ai/agents/clusters.ts`, `src/lib/reports/**`, `src/lib/core/metering.ts` |

## 1.2 The core loop

The citizen speaks → the system detects the language → transcribes → understands the intent → asks the minimum safe follow-up questions → gives a practical answer → saves everything → escalates when required → sends reminders and follow-ups.

Implemented end to end in `runInteraction()` (`src/lib/ai/agents/orchestrator.ts`), called identically by every channel through `runTurn()` (`src/lib/channels/session.ts`). Proven by `tests/pipeline.test.ts` and `tests/channels-session.test.ts`.

## 1.3 The seven-part answer contract

Every answer, in every module and on every channel, states:

1. **what the citizen is asking** (`asking`)
2. **what the system understood** (`understanding`, including assumptions)
3. **what risk exists** (`risk.level`, `risk.score`, `risk.flags`)
4. **what action is recommended** (`action`, low-cost or no-cost first)
5. **whether escalation is required, to whom and why** (`escalation.required | to | reason`)
6. **the confidence** (`confidence.score`, `confidence.low`)
7. **the saved interaction summary** (`summary`)

Contract: `FinalAnswer` in `src/lib/ai/schemas.ts`, validated with zod, persisted on `interactions.structured`. **Implemented.**

## 1.4 Non-negotiables

| Rule | Enforcement in code |
|------|--------------------|
| The platform never diagnoses, never prescribes, never gives a dose outside approved protocol text | `sanitiseHealthGuidance()` in `src/lib/ai/safety.ts`; forbidden-output regular expressions; `tests/health-triage.test.ts` |
| Severity is decided by a versioned decision tree, never by a model | `runProtocol()` in `src/lib/ai/protocols/engine.ts`; `tests/health-protocols.test.ts` |
| Danger-sign detection works with every AI provider switched off | `detectDangerSigns()` / `DANGER_SIGN_KEYWORDS` in `src/lib/ai/safety.ts`; offline provider in `src/lib/ai/providers/mock.ts` |
| A health or agriculture recommendation without an approved citation is replaced by a scripted fallback | citation enforcement in `src/lib/ai/agents/health.ts` §7 and `scoreRisk()` in `src/lib/ai/agents/risk.ts` |
| The risk agent may raise severity, never lower it | `scoreRisk()` — "raise only" rule, `tests/health-triage.test.ts` |
| A safeguarding disclosure enters a restricted pathway and never appears in ordinary notifications | `detectSafeguarding()`, `safeguarding_records`, `SAFEGUARDING_NOTIFICATION_BODY` |
| Everything is saved: input, transcript, translation, answer, risk, escalation, override, notification, draft, failure | write-ahead autosave in the orchestrator; `event_store`; `audit_logs` hash chain |
| No provider name, model name, prompt or key ever reaches a client | `src/lib/ai/gateway.ts` is the only vendor-aware module; `ai_usage_logs.providerKey` is internal |
| The citizen is never charged, metered against, or refused service for cost reasons; only *non-emergency* AI degrades at a funding cap | `isDegradedMode()` in `src/lib/core/metering.ts`, consumed by the orchestrator |

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
| 2G/EDGE common, 3G/4G patchy | Compressed audio, resumable chunked upload, offline queue, background sync | `POST /api/v1/media/uploads`, `src/lib/channels/offline-queue.ts` |
| Intermittent electricity | Sessions resumable for 24 h; no long forced sessions; short answers | `findResumableSession()`, `RESUME_WINDOW_MS`, `chunkForSpeech()` |
| Low literacy, low digital confidence | Voice is the primary I/O; menus never deeper than two levels; no jargon | `COMMON_QUESTIONS` (`src/lib/channels/menus.ts`), `ModulePage`/`VoiceConsole` |
| Code-switching is the norm | Token-level language tags, French pivot, no forced language choice | `LanguageAnalysis.mixedLanguages`, `interactions.transcriptTags` |
| Shared phones in households | Identity ≠ phone number; lightweight per-session confirmation; anonymous mode | `identifyCitizen()`, `shouldConfirmSharedPhone()`, `sessions.proxy` |
| Trust in institutions varies | The system identifies itself, states what it is not, and offers a human path one utterance away | `DISCLAIMERS` in `src/lib/ai/safety.ts`; `shouldAutoCreateCase({humanRequested})` |
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
- charge, meter, rank or profile a citizen commercially — CVOS carries **no citizen wallet, no citizen payment, no advertising and no commercial persuasion** (`scrubCommercial()` in `src/lib/ai/education/child-safety.ts` removes it even from a model answer);
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

Roles are the `user_role` enum (`src/lib/db/schema.ts`); permissions are the `Permission` union and `ROLE_PERMISSIONS` map (`src/lib/core/rbac.ts`). Field roles are additionally **module-scoped** by `ROLE_MODULE_SCOPE`, so a CHW cannot open an agriculture case.

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
| **Ministry of Education (EPST)** | curriculum authority: programme national, TENAFEP and Examen d'État objectives | `src/lib/ai/education/curriculum.ts` | Implemented (map to validate) |
| **FDSU / funding tenant** | pays the institutional licence and ACU consumption; owns the programme | `tenants` (cap, entitlements), `GET /api/v1/metering/acu`, `monthlyStatement()` | Implemented |
| **NGOs and implementing partners** | operate organisations and queues under a tenant | `organisations` (province/territory scope, routing skills) | Implemented |
| **MNOs and aggregators** (Africa's Talking, Vodacom, Airtel, Orange) | short code, toll-free/reverse billing, USSD, SMS, delivery reports | `src/lib/channels/sms.ts`, `/api/hooks/ussd`, `/api/hooks/sms/dlr` | Implemented in code; commercial arrangement is programme risk **R-03** |
| **Twilio (or MNO SIP trunk)** | programmable voice for IVR | `/api/hooks/ivr/twilio/**`, signature validation in `src/lib/channels/twilio.ts` | Implemented |
| **Meta / WhatsApp Business Cloud API** | rich channel: voice notes, images, buttons, lists, templates | `/api/hooks/whatsapp`, `src/lib/channels/whatsapp.ts` | Implemented; template approval is a Phase 0 dependency (**R-04**) |
| **AI providers** (Claude, Gemini, OpenAI, Google TTS) | capabilities, never identities: reasoning, vision, STT, TTS | `src/lib/ai/gateway.ts` only; internal keys `anthropic`/`gemini`/`openai`/`google_tts`/`mock` | Implemented with failover and an offline rules provider |
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
| **Chief of Staff** | Workflow agent + scheduler (`src/lib/ai/agents/workflow.ts`, `src/lib/core/scheduler.ts`) | "here is your queue, ordered by clock; this breaches in 20 minutes; this citizen must be called back today" |
| **Analyst** | Reporting agent (`commandStats`, `moduleDashboard`, `insightOfTheDay`) + report engine | "demand for fever guidance rose 34 % in two provinces this week; here is the recommendation and the basis" |
| **Research** | Knowledge retrieval (`src/lib/ai/knowledge/index.ts`) + `/ressources` | "this answer cites KB-HE-FEVER-01 v1.0, authority PCIME/OMS — open the document" |
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

**Implemented choice: PRD 2's position, in TypeScript.** `runInteraction()` (`src/lib/ai/agents/orchestrator.ts`) is a linear, deterministic pipeline; each stage writes its result to the `interactions` row before the next one starts (write-ahead autosave), so a dropped call or a crashed provider still leaves a complete trace. Resumability is delivered by session state (`sessions.state`) and idempotency keys rather than by graph checkpoints. LangGraph remains available as a Phase 3 option if a genuinely branching planner is ever needed; nothing in the contract would change, because agents already communicate through typed schemas.

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
| 1 | Language | domain | `src/lib/ai/agents/language.ts` | Implemented |
| 2 | Health | domain | `src/lib/ai/agents/health.ts` + `src/lib/ai/protocols/**` | Implemented |
| 3 | Agriculture | domain | `src/lib/ai/agents/agriculture.ts` + `src/lib/ai/tools/**` | Implemented |
| 4 | Education | domain | `src/lib/ai/agents/education.ts` + `src/lib/ai/education/**` | Implemented |
| 5 | Risk / Policy | deterministic | `src/lib/ai/agents/risk.ts` | Implemented |
| 6 | Workflow | deterministic | `src/lib/ai/agents/workflow.ts` | Implemented |
| 7 | Reporting | analytical | `src/lib/ai/agents/reporting.ts`, `src/lib/reports/**` | Implemented |
| 8 | Personalisation | domain | `src/lib/ai/agents/personalisation.ts` | Implemented |
| 9 | Learning (language) | domain | `src/lib/ai/agents/learning.ts` | Implemented |
| 10 | Onboarding | conversational | `src/lib/channels/session.ts`, `/api/v1/consents` | Partial |
| 11 | Compliance and Consent | deterministic | `src/lib/core/privacy.ts`, `consents`, `data_requests` | Implemented |
| 12 | Fraud / Anomaly | deterministic | rate limits, idempotency, signature verification, dedupe | Partial |
| 13 | Payment / Disbursement | integration | — | Planned (Phase 4/5), §7 |
| 14 | API Integration | integration | `src/lib/ai/tools/**`, `src/lib/channels/**` | Partial |
| 15 | Predictive Intelligence | analytical | `src/lib/ai/agents/clusters.ts`, `importantAlerts()` | Partial |
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

**Protocol set (`src/lib/ai/protocols/definitions/`)** — ten approved decision trees, each with per-language question phrasing, red flags, severity rules, five outcomes and citations: `child_fever_u5`, `adult_fever`, `cough_breathing`, `diarrhoea_dehydration`, `pregnancy_danger_signs`, `newborn_danger_signs`, `injury_bleeding`, `malnutrition_screening`, `vaccination_schedule`, `general_symptom_intake`. Coverage is enforced by `tests/health-protocols.test.ts`: every question reachable, every branch taken, every red flag reaching severity 4, every severity rule firing, globally unique rule identifiers.

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
| Request flooding | sliding-window rate limiter per user or IP, `default` 120/min and `ai` 30/min (`src/lib/core/rate-limit.ts`) |
| Replay and duplicate submission | `Idempotency-Key` with stored responses, request-hash conflict detection (`src/lib/core/idempotency.ts`); WhatsApp message ids processed once |
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
