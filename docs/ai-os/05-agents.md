# 05 — Agent Architecture

The complete agent catalogue: what exists, what is added, and the governance
that keeps every one of them inside its authority.

---

## 5.1 The four tiers

```
┌───────────────────────────────────────────────────────────────┐
│ TIER 4 — GOVERNANCE          AI Governance Agent              │
│ Sets and enforces authority. Can suspend any agent below.     │
├───────────────────────────────────────────────────────────────┤
│ TIER 3 — PLATFORM            Health · Bug · Repair · Release  │
│ Keeps the system running. Never touches citizen content.      │
├───────────────────────────────────────────────────────────────┤
│ TIER 2 — WORKFORCE           Triage · Analyst · Equity · Cost │
│ Prepares and proposes work for humans. Bounded autonomy.      │
├───────────────────────────────────────────────────────────────┤
│ TIER 1 — SERVICE             Health · Agri · Edu · Risk · …   │
│ Answers the citizen. EXISTS TODAY. Request-scoped, L0 only.   │
└───────────────────────────────────────────────────────────────┘
```

**Tier 1 agents have no autonomy at all** and never will. They transform an
input into a structured answer inside one request. The deterministic safety
layer sits *outside* them, in `ai/safety.ts` and `ai/protocols/engine.ts`, and
decides severity and escalation regardless of what the agent returned.

---

## 5.2 The agent contract

Every agent in tiers 2–4 implements one interface.

```ts
export interface Agent<TInput, TOutput> {
  /** Stable identifier; the primary key of agent_definitions. */
  id: string;
  tier: 1 | 2 | 3 | 4;
  /** The permission an actor must hold for this agent to act on their behalf. */
  requires: Permission[];
  /** Hard ceiling. agent_authority may lower it, never raise it above this. */
  maxAutonomy: "L0" | "L1" | "L2" | "L3";
  /** What wakes it. */
  triggers: AgentTrigger[];
  /** Reads it is permitted. Anything else is a fault, not a fallback. */
  reads: DataScope[];
  /** Writes it is permitted, each with a reversal. */
  writes: WriteScope[];
  /** ACU ceiling per run. Exceeding it aborts the run and raises a fault. */
  budgetAcu: number;
  /** Wall-clock ceiling per run. */
  timeoutMs: number;
  run(input: TInput, ctx: AgentContext): Promise<AgentResult<TOutput>>;
}

export interface AgentResult<T> {
  outcome: "proposed" | "executed" | "escalated" | "no_action" | "faulted";
  proposals: Proposal[];      // each with mandatory evidence[]
  output?: T;
  reasoning: string;          // one paragraph, for the human, in French
  evidence: EvidenceRef[];    // must resolve to real rows
  acuSpent: number;
  escalation?: { to: Role | "human_review"; reason: string };
}
```

### Four invariants, enforced in code not convention

1. **Evidence resolves or the result is void.** `ctx.verifyEvidence()` runs
   before any proposal is persisted. Unresolvable reference → `faulted`.
2. **Writes are declared and reversible.** A write outside `writes[]` throws.
   Every write registers its inverse in `agent_actions.reversal`.
3. **Budget is hard.** `budgetAcu` is checked against `core/metering.ts` before
   each model call. Over budget → abort, fault, no partial action.
4. **Escalation is not failure.** An agent that escalates has succeeded. The
   measured failure modes are *acting beyond authority* and *silently not
   acting*.

### `AgentContext`

```ts
interface AgentContext {
  runId: string;                  // uuid v7, primary key of agent_runs
  actor: { userId: string; role: Role } | { system: true };
  tenantId: string | null;
  territory: string | null;
  autonomy: AutonomyLevel;        // resolved from agent_authority
  db: Database;                   // scoped — row filters already applied
  ai: AiGateway;                  // budget-wrapped
  memory: AgentMemory;            // §5.8
  emit(event: PlatformEvent): Promise<void>;
  verifyEvidence(refs: EvidenceRef[]): Promise<boolean>;
  checkpoint(state: unknown): Promise<void>;   // durable runs, §08.6
}
```

---

## 5.3 Tier 1 — Service agents (EXISTS)

Twelve agents in `src/server/ai/agents/`. Preserved unchanged; the table
records what they are so nothing is lost.

