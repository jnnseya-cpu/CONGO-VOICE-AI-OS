# 02 — Market Gap Deep Review

A forensic comparison against what actually exists, followed by the gaps inside
*this* platform. No gap is listed without a named remedy and a file to change.

---

## 2.1 The competitive field, honestly assessed

### Category A — Consumer health AI

| Product | Does well | Fails here |
|---|---|---|
| Ada Health | Strong symptom model, 30+ languages, regulated as a medical device in the EU | Smartphone-only; no Lingala/Kikongo/Tshiluba; no escalation to a named local worker; no ministry sign-off |
| Babylon / eMed | Clinician-in-the-loop at scale, NHS integration | Requires clinicians per capita the DRC does not have; collapsed commercially where payer mix was thin |
| K Health | Good triage-to-clinician funnel | US insurance model; no offline path |
| WHO Health Alert (WhatsApp) | Trusted brand, real reach in outbreaks | Broadcast, not dialogue; no case management; no triage |

**Gap A1 — none of them answer a 2G voice call.** The most vulnerable user has
a feature phone, no data, and cannot read. This platform's IVR path
(`channels/ivr.ts` + `hooks/ivr/twilio/*`) is the differentiator, and it is
already built.

**Gap A2 — none escalate into a real, accountable chain.** They end with "see a
doctor". This platform opens a `case`, assigns it by module and territory,
starts an SLA clock, notifies by the first live channel, and escalates on
breach — `ai/agents/workflow.ts`, `core/scheduler.ts` (`sla_sweep`,
`blocked_cases`).

### Category B — Agricultural advisory

| Product | Does well | Fails here |
|---|---|---|
| PlantVillage Nuru | Offline cassava/maize disease detection on-device, genuinely excellent | Single-purpose; no advisory dialogue; no market prices; no officer escalation |
| Digital Green | Video extension at real scale | Human-mediated, not on-demand; no individual case |
| Hello Tractor / Apollo Agriculture | Strong operational models | Credit/asset products — they require a payment rail this platform deliberately does not have |
| FAO/WFP data portals | Authoritative data | Built for analysts, not for a farmer with a question |

**Gap B1 — advisory is separated from diagnosis and from market reality.** This
platform already joins them: `ai/agents/agriculture.ts` with vision-based crop
photo analysis, `ai/tools/market.ts` for prices, `ai/tools/weather.ts`,
`planting_calendars`, `input_registry`, and cluster detection
(`ai/agents/clusters.ts`) that turns many individual reports into one outbreak
signal.

### Category C — Education

| Product | Does well | Fails here |
|---|---|---|
| Khan Academy / Khanmigo | Outstanding content and tutoring | English/French-centric, smartphone and bandwidth assumed, no child-safety layer for an unsupervised shared handset |
| Eneza Education | SMS/USSD learning in Kenya/Ghana — the closest real analogue | Narrow curriculum, no voice, no teacher case management |
| Ustad Mobile / Kolibri | Genuinely offline-first | Content delivery, not dialogue or assessment |

**Gap C1 — no voice-native tutoring in a national language with a child-safety
layer.** This platform has `ai/education/child-safety.ts`,
`ai/education/quiz.ts`, `ai/education/spaced-repetition.ts`,
`learner_profiles`, `learning_evidence`, and a safeguarding path
(`safeguarding_records`) that routes a disclosure to a human, not to a chatbot.

### Category D — Government digital platforms

| Product | Does well | Fails here |
|---|---|---|
| Palantir Foundry | Ontology, lineage, access control at state scale | Analyst-facing; costs more than the entire programme; no citizen channel |
| ServiceNow | Workflow and case management of enterprise quality | Licence model, English-first, no voice-in-local-language front door |
| Estonia X-Road | The gold standard for sovereign data exchange | An integration bus, not a service; assumes digital identity penetration |
| GovStack / DPI stacks | Right principles, reusable building blocks | Reference architecture, not a running national service |

