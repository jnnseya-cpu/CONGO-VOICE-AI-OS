# 08 — System Architecture

Runtime, orchestration, events, gateway, scale. What exists is named with its
file; what is added is specified to the level a senior engineer can build from.

---

## 8.1 The layer diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CITIZEN SURFACE                                                           │
│  IVR · USSD · SMS · WhatsApp · PWA (offline outbox, background sync)      │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────┐
│ EDGE                                                                      │
│  Cloud LB · WAF/bot (NEW) · proxy.ts canonical host, CSP, HSTS            │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────┐
│ API PERIMETER                                                             │
│  handle({permission|auth|registered, limit})                              │
│   authn → RBAC → session epoch → shared rate limit → body cap →          │
│   credential sync → zod validation → handler → audit → structured log     │
│  /api/hooks/*  — provider format, signature-verified, fail-closed in prod │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────┐
│ APPLICATION                                                               │
│  Interaction orchestrator · Case workflow · Notifications · Reporting     │
│  Language & gates · Protocol engine · Review boards · Privacy · Metering  │
├───────────────────────────────────────────────────────────────────────────┤
│ AGENT RUNTIME                                       (NEW — §06.12)        │
│  Registry · Authority · Trigger scheduler · Executor · Proposals ·        │
│  Action ledger with reversals · Watchdog · Governance                     │
├───────────────────────────────────────────────────────────────────────────┤
│ AI GATEWAY                     ai/gateway.ts — the only vendor-aware file │
│  Capability routing (llm·vision·stt·tts) · difficulty cascade (NEW) ·     │
│  residency enforcement · budget · prompt cache (NEW) · offline provider   │
├───────────────────────────────────────────────────────────────────────────┤
│ KNOWLEDGE                                                                 │
│  Protocols (deterministic) · KB chunks · pgvector (NEW) ·                 │
│  Knowledge graph (NEW) · Glossary · Corpus                                │
├───────────────────────────────────────────────────────────────────────────┤
│ DATA                                                                      │
│  PostgreSQL 64 tables · object storage (encrypted) · event log ·          │
│  hash-chained audit · analytics warehouse (NEW)                           │
├───────────────────────────────────────────────────────────────────────────┤
│ PLATFORM SERVICES                                                         │
│  Scheduler (14 steps) · SLO · Flags & canaries · Credentials ·            │
│  Idempotency · Rate limits · Storage · Residency · OpenTelemetry          │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 8.2 Runtime — EXISTS

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 App Router, React 19 | One deployable for SSR pages, API routes and the PWA; Turbopack build; standalone output |
| Language | TypeScript strict, **no `any`** | A platform that makes clinical decisions cannot have untyped boundaries |
| ORM | Drizzle, PostgreSQL dialect | Schema is `src/server/db/schema.ts`, single source of truth; generated SQL is reviewable |
| Database | Cloud SQL PostgreSQL; **PGlite embedded** when no `DATABASE_URL` | The whole platform runs on a laptop, and tests run in-memory |
| Hosting | Cloud Run, `africa-south1` | Scale-to-zero, request-scoped billing, nearest region |
| Server-only boundary | `import "server-only"` at the top of every server module; aliased to a stub in tests | Prevents a server secret reaching a client bundle by accident |
| Edge logic | `src/proxy.ts` (Next 16 convention, export named `proxy`) | Canonical host, security headers |

### Why a modular monolith and not microservices

Deliberate, and worth defending. The platform's hardest guarantees —
*deterministic safety*, *everything audited*, *transactional consistency
between an interaction, a risk score, a case and a notification* — are all
easier to keep inside one transaction boundary than across a network. A
microservice split would buy independent scaling the traffic does not yet need
and would cost the one property that cannot be recovered: a severity-4
assessment and the case it opens either both exist or neither does.

The seam is already drawn for later extraction: `channels/`, `ai/`, `core/` and
`db/` have no circular dependencies, and the gateway is the only vendor-aware
module. When a component needs independent scale — most likely STT — it extracts
cleanly.

---

## 8.3 The API perimeter — EXISTS

Every `/api/v1` route is `handle({ permission | auth | registered, limit }, fn)`.

In order, per request:

1. Trace id adopted from Cloud Run's header or generated.
2. Client address from the **trusted end** of `X-Forwarded-For` (documented
   assumption: exactly one proxy).
3. Database handle.
4. **Credential sync** (≤ once/minute/instance) — §08.5.
5. Authentication from the signed session token.
6. `registered` check — anonymous sessions refused where required.
7. RBAC permission check (`hasPermission`).
8. Session-epoch check — a signed token whose account epoch advanced is dead.
9. Shared rate limit, counted in PostgreSQL so the limit holds across instances.
10. Body cap.
11. Zod validation via `ctx.json(schema)`.
12. Handler.
13. Audit write where the action is auditable.
14. Structured log with status, duration, trace id.

### Rate-limit classes

| Class | Limit | Keyed by |
|---|---|---|
| `default` | 120/min | user, else IP |
| `ai` | 30/min | account — additionally capped per address for provider spend |
| `auth` | 10/min | **address** — there is no session yet, and an attacker must not get a fresh allowance per guess |
| `none` | — | probes |

Counted in `rate_limit_counters`; the in-process window is a cheap first line
and a database failure falls back to it rather than taking the platform down.

### Webhooks

`/api/hooks/*` cannot use `handle()` — they answer a gateway in that gateway's
format. Their guards are specified in §11.6.

---

## 8.4 AI Gateway — EXISTS, EXTENDED

`src/server/ai/gateway.ts` is the only file in the platform that knows a vendor
exists. Agents call `generateJson({ system, user, schema, schemaName })`,
`transcribe`, `synthesize`.

| Property | Behaviour |
|---|---|
| Capabilities | `llm`, `vision`, `stt`, `tts` |
| Registration | Lazy, once per process; `reloadGateway()` drops it when a credential changes |
| Ordering | `AI_LLM_ORDER` decides precedence and fallback |
| Residency | `permits(providerId)` — a provider outside policy is **not registered**; the gateway stays on the offline provider |
| Offline | `providers/mock.ts` implements all four capabilities; the platform is fully usable with no keys |
| Structured output | Zod schema in, validated object out; a schema violation is a provider error, not a silent pass-through |
| Metering | Every call records `ai_usage_logs` and converts to ACU |

### ADDED

| Addition | Specification |
|---|---|
| **Difficulty cascade** | §05.10. `route(difficultySignature) → R0|R1|R2|R3`. Signature computed deterministically before any model call. An R3 escalation is always allowed when risk ≥ severity 3 |
| **Prompt caching** | Cache key = `hash(systemPrompt) + promptVersion + providerId`. System prompts are 60–90 % of prompt tokens and are identical across calls |
| **STT content cache** | Key = `sha256(audio) + language`. Removes duplicate spend on retry and resume |
| **Budget wrapper** | Per-run `budgetAcu` enforced before each call; exceeding aborts the run |
| **Shadow evaluation** | A candidate model/prompt runs alongside the live one on a sample, writing to `evaluation_runs` without affecting the answer. This is what makes a model change provable before a canary |

---

## 8.5 Configuration and credential propagation — EXISTS

Two stores, one precedence rule.

| Store | Holds | Precedence |
|---|---|---|
| Deployment environment / Secret Manager | Everything; the only home for the 8 `NEVER_SETTABLE` secrets | Lower |
| `provider_credentials` (console-set, AES-256-GCM, own HKDF purpose) | 17 allow-listed vendor credentials and channel drivers | **Higher** — withdrawing it restores the deployment's value |

**Propagation:** every reader reads `process.env`. The stored value is copied
into it at the edges — each `/api/v1` request, each outbound send, each
scheduler sweep — held for 60 s. The instance serving the write is current
immediately; others within a minute.

**ADDED (closes G-15):** publish a `credentials.changed` event on the bus
(§08.8) so other instances invalidate immediately instead of waiting out the
TTL. The TTL stays as the floor if the bus is unavailable — a push that can fail
must never be the only mechanism.

---

## 8.6 Durable agent runs — NEW (closes G-13)

A request-scoped function cannot run a 20-minute cluster analysis or a report
that spans a province-year.

| Property | Specification |
|---|---|
| Identity | `agent_runs.id` — UUIDv7, time-ordered |
| State | `agent_runs.state` JSONB, written by `ctx.checkpoint()` |
| Resumption | A run whose instance died resumes from its last checkpoint on the next scheduler tick |
| Idempotency | Every external effect inside a run goes through `withIdempotency` keyed by `runId + stepId` |
| Timeout | Declared per agent; exceeded → `faulted`, state preserved for diagnosis |
| Cancellation | Cooperative; checked at each checkpoint; the kill-switch cancels all in-flight runs |
| Concurrency | One run per (agent, tenant, subject) — a Postgres advisory lock, so two instances cannot both act |

**Why not a queue service:** the platform already has PostgreSQL, a scheduler
and idempotency. Adding SQS/PubSub would add an availability dependency and a
second source of truth for work state. Postgres `SKIP LOCKED` gives a correct
work queue at this scale, and the operational simplicity is worth more than the
throughput ceiling the platform will not reach for years.

---

## 8.7 Caching — EXISTS, EXTENDED

| Layer | What | Invalidation |
|---|---|---|
| In-process memo (`core/memo.ts`) | Config, flags, ACU table, credentials | TTL + explicit reset |
| Service worker | `cvos-shell-<version>`, `cvos-data-<version>` | Version bump; `cvos-signed-out` purges the data cache |
| **Prompt cache** (NEW) | Provider-side system-prompt cache | Prompt version change |
| **STT cache** (NEW) | Transcript by audio hash + language | Immutable; retention-swept with the audio |
| **Retrieval cache** (NEW) | Query embedding → chunk ids | Corpus version change |
| **Command-centre cache** (NEW) | ACT zone, 60 s per user | TTL + write-through on a case change |

**Never cached:** anything clinical that could be stale — risk scores, protocol
text in flight, escalation state, readiness.

---

## 8.8 Event architecture — EXISTS, EXTENDED

`core/events.ts` + `sync_events` provide an append-only event log today, used
for offline sync and cross-component notification.

### Specified event taxonomy

| Domain | Events |
|---|---|
| Interaction | `received`, `transcribed`, `assessed`, `answered`, `failed`, `abandoned` |
| Risk | `scored`, `danger_sign_detected`, `overridden` |
| Case | `opened`, `assigned`, `acknowledged`, `transitioned`, `escalated`, `resolved`, `sla_breached`, `merged` |
| Notification | `queued`, `sent`, `failed`, `read`, `acknowledged` |
| Language | `gate_degraded`, `gate_restored`, `sample_reviewed` |
| Protocol | `submitted`, `signed`, `activated`, `suspended` |
| Agent | `run_started`, `proposed`, `accepted`, `rejected`, `executed`, `reversed`, `faulted` |
| Platform | `credentials_changed`, `provider_failed_out`, `canary_advanced`, `rolled_back`, `slo_burn` |
| Security | `auth_failed`, `lockout`, `break_glass_granted`, `residency_refusal`, `abuse_detected` |

### Delivery

| Property | Specification |
|---|---|
| Ordering | Per aggregate (case, interaction, user) — UUIDv7 gives time order |
| Semantics | At-least-once; consumers are idempotent by `eventId` |
| Transport | Postgres `LISTEN/NOTIFY` for in-cluster fan-out; the table is the durable record |
| Retention | 90 days hot, then to the warehouse |
| Replay | Supported from the table for any consumer, bounded by retention |
| Schema | Versioned; a consumer that cannot parse a version logs and skips rather than crashing the producer |

**Why not Kafka:** the platform's event volume at national scale is in the
millions per month, not per minute. Postgres plus NOTIFY carries it with one
fewer system to operate, one fewer thing to be down at 3 a.m. in a country where
on-call depth is the binding constraint. The taxonomy is transport-agnostic, so
the migration is possible if volume ever demands it.

---

## 8.9 Scalability

### What scales how

| Dimension | Limit today | Scaling path |
|---|---|---|
| Concurrent requests | Cloud Run autoscale | Instance bands by province time-of-day (§05.6.5) |
| Database connections | Cloud SQL max | PgBouncer in transaction mode; read replicas for analytics |
| Model throughput | Provider quotas | Cascade (§05.10) cuts R2/R3 volume ~70 %; multi-provider rotation |
| STT | Most expensive capability | Content cache; the first candidate for extraction to its own service |
| Storage | GCS, unbounded | Lifecycle to colder classes; retention sweeps already delete |
| Analytics | Competes with OLTP | **Separate warehouse** — §09.9 |
| Report generation | In-process | Already async via `report-jobs`; workers scale independently |

### Load shape

Rural traffic is diurnal and agricultural-seasonal. Peak is morning and early
evening, local time, by province. The platform spans one timezone (UTC+1/+2),
so the national peak is sharp. Capacity planning must size for the **provincial
morning peak plus an outbreak surge**, not the daily mean.

### Measured, not assumed

The current figures, from `scripts/loadtest.mjs` in a local environment:
write p95 **177 ms at 1 concurrent**, **788 ms at 5**, 0 % errors, against a
4 000 ms target. Above that the rate limiter binds by design. A true sustained
figure needs several source addresses — recorded as an open item in §17.

---

## 8.10 Failure modes and their handling

| Failure | Today | In the AI-OS |
|---|---|---|
| One AI provider down | Gateway falls to the next in `AI_LLM_ORDER` | + Health agent fails it out for 30 min, Cost agent re-routes |
| All AI providers down | Offline provider; platform fully usable on rules | Unchanged — this is the floor and it holds |
| Database down | Platform down | Read replica for degraded read-only citizen answers from cached protocols — **DECISION**, because a read-only clinical service may be worse than an honest outage |
| Telephony down | Channel reports unavailable; readiness fails | + Failover chain, + Health agent, + visible to the citizen |
| Scheduler stopped | `scheduler_running` check fails | + Health agent L3 re-run, + page |
| Storage down | Uploads fail; text path unaffected | Unchanged |
| Region down | Full outage | DR — §14.6 |
| Credential wrong | Provider errors | Console shows last-4 and source; Health agent fails the provider out |
| Model returns malformed output | Schema violation → provider error → next provider | + fault recorded; repeated violations fail the model class out |
| Agent misbehaves | — | Governance agent suspends; kill-switch returns to L0 |

---

## 8.11 Non-functional targets

| Objective | Target | Status |
|---|---|---|
| IVR first spoken reply, p95 | 6 000 ms | `slo.ts` EXISTS |
| WhatsApp voice-note reply, p95 | 12 000 ms | EXISTS |
| Photo analysis, p95 | 15 000 ms | EXISTS |
| API without a model call, p95 | 400 ms | EXISTS |
| Useful reply, text path, p95 | 12 000 ms | EXISTS |
| Availability | 99.5 % | EXISTS |
| **Command-centre ACT zone, p95** | **400 ms** | NEW |
| **Agent proposal freshness** | **≤ 60 s** | NEW |
| **Per-language answer confidence** | **per-language target** | NEW — §14.4 |

Below `MIN_OBSERVATIONS = 30` a percentile is reported as **unmeasured**, never
as a number. That rule is already in `slo.ts` and extends to every new
objective.
