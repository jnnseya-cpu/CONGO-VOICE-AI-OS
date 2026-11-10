# 18 — Trend Intelligence, embedded

The Trend Intelligence build specification (v2.3, 10 November 2026) is
implemented **inside this platform**, not beside it. This document records how
it was mapped, what was changed to fit, and what was deliberately refused.

---

## 18.1 What it does here

A reader spots a change in what citizens are asking about. A strategist checks
whether the platform can serve it — signed protocol, staffed responder, live
alert channel. If it can, one versioned, time-limited **brief** changes what the
existing agents prioritise. The platform measures the result and recommends
continuing, revising or rolling back.

It is a control layer over the twelve agents that already exist. §1 of the
specification: *"Existing agent roles, permission boundaries, product facts and
brand policy remain authoritative."*

**On this platform that sentence has teeth.** A brief may reorder what the
health agent attends to. It may never widen what the health agent is allowed to
say. Danger signs, severity thresholds, escalation and approved protocol text
are untouched by it and are evaluated after it, exactly as they are today.

---

## 18.2 Where it lives

| Path | Responsibility | Spec |
|---|---|---|
| `src/server/ai/trends/scoring.ts` | Log lift, robust z, opportunity and confidence, thresholds, vetoes | §5, §17 |
| `src/server/ai/trends/brief.ts` | The Growth Brief contract and its runtime rules | §6, Appendix A |
| `src/server/ai/trends/channels.ts` | Channel registry, field allowlist, action kinds | §7, §18 |
| `src/server/ai/trends/actions.ts` | Deterministic action keys, execution guards, receipts, rollback | §18 |
| `src/server/ai/trends/measurement.ts` | First-party outcomes, cohort floor, recommendation | §10, §18 |
| `src/server/ai/trends/effective.ts` | **The embedding point** — the one call an agent makes | §4, §14, §16 |

Five tables in `src/server/db/schema.ts`: `trend_observations`,
`trend_opportunities`, `growth_briefs`, `brief_actions`, `brief_outcomes`.

---

## 18.3 The two collisions, and how the specification resolved them

The specification is industry-neutral and commercial by default. Two parts of
it contradict this platform's charter. Neither was dropped; both were resolved
with mechanisms the specification itself provides.

### Collision 1 — the commercial control plane (§19)

The spec packages the product as Managed Starter, Managed Growth and Private
Enterprise, with subscriptions, entitlement states, metering for billing and a
payment-provider adapter.

**This platform is free for every citizen for ever and contains no payment
system.** Adding one would contradict `docs/ai-os/01-vision.md` §1.8 and the
instruction that no payment gateway enters this platform.

**Resolution, from §19 itself:** the *Internal* package — "internal allocation
per platform and environment, usage attributed to installation". That is
precisely this deployment, and the platform's existing ACU ledger
(`core/metering.ts`, with caps and degraded mode) already *is* the metering half
of it. No billing code, no entitlement state machine and no payment adapter
enter the platform. Managed and Private packaging are recorded as not
applicable to this deployment.

### Collision 2 — paid media and lifecycle marketing (§7)

The spec's channel table includes paid search and social, ad budgets, and
lifecycle/CRM direct marketing.

**This platform must never buy media and must never send a marketing message to
a citizen about their own health.** Care reminders already exist, are consented,
capped and quiet-hours aware, and belong to the notifications module.

**Resolution, from Appendix A's runtime rules:** *"The broader channel enum
reserves stable routing values for future adapters and makes no feature
available on its own … Other route values remain unavailable until an adapter
and policy explicitly enable them."*

So all six routing values are registered, and the contract is not forked. Two
are marked `refused_by_policy` with the reason stored beside them:

| Channel | Availability here | Reason |
|---|---|---|
| `seo` | available | The platform owns its public pages; a change is reversible and measurable |
| `owned_placement` | available | Call-to-action copy on the platform's own surfaces, behind a reversible flag |
| `organic_social` | not implemented | Exportable draft only; no publishing adapter, and a public post cannot always be withdrawn |
| `sales_enablement` | not implemented | Reserved for field-worker briefings; no adapter yet |
| `lifecycle` | **refused by policy** | The platform never sends a prospecting message to a citizen about their health |
| `paid` | **refused by policy** | The service is free and the platform has no payment or media-buying system |

A refused channel produces **no draft at all**, because a draft implies an
intention to send. An unimplemented one still produces an exportable draft,
which is what §2 requires.

---

## 18.4 Changes made to fit this platform

Each is a deliberate departure, recorded so it is reviewable.

| Spec | Here | Why |
|---|---|---|
| Readiness means stock and partner coverage | Signed protocol version, staffed responder, live alert channel | The platform has no stock. What it can fail to have is a human at the other end |
| Outcomes are orders, demos, contribution margin | Escalation acknowledged in SLA, follow-up acknowledged, protocol answer delivered, learning session completed, guidance page engaged | The only outcomes this platform can honestly observe |
| Guardrails are refunds and cancellations | A guardrail event is a citizen not reached | A guardrail breach here is harm, not margin |
| Small-cohort suppression threshold unspecified | 30, matching `MIN_OBSERVATIONS` in `core/slo.ts` | One sufficiency rule, so the two cannot drift apart |
| Execution guards: freeze, entitlement, brief, policy, hash, self-approval | Plus **clinical readiness** | No citizen-facing change while the review board lacks quorum |
| Claim text may be resolved from a read model | Resolved only from a protocol version whose status is `approved` or `active` | A claim here is a sentence a clinician signed; a draft or retired version is not |

### What the platform cannot measure, named

`UNOBSERVABLE_OUTCOMES` records clinical outcome, averted harm, yield change
and attainment change. The platform knows a case reached a human. It does not
know whether the child recovered, and a report implying otherwise would be the
most damaging false claim this service could make.

---

## 18.5 Conformance

| Scenario | Status |
|---|---|
| TI-03 — scorer returns 86.25 / 83.5 unrounded | **PROVEN** — `tests/trends-scoring.test.ts` |
| TI-04 — syndication, staleness, context-only | **PROVEN** in the scorer; ingestion-side dedupe is the unique index |
| TI-05 — expired brief denies a queued action | **PROVEN** — `trends-effective.test.ts`, `trends-write-safety.test.ts` |
| TI-06 — model output cannot produce a privileged action | **PROVEN** — the brief is a closed zod object; extra fields are rejected |
| TI-07 — crash after the surface committed | **PROVEN** — `trends-write-safety.test.ts`, one side effect across crash and retry |
| TI-08 — editor changes the target | **PROVEN** — conflict before write and before rollback |
| TI-14 — unrelated intent must not merge | PARTIAL — distinct topic and market keys; semantic clustering is not built |
| TI-22 — no credential prompt for an unavailable destination | **PROVEN** — refused channels carry a reason and never prompt |

**Not built:** observation ingestion endpoints, the opportunity scoring job,
the brief approval API, the outbox worker and the console. §18.6 lists them.

---

## 18.6 What remains

| Item | Spec |
|---|---|
| `POST /api/v1/trends/observations` and the scoring job | §16, §17 |
| Brief proposal, approval and `briefs:effective` over HTTP | §16 |
| The outbox worker and queued execution | §6, §18 |
| Operator console: opportunities, briefs, preview and diff, approvals | §8 |
| Wiring `effectiveBrief()` into the orchestrator's specialist agents | §4 |
| RBAC permissions for brief proposal and approval | §16 |

The domain core, the contract, the write-safety path and the resolver are
built and tested. The surfaces that expose them to a human are not.