**Gap D1 — nothing combines the citizen front door with the ministry
instrument.** This platform's analytics (`v1/analytics/*`), reporting pipeline
(`report-jobs`, `report_definitions`, `reports`) and small-count suppression
mean the same event that helped one mother also becomes a province-level
indicator — with denominators stated, not implied.

### Category E — Foundation model platforms

| Product | Does well | Fails here |
|---|---|---|
| OpenAI / Anthropic / Gemini APIs | Capability, reliability, tooling | Data leaves the country; no Lingala/Kikongo/Tshiluba competence; price and policy changes are unilateral; zero availability guarantee in a blackout |
| Vertex AI / Bedrock | Regional hosting, enterprise controls | Still no national-language competence; still a dependency the programme does not control |
| Local fine-tunes (Masakhane, Lelapa, etc.) | Real progress on African NLP | Research artefacts; not production-operable; no safety layer |

**Gap E1 — vendor dependency is an availability risk for a public service.**
This platform answers it with `ai/gateway.ts`: one interface, five providers,
residency enforcement (`core/residency.ts`), and an offline provider
(`ai/providers/mock.ts`) that keeps the *entire platform usable with no API keys
at all*. Every test runs offline. That is not a fallback; it is a floor.

---

## 2.2 Where users are underserved today — inside this platform

This is the honest internal audit. Each is a real gap in the current build.

| # | Gap | Evidence | Remedy | Doc |
|---|---|---|---|---|
| G-01 | Every user type gets a dashboard of the past; none gets a prioritised, actionable next step | `src/app/(app)/tableau-de-bord/*` are read-only renderings | AI Command Centres with bounded execution | §04 |
| G-02 | Only one agent class exists — citizen-facing specialists. No operational, supervisory or platform agents | `ai/agents/` holds 12 agents, all request-scoped | Three new agent tiers: workforce, platform, governance | §05 |
| G-03 | No agent memory beyond a user profile; every interaction starts cold | `ai/agents/personalisation.ts` reads `users.preferences` only | Four-layer memory: working, episodic, semantic, procedural | §05.8, §09.6 |
| G-04 | No vector retrieval. `kb_chunks` exists but search is lexical | `ai/knowledge/index.ts` | pgvector + hybrid BM25/dense retrieval with per-language embeddings | §09.5 |
| G-05 | No knowledge graph. Outbreak clustering is statistical, not relational | `ai/agents/clusters.ts` | Entity graph over citizens, facilities, territories, protocols, crops, pathogens | §09.7 |
| G-06 | Faults are detected but never repaired. A red check waits for a human | `core/status.ts`, `api/v1/system/health` | Self-managing platform agents with a reversible-action whitelist | §05.6 |
| G-07 | No behavioural threat detection. Failed logins are logged, nothing watches them | `docs/SECURITY.md` §7 "No intrusion detection" | Security Command Centre with behavioural baselining | §11.5 |
| G-08 | Case reads are module-scoped but not territory-scoped | `core/rbac.ts` `ROLE_MODULE_SCOPE` | Territory scope as a first-class RBAC dimension | §11.3 |
| G-09 | A finished report is downloadable by any `report:export` holder, across organisations | `docs/SECURITY.md` §7 | Tenancy-scoped report ACL | §11.3 |
| G-10 | No cost attribution below tenant. A province cannot see its own spend | `core/metering.ts` aggregates by tenant | ACU attribution by territory, module, channel and agent | §12.3 |
| G-11 | No predictive layer. Everything is reactive | — | Forecasting for outbreak, crop risk, dropout, demand and spend | §09.8 |
| G-12 | No reinforcement from outcomes. Feedback is stored, never closes a loop | `feedback`, `ai_overrides` | Outcome-weighted retrieval and protocol-gap detection | §05.9 |
| G-13 | No digital-worker abstraction. Work is per-request; nothing runs a long task | — | Durable agent runs with checkpointing and resumption | §08.6 |
| G-14 | No connector framework. Each integration is bespoke | `channels/twilio.ts`, `channels/whatsapp.ts` | Typed connector registry with health, quota and failover | §07 |
| G-15 | Propagation of console-set credentials is 1 minute, not atomic | `core/credentials.ts` TTL | Documented; add push invalidation via the event bus | §08.5 |
| G-16 | Audit is hash-chained but not externally anchored | `core/audit.ts` | Daily Merkle root anchored to an append-only external store | §11.7 |
| G-17 | No per-language quality SLO. Gates exist; objectives do not | `ai/language/gates.ts`, `slo.ts` | Per-language objectives with downgrade thresholds | §14.4 |
| G-18 | Disaster recovery is drilled locally only; cloud PITR untested | `launch-audit/evidence-ledger.md` | Full DR architecture with RPO/RTO per data class | §14.6 |

