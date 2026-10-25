# 14 — Operations Architecture

DevOps, observability, reliability, disaster recovery, business continuity and
testing. What exists is named; what is missing is specified and, where it has
never been executed, said so.

---

## 14.1 Environments

| Environment | Purpose | Data | Providers | Stage |
|---|---|---|---|---|
| Local | Development | PGlite, seeded | Offline mock | `dev` |
| Test | CI | PGlite in-memory | **Offline mock only** | `test` |
| Sandbox | Integrator testing | Synthetic only | Mock or sandbox keys | `sandbox` |
| Staging | Pre-production | Real-shaped, no citizen data | Real, low quota | `staging` |
| Pilot | One province, one module | **Real citizen data** | Real | `pilot` |
| Production | National | Real | Real | `prod` |

`SERVES_CITIZENS` determines which stages must have a live alert channel.
Staging is exempt — it serves nobody; pilot and production are not.

**All 1 749 tests run with no API keys.** The offline provider is not a stub, it
is a complete implementation of all four capabilities, which is why the test
suite is a genuine regression net rather than a mock exercise.

---

## 14.2 Build and release

| Stage | Command | Gate |
|---|---|---|
| Type | `npm run typecheck` | Zero errors. **No `any`, no `@ts-ignore`** |
| Lint | `npm run lint` | Zero errors |
| Test | `npm test` | 1 749 tests in 92 files, 823 s |
| Build | `npm run build` | Next standalone |
| Standalone closure | `npm run check:standalone` (postbuild) | Every runtime dependency resolvable inside `.next/standalone` |
| Migrations | `npm run db:check` | Schema and migration agree |
| Preflight | `npm run preflight` | Environment contract satisfied |
| SEO | `npm run seo:report` | Every article ≥ 90/100 |
| Accessibility | `npm run a11y` | axe-core, zero violations |
| Performance | `npm run perf` | 3G profile budgets |
| PWA offline | `npm run pwa:offline` | SW registers, controls, renders offline |
| Image | `cloudbuild.yaml` with `--pull` | Node ≥ 22.23.4 (October 2026 security releases) |
| Deploy | `scripts/go-live.sh` | Cloud Run |
| Smoke | `npm run smoke -- https://host` | 37 behavioural checks |
| Rehearsal | `npm run rehearsal` | Pilot rehearsal |

**Suppressing a type, lint or build error to force a deployment is forbidden.**
If a check must be bypassed, the bypass is documented with its justification;
it is never silent.

### Release strategy

| Change | Path |
|---|---|
| Code | Canary 5 % → 7-day hold → promote. Release agent rolls back on SLO degradation |
| Schema | Expand → migrate → contract. **Never a destructive migration in one release** |
| Prompt | `prompt_versions` + `evaluation_runs` shadow → board review if clinical → canary |
| Protocol | **Board quorum sign-off is mandatory.** No code path ships clinical content without it |
| Config | `admin_config`, immediate, audited, reversible |
| Credential | Console, immediate on the instance, ≤ 60 s elsewhere |

---

## 14.3 Capacity

| Resource | Today | Specified |
|---|---|---|
| Cloud Run | Autoscale, default bands | Scheduled min-instances by province time-of-day; surge band for outbreak events |
| Database | Single instance | Read replica for analytics; PgBouncer transaction pooling |
| Storage | GCS standard | Lifecycle to nearline at 30 days, coldline at 180 |
| Model quota | Per-provider | Multi-provider rotation; cascade reduces R2/R3 ~70 % |

**Known ALB issue:** `Timeout sec is not supported for a backend service with
Serverless network endpoint groups`. Recorded as an open deployment item in §17;
the backend timeout must be configured at the Cloud Run service, not the backend
service.

---

## 14.4 Observability

### Built

| Signal | Implementation |
|---|---|
| Traces | OpenTelemetry SDK + OTLP exporter; trace id adopted from Cloud Run and stored on `interactions.traceId` |
| Structured logs | Every request: method, path, status, duration, actor, trace id |
| Error log | `api_logs` 5xx with message |
| Audit | Hash-chained, verified daily |
| SLO | 6 objectives; `null` below 30 observations |
| Readiness | `/system/ready`, `/system/health` |
| Usage | `ai_usage_logs` per call with ACU |