| Agent | File | Purpose | Output schema |
|---|---|---|---|
| Orchestrator | `orchestrator.ts` | Runs one interaction end to end: autosave → STT → language → personalisation → specialist → risk → localise → workflow → TTS → audit | `FinalAnswer` |
| Health | `health.ts` | Symptom understanding against approved protocol text; attaches safeguarding | `HealthTriageResult` |
| Agriculture | `agriculture.ts` | Crop/livestock advisory, photo diagnosis, calendar and input context | `AgricultureAssessmentPlus` |
| Education | `education.ts` | Lesson, explanation, quiz generation against curriculum | `EducationAssessmentPlus` |
| Risk | `risk.ts` | Scores an interaction. **Deterministic thresholds**; the model never sets severity | `RiskAssessment` |
| Workflow | `workflow.ts` | Opens a case, decides auto-creation, assigns by module and territory | `Case` |
| Language | `language.ts` | Detects, analyses, localises, applies glossary | `LanguageAnalysis` |
| Clusters | `clusters.ts` | Detects multi-report patterns in a territory | `ClusterCandidate[]` |
| Courtesy | `courtesy.ts` | Classifies greetings and closings so they do not consume a reasoning model | `CourtesyClass` |
| Personalisation | `personalisation.ts` | Profile context, language memory | `ProfileContext` |
| Learning | `learning.ts` | Records samples, retrieves learning context, daily review sample | `LearningContext` |
| Reporting | `reporting.ts` | Admin and analytics aggregation with small-count suppression | `AdminStats` |

**Extension to Tier 1 (EXTEND):** each gains a `retrievalBudget` and a
`modelClass` hint so §5.10's cascade can route it. No behavioural change.

---

## 5.4 Tier 2 — Workforce agents (NEW)

These are the "enterprise multi-agent ecosystem" of the brief, translated into
the roles a public-health platform actually has. Where a commercial function has
no honest equivalent here, that is stated rather than invented.

### Mapping from the generic brief

| Brief's agent | Equivalent here | Why |
|---|---|---|
| CEO / COO Agent | **Programme Operations Agent** | A programme, not a company |
| CFO Agent | **Cost & Funding Agent** | Budget stewardship, not profit |
| CRO / Sales / Pricing / Monetisation | *(none)* | No revenue from users. §12 covers institutional funding, and it is a human negotiation |
| Payment Agent | *(none)* | **No payment system exists in this platform** |
| Fraud Agent | **Abuse & Integrity Agent** | No money to defraud; there is service abuse, bot traffic and data exfiltration |
| CMO / Marketing Agent | **Public Awareness Agent** | Reach and uptake, never persuasion of a patient |
| Customer Support / Success / Retention | **Citizen Experience Agent** | Retention of a citizen is not a goal; *being useful* is |
| KYC / AML / Compliance Agents | **Data Protection Agent** + **Clinical Compliance Agent** | GDPR/Congolese data law and clinical governance; no financial compliance without finance |
| CTO / Engineering / QA Agents | Tier 3 — §5.6 | |

### 5.4.1 Triage Ordering Agent

| | |
|---|---|
| **Purpose** | Rank a worker's queue and explain the ranking in one sentence |
| **Tier / autonomy** | 2 / max **L1** |
| **Triggers** | Command-centre open; new case assigned; SLA clock crossing 60 min; severity change |
| **Inputs** | `cases`, `risk_assessments`, `case_events`, `safeguarding_records`, worker territory and module scope |
| **Processing** | Deterministic priority formula (§04.3) computes the order. One SLM call renders the explanation. **The model never reorders.** |
| **Outputs** | Ordered queue + one-sentence rationale per top-5 item |
| **Writes** | None. Ordering is a view |
| **Escalation** | Severity-4 unacknowledged > 15 min → notify `escalationRoleFor(module)` and `gov_admin` |
| **APIs used** | Gateway `llm` (SLM class), no external |
| **Budget** | 0.3 ACU per render, cached 60 s |
| **Value** | Removes the single largest source of delay between a danger sign and a human: a worker scanning an unsorted list |

### 5.4.2 Follow-up Drafting Agent

