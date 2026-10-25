# 03 — Complete User Ecosystem

Every actor that touches the AI-OS, what they can see, what they can do, and
what they are accountable for. Where the generic brief asked for "merchants",
"customers" and "third-party payment partners", those actors **do not exist in
this platform** — there is no commerce in it. They are replaced by the actors
that genuinely exist in a national public-service deployment.

---

## 3.1 The actor map

```
                        ┌──────────────────────────┐
                        │  SOVEREIGN TENANT OWNER  │  (a State)
                        │  owns residency, protocols│
                        └────────────┬─────────────┘
                                     │ provisions
      ┌──────────────────────────────┼──────────────────────────────┐
      │                              │                              │
┌─────▼──────┐              ┌────────▼────────┐            ┌────────▼────────┐
│ PLATFORM   │              │  GOVERNMENT     │            │  CLINICAL /     │
│ OPERATOR   │              │  ADMINISTRATOR  │            │  CURRICULUM     │
│ platform_  │              │  gov_admin      │            │  REVIEW BOARD   │
│ admin      │              └────────┬────────┘            └────────┬────────┘
└─────┬──────┘                       │ directs                     │ signs
      │ runs                         │                             │
      │                   ┌──────────┴──────────┐                  │
      │                   │  PARTNER ORGANISATION│                 │
      │                   │  ngo                 │                 │
      │                   └──────────┬──────────┘                  │
      │                              │ employs                     │
      │              ┌───────────────┼───────────────┐             │
      │              │               │               │             │
      │        ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼─────┐        │
      │        │ CHW       │  │ AGRI        │  │ TEACHER  │◄───────┘
      │        │ chw       │  │ OFFICER     │  │ teacher  │  protocols
      │        └─────┬─────┘  └──────┬──────┘  └────┬─────┘  & curriculum
      │              │               │              │
      │              └───────────────┼──────────────┘
      │                              │ serves
      │                      ┌───────▼────────┐
      └─────────────────────►│    CITIZEN     │◄──── IVR · USSD · SMS
                             │    citizen     │      WhatsApp · PWA
                             └────────────────┘
```

Non-human and external actors sit alongside: **telecom operators** (inbound
webhooks), **AI providers** (gateway), **integrators/developers** (API), and
**regulators and auditors** (read-only evidence access).

---

## 3.2 Actor specifications

### A. Citizen — `citizen` — EXISTS

The person the platform exists for. Never charged, never identified beyond what
they volunteer, never required to have an account.

| Dimension | Specification |
|---|---|
| Entry | IVR call, USSD `*XXX#`, SMS, WhatsApp, PWA — all five live |
| Identity | Anonymous session by default (`/api/v1/auth/login {anonymous:true}`). Phone number only if they register, stored as AES-256-GCM ciphertext with a keyed blind index (`core/phone.ts`) |
| Permissions (5) | `interaction:create`, `interaction:read_own`, `feedback:create`, `notification:read_own`, `autosave:write` |
| Sees | Own interactions, own transcripts, own follow-ups, own notifications, own learner profile |
| Cannot see | Any other citizen, any case internals, any aggregate |
| Rights | Export own data, delete own account (`/api/v1/me/delete`), withdraw consent (`consents`), refuse recording |
| Obligations | None. The service has no terms a citizen can breach that cost them access, other than abuse rate limits |
| Key tables | `users`, `interactions`, `sessions`, `feedback`, `consents`, `learner_profiles`, `notifications` |
| Command centre | §04.2 — "Mon espace" |

**Citizen sub-personas**, each a real design constraint:

| Persona | Constraint | Platform response |
|---|---|---|
| Non-literate rural woman, 2G feature phone | Cannot read, cannot type, may not speak French | IVR in Lingala/Kikongo/Swahili/Tshiluba with spoken answers (`ai/language/voice.ts`) |
| Farmer with a camera phone, intermittent data | Needs a photo analysed | WhatsApp image → vision pipeline with quality pre-check (`ai/tools/image-quality.ts`) |
| Secondary pupil, shared handset | Child-safety and privacy on a device others use | `ai/education/child-safety.ts`; signed-out cache purge (`sw-source.js` `cvos-signed-out`) |
| Urban user with a smartphone | Expects app quality | PWA with offline outbox and background sync |
| Caller in an emergency | Seconds matter, panic degrades speech | Deterministic danger-sign routing before any model call; emergency script; severity 4 → human alert |