---

## 2.3 Where the programme loses money today

Not revenue — **avoidable cost**. For a grant-funded service this is the same
thing, and it is the honest version of a "commercial weakness" analysis.

| Leak | Mechanism | Annual impact at national scale | Remedy |
|---|---|---|---|
| Model over-selection | Every interaction uses the default LLM regardless of difficulty | A courtesy turn ("merci") costs the same as a triage | Difficulty-routed model cascade: SLM for courtesy/menu/LID, LLM only for reasoning — §05.10 |
| Re-transcription | Audio re-sent on retry and on resume | Duplicate STT spend on the most expensive capability | Content-addressed STT cache keyed by audio hash — §08.7 |
| Unbounded retrieval | Full protocol text in context on every turn | Token spend scales with corpus, not with need | Chunked retrieval with a token budget per module — §09.5 |
| No prompt caching | System prompts resent per call | 60–90 % of prompt tokens are identical across calls | Provider prompt caching, cache-key by prompt version — §08.7 |
| Idle Cloud Run minimum instances | Capacity held for a traffic shape that is diurnal and rural | Paying peak for an off-peak country | Scheduled min-instance curve by province time-of-day — §14.3 |
| Report regeneration | Scheduled reports rebuilt even when inputs are unchanged | Compute and storage on identical artefacts | Input-hash memoisation in `report-jobs` — §06.9 |
| Unused provider keys | Multiple vendors live with no traffic split policy | Minimums and commitments with no utilisation | Gateway routing policy with a cost objective — §05.10 |

---

## 2.4 Where automation is missing

| Area | Today | In the AI-OS |
|---|---|---|
| Case triage ordering | Worker sorts the queue manually | Risk-ordered with an explained ranking — §04.3 |
| Follow-up drafting | Worker writes each message | Drafted in the citizen's language, worker approves — §05.3 |
| Outbreak detection | `clusters.ts` detects, a human interprets | Signal, hypothesis, suggested notification and draft brief — §05.4 |
| Protocol gaps | Discovered when an answer is wrong | Detected from low-confidence clusters and override patterns — §05.9 |
| Language degradation | Gate downgrades the channel | Corpus request, sample targeting, reviewer queue — §05.5 |
| Spend control | Cap, then degraded mode | Forecast, pre-emptive routing change, funder alert — §05.11 |
| Incident response | Human reads logs | Health agent → bug agent → repair agent → release agent — §05.6 |
| Report commentary | Analyst writes the narrative | Drafted with denominators and caveats, analyst signs — §05.2 |
| Onboarding a province | Manual configuration | Territory provisioning workflow with protocol and language checks — §06.11 |

---

## 2.5 The summary judgement

The platform is **not** behind the market on capability. On channel reach,
deterministic safety, offline operability, auditability and language honesty it
is ahead of everything surveyed. It is behind on exactly three things, and they
are the subject of this document set:

1. **Autonomy** — it observes and reports where it should decide and act.
2. **Memory and retrieval** — it has data where it should have knowledge.
3. **Replicability as a product** — it is one country's system where it should
   be a sovereign platform any ministry can run.