| | |
|---|---|
| **Purpose** | Write the next message to a citizen, in their language, for a worker to approve |
| **Autonomy** | max **L2** — drafted, never sent autonomously |
| **Triggers** | `follow_ups` due; case transition to `awaiting_citizen`; reminder scheduled |
| **Inputs** | Case history, prior transcripts, protocol text, citizen's language and literacy signal |
| **Processing** | French canonical draft → `localise()` → `scriptText()` → `toSpokenText()` if the delivery channel is voice |
| **Outputs** | Draft in the citizen's language + French back-translation so a non-speaking worker can check it |
| **Writes** | `notifications` (status `draft` only) |
| **Guardrails** | Claim checking (`checkOutboundClaims`) before the draft is shown; no dose, no diagnosis, protocol citation mandatory for clinical content |
| **Escalation** | Language confidence below gate → draft in French only, flagged |
| **Value** | A worker serving 40 cases writes 40 messages a day in a language the platform can draft better than they can type on a phone |

### 5.4.3 Cluster & Outbreak Agent (EXTEND of `clusters.ts`)

| | |
|---|---|
| **Purpose** | Turn many individual reports into one actionable signal |
| **Autonomy** | max **L1** for health, **L1** for agriculture. Never L2+: declaring an outbreak is a State act |
| **Triggers** | Scheduler `clusters` step (new, hourly); cluster candidate crossing threshold |
| **Inputs** | `interactions`, `health_triage_records`, `agriculture_reports`, `territories`, `provinces`, seasonal baselines |
| **Processing** | **Deterministic** spatial-temporal scan (space-time permutation scan statistic, as used in public-health surveillance) produces the candidate. The model only writes the hypothesis narrative and suggests what data would confirm or refute it |
| **Outputs** | Candidate cluster: territory, window, case count, expected count, p-value, shared features, suggested confirmation step |
| **Writes** | `agri_clusters` (and a new `health_clusters`), status `candidate` |
| **Escalation** | Above the configured threshold → notify `gov_admin` for the province and the relevant field role |
| **Honesty rule** | Expected count and the denominator are always rendered. A cluster with no baseline is reported as *"no baseline — cannot assess"*, never as a signal |
| **Value** | Early detection is the single highest-value output a national system of this shape can produce |

### 5.4.4 National Analyst Agent

| | |
|---|---|
| **Purpose** | Draft the weekly and monthly brief a ministry actually reads |
| **Autonomy** | max **L2** |
| **Triggers** | `scheduled_reports`; manual commission; cluster confirmation |
| **Inputs** | `reports`, `report_definitions`, analytics aggregates, SLO attainment, language health, ACU consumption |
| **Processing** | Figures computed deterministically by `reporting.ts`; the model writes prose **around numbers it is given** and is forbidden to compute or restate any number not in its input (enforced by a numeric-claim check against the input set) |
| **Outputs** | Draft brief with denominators, caveats, and a "what we cannot say" section |
| **Writes** | `reports` status `draft` |
| **Escalation** | Any figure it cannot source → section marked `[DONNÉE MANQUANTE]`, never estimated |
| **Value** | Replaces the quarterly report that arrives too late with a weekly one that arrives on time |

### 5.4.5 Equity Monitor Agent

| | |
|---|---|
| **Purpose** | Find who the platform is failing |
| **Autonomy** | max **L1** |
| **Triggers** | Daily |
| **Inputs** | Interactions by language, province, channel, gender where volunteered; population denominators; `language_quality` |
| **Processing** | Deterministic disparity ratios against population share; model explains |
| **Outputs** | Ranked under-service list: *"Tshiluba is 11 % of the population and 2 % of interactions; the gate has been degraded for 19 days"* |
| **Escalation** | Disparity above threshold for 14 days → `gov_admin` + partner organisations in that territory |
| **Value** | The failure mode of a national service is serving the reachable and calling it national. This agent's whole purpose is to make that visible |

### 5.4.6 Cost & Funding Agent