### B. Community Health Worker — `chw` — EXISTS

| Dimension | Specification |
|---|---|
| Permissions (12) | Citizen set + `case:read`, `case:write`, `case:escalate`, `case:assign`, `language:review`, `review:read`, `review:sign`, `dashboard:health` |
| Module scope | `health` only (`ROLE_MODULE_SCOPE`) |
| Sees | Health cases in scope, triage records, risk assessments, follow-ups, their own queue and SLA clocks |
| **Open gap** | Reads are module-scoped but **not territory-scoped** (G-08). A CHW in Kinshasa can read a health case in Haut-Katanga. §11.3 specifies the fix and §17 records it as an open decision |
| Does | Acknowledges, triages, escalates, assigns, calls the citizen through a bridged call that never exposes the citizen's number (`channels/outbound-call.ts`), overrides a risk score with a recorded reason (`ai_overrides`) |
| Accountable for | Clinical action on escalated cases; every override carries their identity |
| Command centre | §04.3 |

### C. Agricultural Officer — `agri_officer` — EXISTS

Same shape, `agriculture` scope, `dashboard:agri`. Works `agriculture_reports`,
`agri_clusters`, `planting_calendars`, `input_registry`, `market_prices`.
Distinctive duty: confirming or rejecting a **cluster hypothesis** — several
reports in one territory that may be one outbreak.

### D. Teacher / Education Officer — `teacher` — EXISTS

`education` scope, `dashboard:edu`. Works `education_sessions`,
`learner_profiles`, `learning_evidence`, `stories`. Distinctive duty:
**safeguarding**. A disclosure by a child routes to `safeguarding_records` and
to a named human, never to an automated reply.

### E. Partner Organisation — `ngo` — EXISTS

| Dimension | Specification |
|---|---|
| Permissions (14) | Citizen set + `case:read`, all four dashboards, `report:export`, `language:review`, `language:export`, `review:read`, `review:sign` |
| Notably lacks | `case:write`, `case:escalate`, `case:assign` — a partner observes and reports; it does not act on a citizen's case |
| Sees | Aggregates across modules, exportable reports, language corpus for review |
| **Open gap** | Any `report:export` holder can download another organisation's finished report (G-09). Content is aggregated and small-count suppressed, so this is a tenancy gap, not personal-data disclosure. §11.3 |
| Command centre | §04.6 |

### F. Government Administrator — `gov_admin` — EXISTS

| Dimension | Specification |
|---|---|
| Permissions (18) | Field-officer set + `interaction:read_all`, all four dashboards, `report:export`, `audit:read`, `notification:broadcast`, `language:export`, `review:submit` |
| Notably lacks | `admin:config`, `user:manage`, `dashboard:admin` — **a minister cannot change a threshold or hold a vendor key.** This separation is deliberate and is enforced at `onlyPlatformAdmin()` in `api/v1/admin/providers/route.ts` |
| MFA | Required (`MFA_REQUIRED_ROLES`) |
| Sees | National and provincial picture, all interactions, audit log, SLO attainment, ACU consumption |
| Does | Broadcasts to a role or territory, commissions reports, submits protocol changes to the review board |
| Command centre | §04.5 |

### G. Platform Operator — `platform_admin` — EXISTS

| Dimension | Specification |
|---|---|
| Permissions (19) | Everything `gov_admin` has, plus `dashboard:admin`, `admin:config`, `user:manage` |
| MFA | Required, plus **step-up within 15 minutes** for high-risk actions (`core/mfa.ts`) |
| Does | Runtime configuration, vendor credentials (`/admin` → Clés des fournisseurs), feature flags and canaries, break-glass grants, tenant and organisation management, pilot data reset |
| Cannot do | Change protocol clinical content without the review board; set `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`, `BOOTSTRAP_TOKEN`, `ADMIN_RECOVERY_TOKEN`, `OIDC_CLIENT_SECRET`, `DATABASE_URL`, `DATABASE_CA_CERT` — all eight are refused by name (`core/credentials.ts` `NEVER_SETTABLE`) |
| Command centre | §13 — the Super Control Centre |

