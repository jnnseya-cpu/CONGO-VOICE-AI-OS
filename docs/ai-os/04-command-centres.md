# 04 — AI Command Centres

One per user type. A command centre is **not a dashboard**. A dashboard renders
the past; a command centre proposes the next action, executes what it is
permitted to execute, and shows its reasoning.

---

## 4.1 The common contract

Every command centre, for every role, obeys the same five rules.

### Rule 1 — Three zones, always in this order

| Zone | Contains | Latency budget |
|---|---|---|
| **ACT** | What this person should do now, ranked, with the action attached | ≤ 400 ms (`api_p95`) |
| **KNOW** | What changed since they last looked, with denominators | ≤ 1 s |
| **ASK** | A free conversation with their agents | Streaming, first token ≤ 2 s |

ACT is first because the purpose is action. KNOW is second because context
justifies the ranking. ASK is last because open conversation is the exception,
not the workflow.

### Rule 2 — Four autonomy levels, declared per action type

```
L0  OBSERVE    Agent reports. No action. (default for every new action type)
L1  SUGGEST    Agent proposes; human executes with one click.
L2  DRAFT      Agent prepares the artefact; human reviews and commits.
L3  EXECUTE    Agent acts; human is notified; action is reversible and audited.
```

**There is no L4.** No agent acts irreversibly without a human. Actions that
can never exceed L2, written as code in `agent_authority`:

- Anything clinical: severity, danger-sign classification, protocol content.
- Anything that contacts a citizen with health advice.
- Anything that changes RBAC, credentials, retention or residency.
- Anything that deletes data.
- Anything that spends beyond a declared ACU ceiling.

### Rule 3 — Every proposal carries its evidence

A proposal renders as:

```json
{
  "proposalId": "uuid-v7",
  "agent": "triage_ordering",
  "action": { "type": "reorder_queue", "payload": { … } },
  "autonomy": "L1",
  "rationale": "3 cases breach SLA within 40 min; 1 is severity 4 unacknowledged",
  "evidence": [
    { "kind": "case", "id": "…", "field": "slaDueAt", "value": "2026-10-25T14:10:00Z" },
    { "kind": "risk_assessment", "id": "…", "field": "severity", "value": 4 }
  ],
  "confidence": 0.91,
  "reversible": true,
  "expiresAt": "2026-10-25T14:00:00Z",
  "costAcu": 0.4
}
```

`evidence[]` is mandatory and must reference real rows. A proposal whose
evidence cannot be resolved is **not rendered** — it is logged as an agent
fault. This is the structural defence against a confident agent inventing a
reason.

### Rule 4 — Offline degrades to L0

With no model access the command centre still works: deterministic rules
(SLA clocks, severity ordering, protocol lookups) continue to rank and alert.
Only the explanatory and generative layers go quiet. The user sees
*"Assistance IA indisponible — classement par règles"*, never silence and never
a stale cached opinion presented as current.

### Rule 5 — Every centre is accountable in the same ledger

One table, `agent_runs`, plus `agent_proposals` and `agent_actions` (§09.4).
Every proposal, every acceptance, every rejection, every autonomous action.
`platform_admin` reviews them in §13; the subject can always see what was done
on their behalf.

---

## 4.2 Citizen — "Mon espace"

The citizen command centre must work for someone who cannot read, on a phone
that cannot render it. **It therefore exists in two forms with the same logic.**

### Voice/USSD form (IVR, USSD, SMS)

| Zone | Rendering |
|---|---|
| ACT | *"Vous avez un rappel de vaccination demain. Tapez 1 pour confirmer, 2 pour reporter."* — at most 2 actions, spoken |
| KNOW | *"Votre question d'hier a reçu une réponse. Tapez 3 pour l'écouter."* |
| ASK | The existing dialogue — speak your question |

### PWA form

| Zone | Rendering | Source |
|---|---|---|
| ACT | Pending follow-ups, unanswered reminders, unacknowledged advice, consent decisions due | `follow_ups`, `schedules`, `consents` |
| KNOW | Answers received, case status if they have one, learning progress | `interactions`, `cases`, `learner_profiles` |
| ASK | Full multimodal conversation, voice or text or photo | `/api/v1/interactions` |

### The citizen's agent — **Agent d'accompagnement**

| Property | Value |
|---|---|
| Max autonomy | **L1** — it may never act for a citizen without the citizen saying yes |
| Does | Reminds, explains an earlier answer again in simpler words, re-reads in another language, prepares a follow-up question for a worker |
| Never does | Gives clinical advice of its own; changes a consent; contacts anyone |
| Memory | Episodic (their own past interactions) + preferences. **Never** cross-citizen |
| Privacy | Memory is encrypted under the citizen's own purpose key and is destroyed by `/api/v1/me/delete` in the same transaction as the account |