| | |
|---|---|
| **Purpose** | Hold unit cost down and give funders defensible numbers |
| **Autonomy** | max **L1** for routing proposals; **L3** for one action only — switching the model cascade to a cheaper class when the monthly ACU cap is within 10 %, because the alternative is degraded mode for citizens |
| **Triggers** | Daily; ACU cap at 70 / 85 / 95 %; provider price change |
| **Inputs** | `ai_usage_logs`, ACU conversion table, cap configuration, interaction volume trend |
| **Processing** | Forecast to month end; attribute spend by province/module/channel/agent; identify the top three leaks from §02.3 |
| **Outputs** | Trajectory, attribution, proposed routing change with the quality cost stated |
| **Writes** | `admin_config` ACU routing policy (L3 case only, audited, reversible, notified) |
| **Escalation** | Forecast exceeds budget with no acceptable routing change → `gov_admin` with the funding gap in USD |
| **Value** | §02.3 identifies seven cost leaks. This agent is what keeps them closed as traffic changes |

### 5.4.7 Citizen Experience Agent

| | |
|---|---|
| **Purpose** | Find where the service is confusing, wrong or abandoned |
| **Autonomy** | max **L1** |
| **Inputs** | `feedback`, abandonment points in `sessions`, re-contact within 48 h on the same topic, low-confidence clusters, override patterns |
| **Outputs** | Ranked friction list with the exact turn where citizens drop out |
| **Escalation** | A protocol or prompt implicated → `review:submit` holder, as a submission candidate |
| **Value** | Closes G-12: feedback currently accumulates and changes nothing |

### 5.4.8 Data Protection Agent

| | |
|---|---|
| **Purpose** | Enforce retention, residency, consent and subject rights continuously |
| **Autonomy** | max **L1**. **Never L3** — it may never delete; deletion stays with the scheduler's deterministic sweep |
| **Inputs** | `consents`, `data_requests`, `files` with retention class, residency policy, provider routing |
| **Processing** | Reconciles what policy requires against what storage holds; verifies the retention sweep actually deleted bytes |
| **Outputs** | Conformance report; overdue subject requests; residency violations |
| **Escalation** | Residency violation → immediate `platform_admin` alert **and** the gateway refuses that provider until cleared |
| **Value** | Today a purge that fails to delete bytes raises an alert. Nothing verifies that policy and reality still agree |

### 5.4.9 Clinical Compliance Agent

| | |
|---|---|
| **Purpose** | Keep answers inside signed protocol text |
| **Autonomy** | max **L1** |
| **Inputs** | Sampled answers, `protocol_versions`, `review_signoffs`, `ai_overrides` |
| **Processing** | Deterministic claim extraction, then check each clinical claim against the signed text of the cited protocol version |
| **Outputs** | Drift report: answers making claims not supported by the cited protocol |
| **Escalation** | Any unsupported clinical claim → suspend the prompt version via `review/suspend` and alert the board |
| **Value** | The strongest argument this platform can make to a regulator: it audits its own clinical fidelity continuously |

### 5.4.10 Abuse & Integrity Agent

| | |
|---|---|
| **Purpose** | Protect a free service from being spent by someone who is not a citizen |
| **Autonomy** | max **L2** (propose a rate-limit or block; human applies). **L3** for one action: tightening a per-number inbound rate limit, reversible and time-boxed to 1 h |
| **Inputs** | `rate_limit_counters`, `auth_attempts`, inbound channel volumes, session patterns, `ai_usage_logs` |
| **Processing** | Behavioural baselining per number, per IP, per territory; detects scripted traffic, credential stuffing, model-extraction patterns, mass-enumeration of the user directory |
| **Outputs** | Ranked abuse candidates with the evidence trail |
| **Escalation** | Confirmed exfiltration pattern → `platform_admin`, session epoch bump, break-glass review |
| **Note** | This replaces the brief's "Fraud Agent". There is no money in this platform to defraud. There is a budget to drain, and that is the real threat |

### 5.4.11 Public Awareness Agent

| | |
|---|---|
| **Purpose** | Increase uptake where the platform is under-used |
| **Autonomy** | max **L2** |
| **Inputs** | Equity Monitor output, channel mix, partner territory presence, `blog` and public-page analytics |
| **Outputs** | Drafted awareness content per language and channel; suggested partner activation |
| **Hard limit** | **Never targets an individual citizen.** Awareness is territorial and channel-level. No behavioural nudging of a person about their health |

### 5.4.12 Programme Operations Agent