### H. Clinical / Curriculum Review Board Member — EXISTS

Not a role but a **membership** (`review_boards`, `review_board_members`,
`review_signoffs`, `review_submissions`). Holding `review:sign` is not enough;
the board's own roster decides, checked separately in `ai/review/board.ts`.

| Dimension | Specification |
|---|---|
| Does | Reviews submitted protocol, prompt and content artefacts; signs or rejects; suspends a live artefact |
| Gate | `clinicalReadiness()` in `ai/review/gate.ts` — the platform reports **not ready** until quorum is met. This is why `/api/v1/system/health` can answer 503 on a technically perfect deployment |
| Accountable for | The clinical safety of every answer the platform gives |
| Command centre | §04.7 |

### I. Language Reviewer — EXISTS (via `language:review`)

Held by every field role, `ngo`, and both admin roles. Works `language_corpus`,
`language_lexicon`, `language_quality`, `glossaries`. Decides whether a
translation is good enough for a language to stay un-degraded
(`ai/language/gates.ts`). **This is the only control that stops the platform
speaking badly in a language it does not know well.**

### J. Sovereign Tenant Owner — EXTEND

A State or ministry operating its own instance. Today `tenants` exists and
carries data isolation; the *role* of tenant owner does not. §06.11 and §12.5
specify tenant provisioning, residency declaration, protocol inheritance and
the operations handover.

| New capability | Why |
|---|---|
| Declare `DATA_RESIDENCY` and `DEPLOYMENT_JURISDICTION` for the tenant | Their law, not the origin country's |
| Fork the protocol set and re-sign with their own board | Clinical authority is national and cannot be imported |
| Add a language with its own gate thresholds | Their languages |
| Hold their own vendor credentials | Their procurement |
| Export everything on exit | No lock-in; a public institution must be able to leave |

### K. Developer / Integrator — EXTEND

Today there is `docs/API.md` and a versioned `/api/v1` surface, but **no
developer identity, no API key lifecycle for third parties, and no sandbox**.
§10.8 specifies: service accounts (`core/service-identity.ts` exists as a
starting point), scoped keys, a sandbox tenant with synthetic data, signed
webhooks, and a published OpenAPI document.

Who this serves: a ministry's own IT department, a hospital information system
pulling referral data, a research institute, an NGO's case system.
**Not** a payment processor — there is none.

### L. Regulator / Auditor — NEW

| Dimension | Specification |
|---|---|
| Need | Verify compliance without being given operational power |
| Today | Would have to be granted `audit:read`, which comes bundled with far more |
| Specification | A new `auditor` role: `audit:read` + `review:read` + `report:export`, and **nothing else** — no interaction content, no case content, no configuration. Plus a signed, time-boxed evidence export (§11.7) |
| Why it matters | A data-protection authority asking "prove retention is enforced" should not need an account that can read a child's transcript |

### M. Telecom Operator — EXTERNAL

Reaches the platform through `/api/hooks/*`. Twilio and WhatsApp requests are
signature-verified and **refused when unverifiable in production**
(`channels/twilio.ts`, `channels/whatsapp.ts`). USSD and inbound SMS cannot be
signed — the operator's format has no signature — so each is rate-limited per
phone number under a keyed digest (`inboundChannelAllowed`). The residual
mitigation is a gateway IP allow-list at the load balancer: deployment
configuration, recorded as such in `docs/SECURITY.md` §7.

### N. AI Provider — EXTERNAL

Anthropic, Gemini, OpenAI, Google Speech. Reached only through `ai/gateway.ts`.
Subject to `core/residency.ts`: a provider outside the declared residency policy
is **refused and the platform stays on the offline provider**, rather than
quietly sending a transcript abroad.

---

## 3.3 Permission matrix (as built)