### Specified additions

| Signal | Why |
|---|---|
| **RED metrics per route** | Rate, errors, duration — the first thing an on-call engineer needs |
| **Error grouping by signature** | Today the console shows the last ten errors; it does not say which one is happening 400 times |
| **SLO burn-rate alerting** | Multi-window (1 h and 6 h) burn alerts, not threshold alerts — the Google SRE pattern, because a threshold alert either pages too often or too late |
| **Per-language quality SLO** (closes G-17) | Objectives per language, with a downgrade threshold |
| **Command-centre ACT latency SLO** | 400 ms p95 |
| **Agent conduct metrics** | Acceptance, reversal, fault rates per agent |
| **External uptime probe** | From outside the platform's own cloud |
| **Status page** | On a different origin and provider |

### Alert policy

| Severity | Example | Response |
|---|---|---|
| **P1 — page immediately** | No live alert channel; audit chain break; severity-4 unacknowledged > 15 min; readiness failing in production | Human, now |
| P2 — page in hours | SLO burn > 10× budget; a capability with no healthy provider; scheduler stale | Human, same day |
| P3 — ticket | Degraded connector with failover working; ACU > 85 %; language gate degraded | Next working day |
| P4 — report | Equity disparity; cost trend; agent rejection rate | Weekly review |

**An alert that nobody receives is worse than none, because it looks handled.**
`ADMIN_ALERT_EMAIL` must be a mailbox a person reads, and the escalation-path
tile (§13.3) verifies the human end continuously.

---

## 14.5 On-call

| Element | Specification |
|---|---|
| Rotation | Minimum two engineers; a single on-call engineer is a single point of failure in a country with thin depth |
| Runbooks | One per P1 and P2 alert, in the repository, tested in drills |
| Escalation | On-call → engineering lead → programme owner → ministry |
| **Clinical escalation** | A clinical-safety incident goes to the board chair, **not** to engineering |
| Blameless post-mortem | Within 5 working days for any P1; published internally |
| Language | Runbooks in French — the operating language of the team that will run this |

---

## 14.6 Disaster recovery

### Data classes and objectives

| Class | RPO | RTO | Mechanism |
|---|---|---|---|
| Audit log | **0** | 1 h | Synchronous replication + external anchor |
| Clinical records | 5 min | 1 h | Cloud SQL PITR |
| Case and interaction data | 5 min | 1 h | PITR |
| Media | 1 h | 4 h | GCS multi-region |
| Config and credentials | 5 min | 15 min | PITR + Secret Manager versioning |
| Corpus and protocols | 1 h | 4 h | PITR + export |
| Analytics warehouse | 24 h | 24 h | Rebuildable from events |

**RPO 0 for the audit log is deliberate.** Losing five minutes of cases is
recoverable by asking people. Losing five minutes of audit means the platform
cannot prove what it did, and in a clinical system that is unrecoverable.

### Scenarios

| Scenario | Plan | Drilled? |
|---|---|---|
| Instance failure | Cloud Run reschedules | Continuously, implicitly |
| Database corruption | PITR to a timestamp before the corruption | **Locally only** — 3 s restore proven on a 69 MB snapshot with the recovery point honoured (3 post-snapshot rows gone, prior data intact) |
| Region outage | Restore into a second region from backups | **NOT DRILLED** |
| Accidental mass deletion | PITR; audit identifies actor and scope | Partially |
| Key loss | **Unrecoverable for encrypted media.** Key in Secret Manager with versioning is the only control | — |
| Provider loss | Gateway failover; offline provider as the floor | Yes, by test |
| Telecom loss | Channel failover; readiness reports honestly | Partially |
| Ransomware | Immutable backups with object lock, separate credentials | **NOT IMPLEMENTED** |

`scripts/dr-drill.sh` and `scripts/rollback.sh --drill` exist. The cloud
point-in-time restore has **never been executed against a real project** — §17.

---

## 14.7 Business continuity