| | |
|---|---|
| **Purpose** | Keep the human operation staffed and responsive |
| **Autonomy** | max **L1** |
| **Inputs** | Worker activity, caseload distribution, unstaffed territories, SLA attainment by worker and territory, `schedules` |
| **Outputs** | Capacity gaps, rota proposals, territories with no responder |
| **Escalation** | A territory with zero active responders and open severity-3+ cases → immediate `gov_admin` + partner alert |
| **Value** | The readiness probe can prove a channel exists; nothing today proves a *person* exists at the other end |

---

## 5.5 Language & Knowledge agents (EXTEND)

| Agent | Purpose | Autonomy |
|---|---|---|
| Corpus Targeting | Choose which utterances to request review on, to raise a degraded language fastest per unit of reviewer time | L1 |
| Glossary Steward | Propose new `language_lexicon` entries from repeated unknown terms | L2 |
| Gate Watch | Watch `language_quality`; recommend raising or lowering a gate with the evidence | L1 |
| Protocol Gap | Cluster low-confidence interactions by topic; identify where approved text does not exist | L1 → submission candidate |
| Retrieval Curator | Measure which `kb_chunks` are retrieved and which are never used; propose pruning | L1 |

**Design note:** Gate Watch may never *lift* a gate autonomously. A gate exists
to stop the platform speaking badly in a language it does not know. Only a human
reviewer's judgement, recorded in `language_quality`, can lift it.

---

## 5.6 Tier 3 — Self-managing platform agents (NEW)

Closes G-06. These never touch citizen content, never read a transcript, and
operate only on infrastructure and code signals.

### 5.6.1 System Health Agent

| | |
|---|---|
| **Autonomy** | L1 (propose) + **L3 for a fixed, reversible action set** |
| **Inputs** | `/api/v1/system/ready`, `/api/v1/system/health`, `slo` measurements, `api_logs` error rates, scheduler freshness, OpenTelemetry traces |
| **Detects** | Readiness check failing; SLO burn rate above budget; error-rate step change; scheduler stale beyond `SCHEDULER_STALE_AFTER_MS`; provider failure spike; queue depth growth |
| **L3 action whitelist** (the complete list — nothing may be added without `agent:govern`) | 1. Re-run a failed scheduler step. 2. Fail a provider out of the gateway rotation for ≤ 30 min. 3. Clear an in-process cache. 4. Raise Cloud Run min-instances within a pre-approved band. 5. Re-issue a stuck report job. 6. Re-queue a failed notification. |
| **Never** | Restarts the database, changes schema, rotates a key, deletes anything, changes a threshold |
| **Escalation** | Two failed remedies for the same signal → stop acting, page `platform_admin`, open an incident |

### 5.6.2 Bug Detection Agent

| | |
|---|---|
| **Autonomy** | max **L2** |
| **Inputs** | `api_logs` 5xx with stack traces, agent faults, failed tests in CI, unhandled rejections, Sentry-class error grouping |
| **Processing** | Group by signature; localise to a file and commit range via `git blame`; reproduce in a sandbox tenant where the input can be replayed |
| **Outputs** | A defect record: signature, frequency, first-seen commit, affected users count, reproduction, suggested patch **as a diff** |
| **Never** | Commits. It opens a pull request with the diff and the reproduction. A human merges |
| **Value** | Today a 500 appears in the admin console's "Dernières erreurs serveur" and waits to be noticed |

### 5.6.3 Auto-Repair Agent

| | |
|---|---|
| **Autonomy** | **L3, within a whitelist and always reversible** |
| **Permitted repairs** | Retry with backoff; failover a provider; re-run an idempotent job; restore a config value to its last-known-good from `admin_config` history; re-apply a credential sync; re-queue a dead-letter message |
| **Forbidden absolutely** | Code deploy; schema migration; data mutation of any citizen record; permission change; credential change; protocol or prompt change |
| **Mechanism** | Every repair writes `agent_actions` with a `reversal` payload, and a watchdog reverses it automatically if the triggering signal has not cleared within the repair's declared window |
| **Escalation** | Repair attempted twice without clearing → freeze, page, incident |

### 5.6.4 Release Management Agent

