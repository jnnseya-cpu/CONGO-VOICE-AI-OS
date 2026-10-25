# 01 — Executive Product Vision

## 1.1 The problem, stated without euphemism

The Democratic Republic of the Congo has roughly 100 million people, about 1.3
physicians per 10 000 of them, and a literacy rate that falls below 50 % for
rural women. Four in five people own or can reach a phone. Fewer than one in
three have usable internet. The majority language of daily life is not French —
it is Lingala, Kikongo, Swahili or Tshiluba — while almost every official
system, form and sign is French-only.

That combination produces a specific, measurable failure:

- A mother in a village three hours from a health post cannot tell whether her
  child's symptoms are ordinary or lethal, and the cost of being wrong is the
  child.
- A farmer loses a cassava crop to mosaic virus because the extension officer
  responsible for 14 000 hectares has not visited in a year.
- A teacher with 70 pupils and one textbook cannot differentiate instruction.
- The ministry responsible for all three has no instrument that tells it what
  is happening in a province this week — only what was reported last quarter.

Every existing remedy assumes something the country does not have: a smartphone,
a data plan, literacy in French, a clinic within walking distance, or a
functioning referral chain.

## 1.2 What the platform is today

A voice-first national service reachable by **ordinary phone call (IVR), USSD,
SMS, WhatsApp and web/PWA**, in five languages, which:

1. Hears a citizen in their own language, including on a 2G feature phone.
2. Understands the question and routes it to a specialist agent — health,
   agriculture or education.
3. Applies **deterministic safety rules** — danger signs, severity thresholds,
   escalation triggers — that are code and config, never model judgement.
4. Answers in the citizen's language, spoken aloud if they cannot read.
5. Opens a case and alerts a real human being when the situation requires one.
6. Records every step — input, transcript, translation, answer, risk score,
   escalation, override, notification — with actor, role, language, module,
   location, confidence, model version and audit status.
7. Keeps working with no internet, no vendor keys and no model access, because
   the offline provider and the protocol engine are local.

It is built on Next.js 16 / React 19 / TypeScript strict / Drizzle on
PostgreSQL, deployed to Cloud Run in `africa-south1`, with an embedded PGlite
database when no `DATABASE_URL` is present so the whole platform runs on a
laptop.

## 1.3 What the AI-OS is

An operating system is not an application. It is the layer that allocates
scarce resources, enforces isolation, schedules work, recovers from faults and
presents a uniform interface over heterogeneous hardware. **CONGO VOICE AI-OS
applies that definition to national public service delivery.**

| OS concept | CONGO VOICE AI-OS equivalent | Exists today |
|---|---|---|
| Process | A citizen interaction, orchestrated end to end | `ai/agents/orchestrator.ts` |
| Scheduler | 14-step sweep: reminders, SLA, retention, canaries, audit chain | `core/scheduler.ts` |
| Memory manager | ACU metering, caps, degraded mode | `core/metering.ts` |
| Device driver | Channel adapters: IVR, USSD, SMS, WhatsApp, web | `channels/` |
| Hardware abstraction | AI gateway: one interface over 5 providers | `ai/gateway.ts` |
| File system | Encrypted object storage with retention sweeps | `core/storage.ts`, `core/privacy.ts` |
| Permissions | 7 roles × 27 permissions, no inline role checks | `core/rbac.ts` |
| Syscall audit | Hash-chained audit log, verified daily | `core/audit.ts` |
| Fault tolerance | Readiness checks that refuse to lie about capability | `core/status.ts` |
| Package manager | Protocol lifecycle with clinical sign-off | `ai/protocols/lifecycle.ts` |

What this document set adds is the layer above: **autonomy**. Today a human
reads the dashboard and acts. In the AI-OS, a fleet of specialised agents reads
it, acts within bounded authority, escalates what exceeds that authority, and
leaves a reviewable trace of both.

## 1.4 The three transformations

### Transformation 1 — from service to command

Today every user type gets a dashboard: a rendering of what happened. The AI-OS
gives every user type an **AI Command Centre**: a surface that proposes what to
do next, executes what it is permitted to execute, and explains both.

A community health worker does not open a queue and sort it. She opens a
command centre that has already sorted it by clinical risk, flagged the two
cases whose SLA breaches in 40 minutes, drafted the follow-up messages, and
noted that three cases in the same health area share a symptom pattern that
looks like an outbreak. She approves, edits or rejects. Her judgement is the
authority; the agent is the preparation.

