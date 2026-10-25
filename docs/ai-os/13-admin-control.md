# 13 — Admin Super Control Centre

The operator's surface. Total visibility, bounded power, and every action
audited. Extends the existing `/admin` console rather than replacing it.

---

## 13.1 What exists today

| Panel | Route | Content |
|---|---|---|
| Operational stats | `/admin` | ACU cost 7 d, server errors 24 h, escalations, satisfaction |
| Capability usage | `/admin` | Calls, failures, latency, cost per capability |
| Understanding quality | `/admin` | Empty transcriptions, low-confidence interactions, open escalations, API latency |
| Language mix | `/admin` | Interactions by language since origin |
| Recent server errors | `/admin` | Last ten 5xx with method, path, code, message |
| Readiness | `/admin` | `StatusPanel` — every readiness check |
| Accounts by role | `/admin` | Counts |
| **Vendor credentials** | `/admin` | 17 credentials in 5 groups; last-4 only; driver selectors as closed lists |
| Runtime configuration | `/admin` | `admin_config` key/value with JSON values |
| Demo data | `/admin` | Seed (non-production) |
| Audit log | `/admin/audit` | Hash-chained entries |
| Users | `/admin/utilisateurs` | Directory — **reading it is audited** |
| Review boards | `/admin/comite` | Membership, quorum, submissions |
| Communications | `/admin/communications` | Templates, broadcasts |

---

## 13.2 The control centre structure — NEW

Nine surfaces. Each names what it shows, what it can change, and what it can
never change.

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1 PULSE          Is the platform serving citizens right now?        │
│ 2 SERVICE        What citizens are experiencing, by province        │
│ 3 CLINICAL       Safety, protocols, board, overrides                │
│ 4 AGENTS         Conduct ledger, authority, kill-switch             │
│ 5 SECURITY       Detections, access, break-glass, audit integrity   │
│ 6 COST           ACU attribution, forecast, routing                 │
│ 7 LANGUAGE       Gates, corpus, reviewer throughput                 │
│ 8 INFRASTRUCTURE Connectors, scheduler, releases, capacity          │
│ 9 TENANTS        Instances, provisioning, residency, exports        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 13.3 Surface 1 — Pulse

The one screen to open at 3 a.m. **Must render in under one second and must be
correct when everything else is broken.**

| Tile | Shows | Red when |
|---|---|---|
| Serving | Interactions in the last 15 min vs. the same window last week | < 50 % of expected |
| Escalation path | Live alert channels, and **whether a person is on the other end** | Zero live channels, or zero active responders in a territory with open severity-3+ |
| Severity 4 | Unacknowledged critical cases, oldest first | Any older than 15 min |
| Readiness | Failing checks | Any failing |
| Scheduler | Minutes since last run | > `SCHEDULER_STALE_AFTER_MS` |
| Providers | Capability × provider health | Any capability with no healthy provider |
| Errors | 5xx rate, 15 min | > 1 % |
| Audit chain | Last verification result | Any break — **this is the most serious red in the platform** |
| ACU | Month-to-date vs. cap | > 85 % |
| Agents | Faults and reversals, 24 h | Fault rate > 5 % |

**The escalation-path tile is the platform's conscience.** It is the only tile
that answers "if a child's danger sign arrives right now, does a human find
out?" It combines the channel check (§06.3's driver + credentials rule) with the
§05.4.12 responder check, because a live channel into an empty roster is still
nobody.

---

## 13.4 Surface 2 — Service

| Panel | Content | Drill-down |
|---|---|---|
| Province map | Interactions per 100 000, 7 d | Province → territory → channel |
| Channel mix | Volume and p95 latency per channel | Per province |
| Journey funnel | Opened → understood → answered → resolved → escalated | Per module, drop-off points named |
| Abandonment | Where sessions end | Exact turn, with the transcript redacted |
| Satisfaction | Feedback scores and "useful" rate | Per module and language |
| Re-contact | Same citizen, same topic, within 48 h | **A proxy for "the answer did not work"** |

---

## 13.5 Surface 3 — Clinical

The surface that makes this a medical-grade system rather than a chatbot.

| Panel | Content | Operator can |
|---|---|---|
| Board status | Seats filled, quorum, pending submissions, days waiting | Nothing — appointments are the ministry's |
| Protocol inventory | Each protocol, version, status, signatories, date | Submit for review. **Never edit content** |
| Live suspensions | Suspended artefacts and why | Suspend, lift only via the board |
| Severity distribution | Against a 4-week baseline, per territory | — |
| Override analysis | Where humans disagree with the model, by worker and direction | — |
| Claim drift | §05.4.9 unsupported clinical claims | Suspend the prompt version |
| Safeguarding | Volume and time-to-human only. **No content** | — |
| Impact preview | For a pending version: real interactions that would change | — |

**Two hard limits.** A `platform_admin` cannot edit clinical content — only
submit it. And the safeguarding panel shows counts and timings, never a record:
an administrator browsing a child's disclosure is the harm the platform exists
to prevent.

---

## 13.6 Surface 4 — Agents