| | |
|---|---|
| **Autonomy** | L1 for promotion; **L3 for rollback only** |
| **Inputs** | Canary state (`flags.ts`: 5 % start, 7-day hold), SLO burn during canary, error-rate delta, `evaluation_runs` for model/prompt changes |
| **Does** | Advances a canary when its hold has elapsed and no objective degraded; **rolls back immediately and without asking** when an objective degrades beyond threshold |
| **Why rollback is L3** | Waiting for human approval to stop a bad release costs exactly the minutes the release is harming citizens. Rolling back is reversible; not rolling back is not |
| **Never** | Promotes to 100 % without a human; releases a clinical artefact — those go through the review board only |

### 5.6.5 Infrastructure Optimisation Agent

| | |
|---|---|
| **Autonomy** | max **L1** |
| **Inputs** | Cloud Run utilisation, request concurrency, cold-start rate, database connections, storage growth, egress, ACU by capability |
| **Outputs** | Proposed instance bands by province time-of-day; index proposals from slow-query logs; storage-class transitions; cache-hit improvements |
| **Escalation** | Projected spend over budget → hands the Cost & Funding Agent the infrastructure half of the picture |

### 5.6.6 Test & Quality Agent

| | |
|---|---|
| **Autonomy** | max **L2** |
| **Inputs** | Coverage by module, mutation-test survivors, defect records, changed files |
| **Outputs** | Proposed test cases for uncovered deterministic rules; a flake report with evidence of non-determinism |
| **Hard rule** | **May never propose skipping, disabling or quarantining a test.** A failing test is a finding |

---

## 5.7 Tier 4 — AI Governance Agent (NEW)

The agent that governs the agents. One instance per tenant.

| | |
|---|---|
| **Autonomy** | L1 for policy change; **L3 for suspension only** |
| **Reads** | `agent_runs`, `agent_proposals`, `agent_actions`, `agent_authority`, `agent_faults`, acceptance rates, reversal rates |
| **Enforces** | 1. No agent exceeds its declared autonomy. 2. No agent writes outside `writes[]`. 3. No agent exceeds `budgetAcu`. 4. Every executed action has a resolvable evidence trail. 5. No agent operates on a tenant whose residency forbids its provider |
| **Suspends an agent when** | Fault rate > 5 % over 100 runs; human rejection rate > 40 % over 50 proposals; any action without resolvable evidence; any attempted write outside scope; reversal rate > 20 % |
| **Produces** | A weekly **Agent Conduct Report**: per agent, runs, proposals, acceptance, reversals, faults, ACU, and the five most-rejected proposal types |
| **Cannot** | Raise any agent's autonomy — only a `platform_admin` holding `agent:govern` can, and only up to the agent's compiled `maxAutonomy` |

**Autonomy promotion is earned, never configured:** an action type starts at L0.
It may be promoted one level after **200 proposals with ≥ 90 % human
acceptance and zero reversals**, and the promotion is itself an audited,
reviewable act. Any single reversal demotes it one level immediately.

---

## 5.8 Agent memory (NEW — closes G-03)

Four layers, each with a different lifetime and a different privacy class.

| Layer | Holds | Store | Lifetime | Scope |
|---|---|---|---|---|
| **Working** | The current run's state and checkpoints | `agent_runs.state` (JSONB) | Run + 24 h | Run |
| **Episodic** | What happened to this subject before | `interactions`, `cases`, `agent_runs` | Per retention class | Subject (citizen or case) |
| **Semantic** | What the platform knows generally | `kb_chunks` + pgvector; knowledge graph | Until the source artefact is superseded | Tenant |
| **Procedural** | What works — accepted vs. rejected proposals | `agent_proposals` outcomes, outcome-weighted retrieval | Rolling 180 days | Agent × tenant |

### Privacy rules, non-negotiable

1. **Episodic memory never crosses citizens.** An agent serving citizen A may
   not retrieve citizen B's episode. Enforced by a tenant+subject row filter in
   `ctx.db`, not by prompt instruction.
2. **Citizen memory is encrypted under its own HKDF purpose** and is destroyed
   in the same transaction as `/api/v1/me/delete`.
3. **Semantic memory contains no citizen content** — only approved protocols,
   curriculum, lexicon and public data. A transcript never becomes a shared
   embedding.
4. **Procedural memory stores outcomes, not content** — "proposal of type X in
   context Y was rejected", never the text of the case.

---

## 5.9 The learning loop (NEW — closes G-12)