### Transformation 2 — from monitored to self-managing

Today a failing alert channel shows as a red check on `/api/v1/system/health`
and waits for an operator. In the AI-OS a **System Health Agent** detects it, a
**Bug Detection Agent** localises it, an **Auto-Repair Agent** applies a bounded
remedy from a whitelist of reversible actions, and a **Release Management Agent**
rolls back if the remedy does not clear the signal within its window. Every one
of those actions is audited and every one is reversible. Nothing with
irreversible blast radius — schema change, key rotation, data deletion, protocol
content change — is ever in an agent's hands.

### Transformation 3 — from national to sovereign-replicable

The platform is already multi-tenant (`tenants`, `organisations`, `territories`,
`provinces`). The AI-OS makes tenancy a **product**: a second country, or a
second ministry, deploys its own instance with its own languages, its own
clinical protocols, its own residency policy and its own review board, sharing
the engine but not the data. That is the licensing model in §12 — institutional
revenue that never touches a citizen.

## 1.5 Why this wins where others have not

| Approach | Why it fails here | What the AI-OS does instead |
|---|---|---|
| Smartphone health apps | Require a smartphone, data and literacy | Works on a 2G voice call and USSD |
| Chatbot on WhatsApp only | WhatsApp penetration is urban | Five channels, WhatsApp is one |
| LLM wrapper with a safety prompt | A prompt is not a safety control; it drifts, it can be talked around | Danger signs, severity and escalation are deterministic code with tests |
| Machine translation into "African languages" | Trained on little or no Lingala/Kikongo/Tshiluba; silently confident when wrong | Per-language confidence gates that **downgrade the channel** rather than answer badly |
| Telemedicine | Needs clinicians at the other end at scale | Triages deterministically and escalates only what needs a human |
| NGO pilot projects | End when the grant ends; no transfer of operations | Sovereign instance, local operations console, exportable protocols and corpus |
| Single-vendor AI platform | One outage, one price rise, or one policy change ends the service | Gateway over five providers with an offline provider that keeps the whole platform usable with zero keys |

## 1.6 The defensibility argument

Four assets compound and none can be bought:

1. **A deterministic clinical safety layer with national sign-off.** Protocols
   carry versions, clinical signatories and a review-board quorum
   (`ai/review/`, `ai/protocols/lifecycle.ts`). A competitor can copy a prompt.
   They cannot copy the Ministry of Health's signature on protocol v7.
2. **A growing corpus in four under-resourced languages.** Every interaction,
   with consent, enlarges `language_corpus`, `language_lexicon` and
   `language_quality`. The confidence gates mean the corpus is labelled by real
   usage, not scraped.
3. **Measured trust.** `feedback`, `risk_assessments`, `ai_overrides` and the
   hash-chained audit log produce something no new entrant has: evidence, over
   years, that the system was right and was safe.
4. **Channel reach already built.** IVR, USSD, SMS, WhatsApp and PWA with an
   offline outbox, all five tested. The hard part of serving rural DRC is not
   the model; it is the last 200 metres of telecom.

## 1.7 What success looks like, numerically

These are **targets**, and §17 states which are measured today and which are not.

| Horizon | Measure | Target |
|---|---|---|
| Pilot (1 province, 1 module) | Severity-4 cases reaching a human within SLA | ≥ 99 % |
| Pilot | Clinically reviewed answers judged safe by the board | ≥ 99.5 % |
| Pilot | First spoken reply on a call, p95 | ≤ 6 s (`slo.ts`) |
| National | Provinces live | 26 |
| National | Cost per interaction | ≤ 0.02 USD |
| National | Share of interactions served by a non-French language | ≥ 60 % |
| Sovereign | Second country instance live | 1 |
| Continental | Instances operated by their own ministries | ≥ 5 |

## 1.8 What this platform must never become

Written down so it cannot drift:

- It must never charge a citizen, directly or indirectly, for any part of the
  service, including "premium" speed, "priority" escalation or data bundles.
- It must never diagnose, nor give a dose outside approved protocol text.
- It must never claim a human was alerted when no channel could carry the alert.
- It must never let a model decide severity, escalation or a danger sign.
- It must never present a translation it is not confident in as if it were.
- It must never sell, share or monetise citizen data, in aggregate or otherwise.
  §12's institutional revenue is for software and operations, never for data.