**Design constraint that overrides everything:** the citizen centre must not
create obligation. A rural mother must never feel the system is tracking her
compliance. Every ACT item is dismissible without consequence and nothing is
reported to any worker as "ignored".

---

## 4.3 Community Health Worker — "Poste de commandement santé"

The highest-value centre in the platform, because it compresses the gap between
a danger sign and a human.

### ACT zone — ranked work

Ranking is **deterministic**, computed by rule, not by model:

```
priority = (severity × 1000)
         + (slaMinutesRemaining < 60 ? 500 : 0)
         + (unacknowledged ? 300 : 0)
         + (safeguarding ? 400 : 0)
         + (clusterMember ? 200 : 0)
         - (ageHours × 2)
```

The model's role is to *explain* the ranking in one sentence, never to set it.
This is the §1.8 rule — the model understands, the code decides — applied to
the work queue.

| Item type | Action attached | Autonomy |
|---|---|---|
| Severity-4 case unacknowledged | Acknowledge + call | L1 |
| SLA breaching < 60 min | Acknowledge, reassign, or request extension | L1 |
| Follow-up due | Send drafted message | **L2** — message pre-written in the citizen's language, worker edits and sends |
| Cluster hypothesis | Confirm / reject / request more data | L1 |
| Safeguarding disclosure | Open protected workflow | **L0** — never pre-empted, never summarised by a model before a human reads it |
| Low-confidence interaction for review | Review and correct | L1 |

### KNOW zone

| Panel | Content | Source |
|---|---|---|
| Caseload | Open, breaching, resolved this week, median time to acknowledge | `cases`, `case_events` |
| Clinical signal | Severity distribution vs. 4-week baseline for this territory | `risk_assessments`, `health_triage_records` |
| Cluster watch | Candidate clusters with member count and shared features | `agri_clusters` pattern applied to health |
| Protocol changes | Protocols signed or suspended since last login | `protocol_versions`, `review_signoffs` |
| My overrides | Risk scores this worker overrode, and whether outcomes agreed | `ai_overrides`, `feedback` |

That last panel is deliberate: **a worker who consistently overrides the model
in one direction is either correcting a real model bias or has a bias of their
own.** Showing it to them first, before it appears in any supervisory view, is
what makes it a learning tool rather than surveillance.

### Agents in this centre

| Agent | Purpose | Autonomy | Doc |
|---|---|---|---|
| Triage Ordering | Rank and explain the queue | L1 | §05.3 |
| Follow-up Drafting | Write the next message in the citizen's language | L2 | §05.3 |
| Cluster | Propose outbreak hypotheses | L1 | §05.4 |
| Protocol Lookup | Answer "what does the protocol say" with a citation | L1 | §05.3 |
| Handover | Compose a shift handover brief | L2 | §05.3 |

---

## 4.4 Agricultural Officer & Teacher

Identical structure, different ranking inputs and agents.

### Agricultural Officer — "Poste de commandement agriculture"

| Zone | Distinctive content |
|---|---|
| ACT | Cluster confirmations, input-shortage reports, price anomalies, photo diagnoses below confidence threshold |
| KNOW | Planting-calendar deviation by territory, pest/disease incidence vs. season baseline, market-price movement, input availability |
| Agents | Cluster, Crop Diagnosis Review, Calendar Advisory, Market Intelligence (§05.4) |

Priority rule emphasises **seasonality and spread**: a cassava mosaic report in
planting season in a territory with no prior incidence outranks a routine query.

### Teacher — "Poste de commandement éducation"

| Zone | Distinctive content |
|---|---|
| ACT | Safeguarding disclosures (always first, always L0), learners who have stalled, quizzes awaiting review, stories awaiting approval |
| KNOW | Cohort mastery by topic, spaced-repetition adherence, dropout risk, language mix of learners |
| Agents | Learner Progress, Content Gap, Safeguarding Routing (L0 only), Lesson Drafting (L2) |

**Hard rule:** no model output ever reaches a child without a teacher or the
curriculum board having approved the content version it came from.

---

## 4.5 Government Administrator — "Centre de commandement national"

The instrument a ministry has never had: what is happening this week, by
province, with denominators.

### ACT zone