```
interaction → feedback / override / outcome signal
     → Citizen Experience Agent clusters the friction
     → Protocol Gap Agent locates missing approved text
     → submission to the review board (human)
     → board signs a new protocol version (human)
     → canary at 5 % for 7 days (Release Agent watches)
     → Clinical Compliance Agent verifies answers match the new text
     → Impact preview shows the board what changed (§04.7)
```

**Every arrow that changes what a citizen is told passes through a human.** The
loop is fast on diagnosis and deliberately slow on clinical change. Reinforcement
operates on *retrieval ranking and proposal selection*, never on clinical
thresholds.

What reinforcement is permitted to change:
- Which `kb_chunks` rank first for a query shape.
- Which proposal types an agent offers in which context.
- Which model class the cascade selects for a difficulty signature.
- Which language samples go to a reviewer first.

What it may never change: severity thresholds, danger-sign lists, escalation
rules, dose text, retention periods, residency policy.

---

## 5.10 Model routing — the difficulty cascade (NEW — closes the top cost leak)

Today every interaction reaches the default LLM. The cascade routes by measured
difficulty.

| Class | Model | Used for | Share (target) | Relative cost |
|---|---|---|---|---|
| **R0 — rules** | None | Danger signs, menu navigation, courtesy, known-phrase lookup, protocol exact match | 35 % | 0 |
| **R1 — SLM** | Small model, on-region | Language ID, intent classification, slot filling, queue-ranking explanation, simple rephrasing | 35 % | 1× |
| **R2 — LLM** | Mid-tier | Standard triage, advisory, lesson generation, drafting | 25 % | 8× |
| **R3 — frontier** | Top-tier | Ambiguous multi-symptom triage, low-confidence language, vision diagnosis, board-facing analysis | 5 % | 40× |

Routing is decided by a **deterministic difficulty signature** — transcript
confidence, symptom count, protocol-match score, language gate state, image
presence, prior-turn count — computed in code before any model is called.
An R3 escalation is always permitted when the risk layer flags severity ≥ 3:
**cost control never overrides safety.**

Expected effect at the stated mix: ≈ 72 % reduction in model spend per
interaction versus routing everything to R2, with R3 reserved for the 5 % of
cases where it changes the answer.

---

## 5.11 Predictive layer (NEW — closes G-11)

| Model | Predicts | Horizon | Input | Action it informs |
|---|---|---|---|---|
| Outbreak risk | Territory-level incidence above baseline | 7–14 days | Cluster signals, seasonality, rainfall, prior years | Pre-position supplies; brief the province |
| Crop risk | Pest/disease pressure by crop and territory | 2–6 weeks | Reports, weather, planting calendar, prior incidence | Advisory campaign; input registry alert |
| Learner dropout | A learner stops engaging | 14 days | Session cadence, quiz performance, spaced-repetition adherence | Teacher outreach |
| Demand | Interaction volume by channel and province | 24 h – 7 days | Historical, seasonal, campaign calendar | Instance bands; worker rota |
| Spend | ACU to month end | To month end | Usage trend, routing mix | Routing change; funding alert |
| Language health | Days to gate downgrade | 14 days | Confidence trend, corpus growth, reviewer throughput | Corpus campaign targeting |

**Every prediction renders with its interval and its base rate.** A forecast
without an interval is a specification defect. No prediction is ever shown to a
citizen — predictions inform operators, never patients.

---

## 5.12 Agent governance — the operator's controls

In §13's Super Control Centre, `platform_admin` holding `agent:govern` can:

| Control | Effect | Audited |
|---|---|---|
| Set autonomy per agent per action type | Never above compiled `maxAutonomy` | ● |
| Suspend an agent | Immediate, tenant-wide, reversible | ● |
| **Global agent kill-switch** | All tiers 2–4 to L0 at once. Tier 1 and all deterministic safety continue | ● |
| Set `budgetAcu` | Per agent, per tenant | ● |
| Review the action ledger | Every proposal, acceptance, rejection, reversal | — (reading is itself audited) |
| Force a reversal | Any reversible action, any time | ● |

**The kill-switch is the most important control in this document.** If the agent
layer misbehaves in any way an operator does not understand, one action returns
the platform to exactly what it is today: a deterministic, audited,
human-operated service that still answers every citizen correctly. The autonomy
layer is strictly additive and strictly removable.