| Panel | Content | Operator can |
|---|---|---|
| Conduct ledger | Per agent: runs, proposals, acceptance %, reversals, faults, ACU | — |
| Authority matrix | Agent × action × tenant → autonomy, with promotion progress | Set autonomy, **never above compiled `maxAutonomy`** |
| Live runs | In-flight, with elapsed time and ACU | Cancel |
| Action ledger | Every executed action with its reversal | **Reverse any action** |
| Faults | Unresolvable evidence, out-of-scope writes, budget, timeout | — |
| Rejection analysis | The five most-rejected proposal types per agent | — |
| **Kill-switch** | Global state | **All tiers 2–4 → L0.** Step-up required |

### The kill-switch, restated

One action returns the platform to exactly what it is today: deterministic,
audited, human-operated, still answering every citizen correctly. Tier 1 service
agents and every safety rule continue. **The autonomy layer is strictly additive
and strictly removable**, and an operator who does not understand what the
agents are doing should use it without hesitation.

---

## 13.7 Surface 5 — Security

| Panel | Content | Operator can |
|---|---|---|
| Detections | §11.5 D-01…D-12, open and resolved | Acknowledge, escalate |
| Access review | Who holds what, last used, dormant accounts | Revoke, downgrade |
| Break-glass | Active grants with justification and expiry | Grant (step-up), revoke |
| Sessions | Active sessions by role; impossible-travel flags | Bump an account's epoch |
| Audit integrity | Chain verification, external anchor comparison | Trigger verification |
| Residency | Attempts refused by policy, by provider | — |
| Rate limiting | Accounts and numbers at a ceiling | Adjust a per-number limit (audited) |
| Lockouts | Locked accounts and addresses | Unlock with a reason |

---

## 13.8 Surface 6 — Cost

| Panel | Content | Operator can |
|---|---|---|
| Month-to-date | ACU and USD vs. cap, with a forecast | — |
| Attribution | By province, module, channel, agent, model class, language | — |
| Cascade health | R0/R1/R2/R3 shares against target | Adjust routing thresholds (audited) |
| Cache health | Prompt, STT and retrieval hit rates | — |
| Top consumers | Accounts and numbers by ACU | Hand to the Abuse agent |
| Cost per interaction | Trend, by module | — |
| Conversion table | The published ACU rates | Edit (audited; a funder can recompute) |
| Degraded mode | Current state and history | Enter or exit manually |

---

## 13.9 Surface 7 — Language

| Panel | Content | Operator can |
|---|---|---|
| Gate state | Per language: mode, confidence trend, days in state | **Nothing.** A gate is lifted by reviewer judgement in `language_quality`, never by an administrator |
| Corpus | Size, growth, coverage by domain | Launch a targeted collection campaign |
| Reviewer throughput | Samples reviewed per reviewer per week; backlog | Reassign |
| Quality trend | Per language, per module | — |
| Lexicon | Proposed terms awaiting approval | Approve (routes to a reviewer) |
| Export | Corpus export | Export — it is a national asset |

**That an administrator cannot lift a gate is the point.** The gate exists to
stop the platform speaking badly in a language it does not know. If an operator
under schedule pressure could override it, it would protect nobody.

---

## 13.10 Surface 8 — Infrastructure

| Panel | Content | Operator can |
|---|---|---|
| Connectors | Each connector's health, quota, failover, residency | Fail out, restore, test |
| Scheduler | 14 steps: last run, duration, errors | Re-run a step |
| Releases | Canary state, percentage, hold remaining, SLO delta | Advance, hold, **roll back** |
| Feature flags | Flags, cohorts, canary configuration | Edit (audited) |
| Capacity | Instances, concurrency, cold starts, database connections | Adjust bands |
| Storage | Volume by class, retention attainment, purge failures | Trigger a sweep |
| Performance | SLO attainment; `null` below 30 observations | — |
| Errors | Grouped by signature with first-seen commit | Open a defect record |

---

## 13.11 Surface 9 — Tenants

| Panel | Content | Operator can |
|---|---|---|
| Instances | Each tenant: status, provisioning step, residency, languages, board quorum | Advance provisioning |
| Isolation proof | Cross-tenant query attempts (should be zero) | — |
| Residency conformance | Per tenant, declared vs. actual provider routing | — |
| Protocol lineage | Which tenant forked which protocol, and whether re-signed | — |
| **Export** | On-demand full export | Trigger — **a tenant's right, not a favour** |
| Usage | ACU, interactions, workers, per tenant | — |

---

## 13.12 Governing the governors

The control centre is powerful, so it is itself constrained.

| Control | Mechanism |
|---|---|
| Every action audited | Actor, role, before, after, reason, IP, trace id |
| Reading is audited too | Directory reads, safeguarding counts, audit-log reads |
| Step-up for high-risk | Credentials, break-glass, user management, kill-switch, pilot reset |
| Eight secrets unreachable | `NEVER_SETTABLE` — refused by name, from any route |
| Clinical content out of reach | Submission only; the board signs |
| Language gates out of reach | Reviewer judgement only |
| **Two-person rule** (NEW) | Changing the ACU conversion table, retention periods or residency policy requires a second `platform_admin` to confirm within 15 minutes |
| Dormant-privilege expiry (NEW) | A permission unused for 90 days is flagged for review |
| Session recording (NEW) | Admin console actions replayable for incident review — **actions and targets, never citizen content** |

**The two-person rule exists because of §11.1's political actor.** A single
compromised administrator should not be able to shorten retention to destroy
evidence, redirect data to a non-compliant jurisdiction, or alter the cost basis
a funder relies on.