| Item | Action | Autonomy |
|---|---|---|
| Province with a degrading SLO | Review, reassign capacity, request report | L1 |
| Language gate downgrade | Approve a corpus-collection campaign | L1 |
| Outbreak signal above threshold | Commission a brief; notify a role/territory | **L2** — brief drafted, broadcast text drafted, minister sends |
| Protocol awaiting submission | Submit to the review board | L1 |
| ACU trajectory exceeding budget | Approve routing change or request funding | L1 |
| Report ready | Read and release | L1 |

### KNOW zone — the national picture

| Panel | Content | Honesty rule |
|---|---|---|
| Service reach | Interactions by province, module, language, channel | Always with population denominator, never raw counts alone |
| Clinical safety | Severity-4 volume, time-to-human, escalations resolved | Small counts suppressed below threshold |
| Outcome signal | Feedback scores, override rates, re-contact rates | Stated as *reported*, never as *outcome* — the platform does not observe clinical outcomes |
| Language health | Per-language confidence, gate state, corpus size | A degraded language is shown as degraded, prominently |
| Capacity | Workers active, caseload per worker, unstaffed territories | — |
| Cost | ACU by province/module/channel, cost per interaction, trajectory | §12.3 |

**The denominator rule is load-bearing.** `reporting.ts` already enforces small-
count suppression. The command centre extends it: any figure rendered without a
denominator is a specification defect, because a minister reading "4 000
interactions" without "of an eligible 2.1 m" will make a bad decision.

### Agents

National Analyst (L2 — drafts the brief), Equity Monitor (L1 — flags a
territory being under-served), Capacity Planner (L1), Policy Impact (L1 —
before/after a protocol or broadcast, with the caveat stated).

---

## 4.6 Partner Organisation — "Espace partenaire"

| Zone | Content |
|---|---|
| ACT | Reports due to their donor, language samples awaiting review, review-board items they can sign, data-sharing consents expiring |
| KNOW | **Their own** programme's indicators within their territories, benchmarked against the national figure |
| Agents | Donor Reporting (L2 — drafts the narrative with denominators and caveats), Language Review Assistant (L1), Indicator Explainer (L1) |

**Tenancy rule, closing G-09:** a partner sees national aggregates and *its own*
disaggregates. It does not see another partner's disaggregates, and
`report:export` alone will no longer be sufficient to download another
organisation's report (§11.3).

---

## 4.7 Review Board Member — "Comité de revue"

| Zone | Content |
|---|---|
| ACT | Artefacts awaiting their signature, quorum status, suspensions to confirm |
| KNOW | What changed in the submitted version, diffed against the live one; the evidence pack; which answers would change |
| Agents | **Diff Explainer (L1)** and **nothing else** |

Deliberately the thinnest centre in the platform. A board exists to apply human
clinical judgement. An agent that summarised a protocol change for a signatory
would become the de-facto author of national clinical policy. The one agent
permitted shows a mechanical diff and lists the live answers that would change —
no opinion, no recommendation, no summary of risk.

**Specified addition — impact preview:** before signing, the board sees the N
most recent real interactions that would have been answered differently under
the new version, with both answers side by side. Built from `interactions` +
`prompt_versions` + `protocol_versions`. This is the single highest-value
addition to clinical governance in this document set.

---

## 4.8 Platform Operator

Specified in full in §13 — the Admin Super Control Centre.

---

## 4.9 Auditor — "Espace de contrôle" — NEW

| Zone | Content |
|---|---|
| ACT | Evidence requests to fulfil, attestations due |
| KNOW | Audit-chain integrity, retention attainment, residency conformance, break-glass usage, access-review status |
| Agents | Evidence Compiler (L2 — assembles a signed pack, auditor releases it) |

Sees **control evidence, never content**. Can verify that audio older than 90
days was purged without ever reading a transcript.

---

## 4.10 Cross-cutting requirements

| Requirement | Specification |
|---|---|
| Accessibility | WCAG 2.2 AA; every ACT item reachable by keyboard and screen reader; `npm run a11y` extended to cover command centres |
| Low bandwidth | ACT zone ≤ 40 KB on first paint; KNOW lazy-loaded; measured by `npm run perf` on the 3G profile |
| Offline | ACT renders from the service-worker data cache with an explicit staleness age; actions queue in the existing UUIDv7 outbox and sync via `cvos-sync` |
| Language | Every centre available in all five languages; French canonical then localised through `localise()` |
| Latency | ACT ≤ 400 ms p95, enforced as a new SLO (§14.4) |
| Auditability | Rendering a centre is itself audited when it contains citizen-identifying data, matching the existing rule that reading the user directory is audited |