| Function | If the platform is down |
|---|---|
| Emergency guidance | `/urgence` is static and must render with no JavaScript, no session and no network beyond the first byte |
| Escalation | Workers hold the case list from the last sync in the offline PWA cache |
| Citizen contact | SMS broadcast from the operator console, outside the application path |
| Clinical protocols | Exported PDF held by every health area — **paper is the final fallback** |
| Communication | Status page on separate infrastructure |

**Maximum tolerable outage: 4 hours in daylight hours.** Beyond that the
programme's agreed fallback is the paper protocol set and the existing referral
chain, and the ministry is notified to activate it. This is written down because
a national health service must know at what point it stops waiting.

### Secret rotation (closes `SECURITY.md` §7 gap 6)

| Secret | Procedure | Frequency |
|---|---|---|
| `SESSION_SECRET` | Dual-secret verification window → rotate → retire old. All sessions survive | 180 days |
| `DATA_ENCRYPTION_KEY` | **A migration, not a config change.** Both keys available; re-encrypt and re-index every value; phone blind indexes must be rebuilt or sign-in breaks | Only on compromise |
| `CRON_SECRET` | Rotate; update the scheduler caller | 180 days |
| Vendor credentials | Console; immediate on the instance, ≤ 60 s elsewhere | On compromise or vendor policy |
| `BOOTSTRAP_TOKEN` | Single-use by design | Per use |

---

## 14.8 Testing strategy

### Built

| Layer | Coverage |
|---|---|
| Unit | Every deterministic rule: danger signs, severity, escalation, SLA, state machine, rate limits, gates, protocol engine |
| Integration | Route handlers with a real PGlite database |
| Contract | Environment contract, migration/schema agreement, standalone closure |
| Security | Redirect, JSON-LD escaping, storage prefixes, health disclosure, webhook signatures, inbound limits |
| Adversarial | 181 cases |
| Accessibility | axe-core over every page |
| Performance | 3G profile budgets |
| PWA | Service worker registration, control, offline render |
| E2E smoke | 37 behavioural checks against a running production build |

**Total: 1 749 tests in 92 files, 823 s, all offline.**

### Specified additions

| Layer | Specification |
|---|---|
| **Agent conformance** | Every agent: cannot exceed autonomy, cannot write outside scope, cannot exceed budget, produces resolvable evidence. One shared suite over the registry, so a new agent is tested by existing to it |
| **Evidence resolution** | Property test: no proposal is persisted with unresolvable evidence |
| **Reversal** | Every `agent_actions.reversal` actually reverses, verified by state comparison |
| **Tenancy isolation** | Property test: no query returns another tenant's row, across every scoped route |
| **Retrieval quality** | A golden set per module and language; regression on recall@k and citation correctness |
| **Clinical fidelity** | Every answer in the golden set traced to signed protocol text |
| **Language gate** | A degraded language must change behaviour, proven per language |
| **Chaos** | Provider down, database slow, scheduler stopped, storage down, telecom down — the platform must degrade visibly, never silently |
| **Load** | Multi-source, with the two limiters raised, to establish a real sustained figure |
| **DR** | Quarterly restore drill against a real project, timed |

### Test principles

1. **Every deterministic rule has a test.** A rule without one is not a rule.
2. **A failing test is a finding, never a flake to be skipped.** Skipping,
   disabling or quarantining a test is forbidden, including for agents.
3. **Offline by default.** A test that needs an API key is not a test of this
   platform.
4. **Adversarial cases are first-class.** The 181 existing ones stay and grow.
5. **Golden sets are versioned and reviewed** like protocols — they encode what
   "correct" means.

---

## 14.9 The operations handover

For a sovereign tenant, the platform is only delivered when its own people can
run it.

| Deliverable | Content |
|---|---|
| Runbooks | Every P1/P2, in French, drilled |
| Architecture walkthrough | This document set |
| Access | Their own cloud project, their own credentials, their own board |
| Drills | DR restore, rollback, provider failure, channel failure — performed by their team |
| Monitoring | Their own alerting, their own on-call |
| Exit | Proven export, performed once during handover |

**Handover is complete when their engineer restores the database from backup
without the original team in the room.** Not when the documentation is
delivered.
