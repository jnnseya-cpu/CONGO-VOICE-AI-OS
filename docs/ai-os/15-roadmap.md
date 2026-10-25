# 15 — Build Roadmap

Five phases. Each names what is built, what must be true to exit it, and what it
costs in engineering. Phase 0 is **complete** — this is not a greenfield plan.

---

## Phase 0 — Foundation — COMPLETE

Built and in the repository today.

| Delivered | Evidence |
|---|---|
| 5 citizen channels: IVR, USSD, SMS, WhatsApp, PWA | `channels/`, 9 webhook routes |
| 3 service modules with 12 AI agents | `ai/agents/` |
| Deterministic safety: danger signs, severity, escalation | `ai/safety.ts`, `agents/risk.ts`, tested |
| Case management, 13 states, SLA, bridged calls | `cases`, 11 routes |
| 5 languages with confidence gates | `ai/language/`, `languageEnum` |
| Clinical review boards with quorum sign-off | `ai/review/`, 6 routes |
| Protocol lifecycle with versions and signatories | `ai/protocols/lifecycle.ts` |
| Multi-provider AI gateway + complete offline provider | `ai/gateway.ts`, `providers/mock.ts` |
| ACU metering, caps, degraded mode | `core/metering.ts` |
| Hash-chained audit, verified daily | `core/audit.ts` |
| RBAC: 7 roles, 27 permissions, no inline checks | `core/rbac.ts` |
| Encryption: AES-256-GCM, HKDF purposes, phone blind index | `core/crypto.ts`, `core/phone.ts` |
| MFA with 15-minute step-up; break-glass | `core/mfa.ts` |
| Scheduler: 14 jobs | `core/scheduler.ts` |
| 6 SLOs with honest unmeasured reporting | `core/slo.ts` |
| Offline PWA with outbox and background sync | `sw-source.js` |
| Reporting: CSV/XLSX/PDF, async jobs, small-count suppression | `report-jobs`, `reporting.ts` |
| Vendor credentials from the admin console | `core/credentials.ts`, `/admin/providers` |
| Public site, 15 pages + 29 SEO-gated articles | `(public)/` |
| **1 749 tests in 92 files, all offline** | `npm test` |

**What Phase 0 is missing:** autonomy, retrieval, graph, prediction, self-healing,
behavioural security, and sovereign replicability. That is Phases 1–4.

---

## Phase 1 — Intelligence Foundation — 3 months

Make the platform *know* rather than merely *store*. Nothing user-facing changes
except answer quality.

| Workstream | Deliverable | Section |
|---|---|---|
| Retrieval | pgvector on `kb_chunks`; hybrid BM25 + dense + protocol-exact; per-language embeddings; citation enforcement | §09.5 |
| Knowledge graph | `kg_nodes`, `kg_edges`; referral, protocol, crop–pathogen and curriculum traversals | §09.7 |
| Model cascade | Difficulty signature; R0–R3 routing; SLM provider | §05.10 |
| Caching | Prompt cache, STT content cache, retrieval cache | §08.7 |
| Cost attribution | ACU by province, module, channel, agent, model class, language | §12.3 |
| Warehouse | Event-fed analytics store; dimensional model; `dim_population` | §09.9 |

### Exit criteria

| Criterion | Target |
|---|---|
| Retrieval recall@5 on the golden set | ≥ 0.9 per module, per language |
| Clinical answers carrying a resolvable citation | **100 %** |
| Cost per interaction vs. Phase 0 baseline | **−60 %** |
| R0 share | ≥ 35 % |
| Answer quality (board-rated sample) | No regression |
| SLO attainment | No regression |

**Engineering:** 3 engineers × 3 months. **Risk:** embedding quality in Lingala,
Kikongo and Tshiluba is unknown. Mitigation: lexical retrieval remains the floor;
a language whose embeddings fail falls back to BM25 and the protocol engine, and
the gate reports it.

---

## Phase 2 — Agent Runtime and Command Centres — 4 months

The visible transformation.

| Workstream | Deliverable | Section |
|---|---|---|
| Agent runtime | 7 tables, registry, authority, executor, proposals, action ledger, watchdog, durable runs | §06.12, §09.4 |
| Governance | AI Governance Agent, conduct report, earned promotion, kill-switch | §05.7, §05.12 |
| Memory | Four layers with the privacy rules enforced in code | §05.8 |
| Workforce agents | Triage Ordering, Follow-up Drafting, Cluster, National Analyst, Equity Monitor, Cost & Funding | §05.4 |
| Command centres | All seven roles; ACT/KNOW/ASK; offline degradation | §04 |
| Tests | Agent conformance suite; evidence resolution; reversal; tenancy isolation | §14.8 |

### Rollout discipline

**Every agent ships at L0.** Promotion is earned under §05.7: 200 proposals,
≥ 90 % acceptance, zero reversals. No agent reaches L3 in Phase 2 except the two
with an explicit safety rationale — release rollback and inbound rate tightening.

### Exit criteria

| Criterion | Target |
|---|---|
| Proposal acceptance rate | ≥ 70 % across workforce agents |
| Proposals with unresolvable evidence | **0** |
| Writes outside declared scope | **0** |
| Worker time from queue-open to first action | **−40 %** |
| Severity-4 time to human acknowledgement | **−30 %** |
| Command-centre ACT p95 | ≤ 400 ms |
| Kill-switch drill | Executed, platform fully functional after |

**Engineering:** 4 engineers + 1 designer × 4 months.
**Risk:** agents that propose confidently and wrongly destroy worker trust
permanently. Mitigation: L0 default, mandatory evidence, visible rejection
analysis, and the rule that an agent which escalates has succeeded.