| Permission | citizen | chw | agri | teacher | ngo | gov_admin | platform_admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `interaction:create` | ● | ● | ● | ● | ● | ● | ● |
| `interaction:read_own` | ● | ● | ● | ● | ● | ● | ● |
| `interaction:read_all` | | | | | | ● | ● |
| `case:read` | | ● | ● | ● | ● | ● | ● |
| `case:write` | | ● | ● | ● | | ● | ● |
| `case:assign` | | ● | ● | ● | | ● | ● |
| `case:escalate` | | ● | ● | ● | | ● | ● |
| `dashboard:gov` | | | | | ● | ● | ● |
| `dashboard:health` | | ● | | | ● | ● | ● |
| `dashboard:agri` | | | ● | | ● | ● | ● |
| `dashboard:edu` | | | | ● | ● | ● | ● |
| `dashboard:admin` | | | | | | | ● |
| `report:export` | | | | | ● | ● | ● |
| `audit:read` | | | | | | ● | ● |
| `admin:config` | | | | | | | ● |
| `user:manage` | | | | | | | ● |
| `notification:read_own` | ● | ● | ● | ● | ● | ● | ● |
| `notification:broadcast` | | | | | | ● | ● |
| `feedback:create` | ● | ● | ● | ● | ● | ● | ● |
| `autosave:write` | ● | ● | ● | ● | ● | ● | ● |
| `language:review` | | ● | ● | ● | ● | ● | ● |
| `language:export` | | | | | ● | ● | ● |
| `review:read` | | ● | ● | ● | ● | ● | ● |
| `review:submit` | | | | | | ● | ● |
| `review:sign` | | ● | ● | ● | ● | ● | ● |

Two additions specified by this document set:

| Permission | Purpose | Granted to | Doc |
|---|---|---|---|
| `agent:operate` | Permit an agent to act on this actor's behalf within bounded authority | All roles, per-user opt-in | §05.2 |
| `agent:govern` | Change agent authority, approve autonomy levels, suspend an agent | `platform_admin` only | §05.12 |

And one new role:

| Role | Permissions | Doc |
|---|---|---|
| `auditor` | `audit:read`, `review:read`, `report:export` | §3.2 L |

---

## 3.4 Journey inventory

Every journey below either exists or is marked. Full step-level flows are in
§06 per module.

| # | Journey | Actor | Channels | Status |
|---|---|---|---|---|
| J-01 | Ask a health question and be triaged | citizen | all 5 | EXISTS |
| J-02 | Danger sign → severity 4 → emergency script → human alerted | citizen → chw | all 5 | EXISTS |
| J-03 | Photograph a diseased crop and get an action | citizen | WhatsApp, PWA | EXISTS |
| J-04 | Learn with a lesson, quiz and spaced repetition | citizen | IVR, WhatsApp, PWA | EXISTS |
| J-05 | Register, set language and province | citizen | all 5 | EXISTS |
| J-06 | Consent, export own data, delete account | citizen | PWA, USSD | EXISTS |
| J-07 | Receive and acknowledge a reminder | citizen | SMS, WhatsApp, IVR | EXISTS |
| J-08 | Work a case queue to resolution | chw/agri/teacher | PWA | EXISTS |
| J-09 | Bridged call to a citizen without seeing their number | chw | PWA + telephony | EXISTS |
| J-10 | Override an AI risk score with a reason | field officer | PWA | EXISTS |
| J-11 | Confirm or reject a cluster hypothesis | agri_officer | PWA | EXISTS |
| J-12 | Handle a safeguarding disclosure | teacher | PWA | EXISTS |
| J-13 | Commission and download a report | gov_admin/ngo | PWA | EXISTS |
| J-14 | Broadcast to a role or territory | gov_admin | PWA | EXISTS |
| J-15 | Submit, review and sign a protocol version | gov_admin → board | PWA | EXISTS |
| J-16 | Review language samples and lift a gate | language reviewer | PWA | EXISTS |
| J-17 | Wire a vendor credential and a channel driver | platform_admin | PWA | EXISTS |
| J-18 | Break-glass access with justification and expiry | platform_admin | PWA | EXISTS |
| J-19 | Run a canary from 5 % and hold 7 days | platform_admin | PWA | EXISTS |
| J-20 | Approve an agent's proposed action | any role | PWA | NEW — §04 |
| J-21 | Review an agent's autonomous action after the fact | platform_admin | PWA | NEW — §05.12 |
| J-22 | Provision a sovereign tenant | tenant owner | PWA + CLI | NEW — §06.11 |
| J-23 | Issue an integrator key and sandbox | platform_admin | PWA | NEW — §10.8 |
| J-24 | Produce a signed evidence pack for a regulator | auditor | PWA | NEW — §11.7 |