---

## Phase 3 — Autonomy, Prediction and Security — 4 months

| Workstream | Deliverable | Section |
|---|---|---|
| Self-managing platform | Health, Bug Detection, Auto-Repair, Release, Infrastructure, Test agents | §05.6 |
| Prediction | 6 models with mandatory intervals and base rates; outcome scoring and auto-retirement | §05.11, §09.8 |
| Security command centre | 12 detections, behavioural baselining, Abuse agent | §11.5 |
| Audit anchoring | Daily Merkle root to an external append-only store | §11.7 |
| Territory scope + report tenancy | Closes G-08 and G-09 | §11.3 |
| `auditor` role + evidence packs | | §04.9, §11.7 |
| Device trust for staff | | §11.4 |
| Observability | RED metrics, error grouping, burn-rate alerting, per-language SLOs, external probe, status page | §14.4 |

### Exit criteria

| Criterion | Target |
|---|---|
| P1 incidents auto-remediated without a human | ≥ 50 % |
| Mean time to detect | ≤ 2 min |
| Mean time to remediate (auto) | ≤ 5 min |
| Auto-repair actions reversed by the watchdog | ≤ 5 % |
| Prediction calibration (interval coverage) | ≥ 80 % at the stated level |
| Security detections with a documented response | 100 % |
| **Independent penetration test** | **Performed, findings closed or accepted in writing** |
| DR drill against a real cloud project | Performed, RTO met |

**Engineering:** 4 engineers + 1 SRE + 1 security engineer × 4 months.
**Risk:** an auto-repair agent that makes an incident worse. Mitigation: a
closed whitelist of six reversible actions, a watchdog that reverses
automatically, and a hard stop after two failed remedies.

---

## Phase 4 — Sovereign Platform — 6 months

| Workstream | Deliverable | Section |
|---|---|---|
| Tenant provisioning | 10-step gated workflow; residency declaration; protocol forking; board appointment | §06.11 |
| Tenant export | Full, open-format, on-demand | §06.11 |
| Developer platform | Service accounts, scoped keys, sandbox tenant, signed webhooks, OpenAPI | §10.8 |
| Connector registry | Typed connectors with health, quota, failover, residency | §07.1 |
| Localisation toolkit | Add a language with its own gates; add a module | §06.10 |
| Operations handover | Runbooks, drills, their engineer restores from backup unaided | §14.9 |
| Open components | Protocol engine, language gates, channel adapters published | §12.5 |

### Exit criteria

| Criterion | Target |
|---|---|
| Second sovereign instance live | 1, operated by its own ministry |
| Provisioning time, contract to first citizen | ≤ 90 days |
| Cross-tenant data leakage | **0**, proven by property tests |
| Tenant export and reimport | Verified round-trip |
| Their engineer restores from backup unaided | Demonstrated |
| Integrator using the sandbox then production | ≥ 1 |

**Engineering:** 5 engineers × 6 months + programme and legal.
**Risk:** sovereign deployment without local clinical governance produces a
platform speaking without authority. Mitigation: §06.11 step 6 — the board
signs before the service opens, enforced by `clinicalReadiness()`.

---

## Phase 5 — Continental Scale — ongoing

| Workstream | Deliverable |
|---|---|
| Multi-country federation | Cross-border outbreak signals with **aggregate-only** exchange, never citizen records |
| Language expansion | Beyond 5 — Kinyarwanda, Luganda, Hausa, Wolof, Amharic as tenants require |
| Regional inference | In-region or national model hosting to remove the residency trade-off |
| Shared protocol library | Signed clinical content reusable across tenants, each re-signed locally |
| Research programme | Published, peer-reviewed effectiveness studies with consented, de-identified data |

---

## 15.6 Dependency graph

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
  │            │            │            │
  │            │            │            └─ needs: tenancy isolation proven (P3)
  │            │            └─ needs: agent runtime + ledger (P2)
  │            └─ needs: retrieval + cost attribution (P1)
  └─ needs: nothing. Starts now.

PARALLEL, NOT BLOCKING, START IN PHASE 1:
  · Population denominators from INS/WorldPop  ──► blocks §04.5 and all equity work
  · Operator agreements: short-code, zero-rating ──► blocks true channel economics
  · Independent penetration test                 ──► blocks Phase 3 exit
  · Review board appointments per tenant         ──► blocks every service opening
```

**The two items that will actually delay this programme are not engineering.**
They are population denominators and operator agreements. Both are procurement
and negotiation, both have long lead times, and both should start on day one of
Phase 1.

---

## 15.7 Commercial and programme objectives per phase

| Phase | Programme objective | Funding posture |
|---|---|---|
| 0 → 1 | Prove pilot safety and unit cost | Donor grant |
| 2 | Prove worker time saved and escalation speed | Donor + first government line |
| 3 | Prove reliability and independent security assurance | Government appropriation begins |
| 4 | First sovereign licence; operations transferred | Appropriation + licensing |
| 5 | Regional standard; research evidence published | Appropriation + licensing + research grants |

---

## 15.8 What is deliberately not on this roadmap

| Not building | Why |
|---|---|
| Payments, wallets, settlement, marketplace | No money in this platform, by instruction and design |
| A citizen mobile app store presence | The PWA covers smartphone users; the majority are on feature phones |
| Fine-tuning on citizen transcripts | Only with explicit consent and board approval; not a default |
| An agent that answers a citizen autonomously beyond protocol | §01.8 |
| Real-time video | Bandwidth the users do not have |
| A second frontend framework | One deployable is an operational asset in a thin-depth environment |
