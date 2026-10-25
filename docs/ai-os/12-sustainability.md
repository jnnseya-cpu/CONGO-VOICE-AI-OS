# 12 — Sustainability, Cost Governance and Sovereign Licensing

The brief asked for a monetisation model. This platform has none and will have
none: **it is free for every citizen, for ever, and there is no payment system
in it.** What replaces monetisation is the question a grant-funded national
service must actually answer — *can it prove its value per franc, hold its unit
cost down, and earn institutional revenue without ever touching a citizen?*

---

## 12.1 The funding model

| Source | Nature | What it buys | Horizon |
|---|---|---|---|
| **Government appropriation** | Recurrent budget line | Core operations, national scale-out | Year 2+ |
| **Development banks** (World Bank, AfDB) | Programme loan/grant | Build, national rollout, capacity | Years 1–5 |
| **Bilateral donors** (EU, USAID-class, FCDO-class) | Project grant | Module expansion, language work | Years 1–4 |
| **UN agencies** (WHO, UNICEF, FAO) | Technical + programme | Clinical content, surveillance integration | Ongoing |
| **Global health funds** (Global Fund, Gavi) | Disease-specific | Malaria/EPI modules, outbreak capacity | Years 2–6 |
| **Sovereign licensing** | Institutional revenue | §12.5 — other states and ministries | Year 3+ |
| **Philanthropy** | Catalytic | Language corpus, research | Years 1–3 |

**The sustainability thesis:** years 1–3 are donor-funded build. Year 3 onward,
government appropriation covers operations because the per-interaction cost is
small and demonstrable, and sovereign licensing offsets part of the engineering
cost. A service that costs 0.02 USD per interaction and prevents one child death
per 50 000 interactions does not need a commercial model; it needs an auditable
one.

---

## 12.2 What a funder must be given

Grant renewals are lost on reporting, not on impact. The platform produces the
evidence as a by-product of running.

| Artefact | Source | Cadence |
|---|---|---|
| Reach with denominators | `fact_interaction` × `dim_population` | Weekly |
| Equity disaggregation (language, territory, channel) | §05.4.5 Equity Monitor | Weekly |
| Clinical safety record | Severity-4 volume, time-to-human, escalations resolved, board sign-off status | Monthly |
| Cost per interaction, by module and channel | `ai_usage_logs` → ACU → USD | Monthly |
| SLO attainment | `core/slo.ts` | Monthly |
| Language health | `language_quality`, gate states, corpus growth | Monthly |
| Audit and compliance evidence | §11.7 evidence pack | Quarterly |
| Independent verification | External evaluator reading the same data | Annual |

**The honesty rules are the credibility.** Small counts suppressed. Denominators
mandatory. "Reported" never written as "outcome" — the platform does not observe
whether a child recovered, only whether a case reached a human. A funder who
reads a report that says *"we cannot say X"* believes the rest of it.

---

## 12.3 Unit-cost governance

Cost control **is** the commercial discipline of a free service. The ACU system
exists for exactly this.

### The ACU system — EXISTS

`core/metering.ts` converts every model call into an **AI Compute Unit** via a
configurable conversion table (`ACU_CONFIG_KEY = "acu.conversion"`), across
seven task classes: `llm`, `vision`, `stt`, `tts`, `translate`, `lid`, `embed`.
Caps are checked by the `acu_caps` scheduler step; exceeding them enters
**degraded mode**, where the platform answers on rules rather than stopping.

### EXTENDED — attribution (closes G-10)

| Dimension | Why a funder or a ministry needs it |
|---|---|
| Tenant | Already exists |
| **Province / territory** | A governor must see their own province's cost |
| **Module** | Health vs agriculture vs education cost per interaction |
| **Channel** | IVR is the most expensive channel and serves the most vulnerable. That trade must be visible, not discovered |
| **Agent** | An agent whose ACU exceeds its value is retired |
| **Model class (R0–R3)** | Proves the cascade is working |
| **Language** | A degraded language costs more per useful answer |

### The cost model

| Component | Driver | Control |
|---|---|---|
| Model inference | Interactions × class mix | §05.10 cascade — the single largest lever |
| STT | Minutes of audio | Content-addressed cache; shorter prompts for capture |
| TTS | Characters synthesised | Cache fixed scripts; synthesise only what varies |
| Telephony | Minutes + messages | Operator-direct routes; §07.3 |
| Compute | Requests × duration | Instance bands by province time-of-day |
| Storage | Media × retention | Retention sweeps already delete |
| Database | Size + IOPS | Analytics moved off OLTP — §09.9 |

### Targets

| Metric | Target | Why |
|---|---|---|
| Cost per interaction, blended | **≤ 0.02 USD** | At 50 m interactions/year this is 1 m USD — defensible against a health budget |
| R0 share (no model at all) | ≥ 35 % | Courtesy, menus, danger signs, protocol exact match |
| R3 share (frontier model) | ≤ 5 % | Reserved for where it changes the answer |
| Prompt-cache hit rate | ≥ 80 % | System prompts are 60–90 % of prompt tokens |
| STT cache hit rate | ≥ 15 % | Retries and resumes |
| Infrastructure as share of total | ≤ 25 % | If infrastructure dominates, the cascade is failing |

### Degraded mode is a feature

When a cap is reached the platform does not stop. It answers on deterministic
protocols, scripted language and cached content — **and it tells the citizen the
assistance is limited rather than silently giving a worse answer.** A budget
overrun must never become a clinical risk.

---

## 12.4 Value, stated so it can be challenged

A funder is entitled to a number and to the reasoning behind it.

| Benefit | Mechanism | Measurable today? |
|---|---|---|
| Faster escalation of danger signs | Deterministic routing, SLA clocks | **Yes** — time from interaction to human acknowledgement |
| Extension reach without extension officers | Advisory on demand in 5 languages | **Yes** — interactions per officer-equivalent |
| Earlier outbreak detection | §05.4.3 space-time scan | **Partly** — detection date vs. official declaration date |
| Reduced unnecessary facility visits | Triage that resolves at home | **No** — the platform cannot observe this. Needs a facility study |
| Learning continuity | Lessons, quizzes, spaced repetition | **Partly** — engagement, not attainment |
| Ministry situational awareness | Weekly briefs with denominators | **Yes** — report latency |

**The three "No" and "Partly" rows are the honest part.** A platform that
claimed to measure averted deaths from its own logs would be lying. What it can
prove is that a danger sign reached a human in N minutes, where before it
reached no one.

---

## 12.5 Sovereign licensing — institutional revenue

The only revenue the platform earns, and it never touches a citizen.

### What is licensed

| Tier | For | Includes | Indicative basis |
|---|---|---|---|
| **Sovereign instance** | A national government | Full platform, their tenant, their residency, their protocols, their languages, operations handover, 12 months support | Annual licence + implementation |
| **Ministry instance** | A ministry within a state already running one | A tenant inside the national instance, their own board and protocols | Annual, lower |
| **Programme instance** | A UN agency or large NGO operating across borders | Multi-country tenant, aggregated reporting | Annual |
| **Technical assistance** | Any of the above | Language corpus work, protocol authoring, integration, training | Day rate |
| **Open components** | Anyone | Protocol engine, language gates, channel adapters, published under an open licence | **Free** |

### Four principles

1. **Never per citizen, never per interaction.** A licence that scales with
   citizens served creates an incentive to serve fewer. Licence on the
   instance and the support, never on use.
2. **Data never licensed, never sold, never shared.** Not in aggregate, not
   anonymised, not for research without explicit consent and board approval.
   The revenue is for software and operations.
3. **Exit must be free and complete.** Every tenant can export every table it
   owns, its corpus, its protocols and its audit chain, in open formats, on
   demand (§06.11). A public institution that cannot leave has been given a
   dependency, not software.
4. **The poorest tenant pays nothing.** A least-developed country operating its
   own instance gets the licence free; the revenue comes from middle-income
   states, agencies and donors funding those deployments.

### Why another state would buy

The hard parts are already solved and are not easily rebuilt: five-channel
reach including IVR and USSD, a deterministic safety layer with a sign-off
model that a regulator will accept, language gates that refuse to speak badly,
full auditability, and an offline floor. A ministry starting from zero needs
three years and a clinical governance structure. Licensing an instance needs
protocol localisation and a board.

---

## 12.6 What is explicitly refused

| Model | Why refused |
|---|---|
| Citizen subscription, freemium, premium tier | §01.8. Any paid tier creates a slower lane for the poorest |
| Transaction or commission revenue | No transactions exist |
| Advertising or sponsored answers | A sponsored health answer is a clinical hazard |
| Selling or sharing citizen data, aggregate or otherwise | Incompatible with consent and with trust |
| Research access to raw transcripts | Only with explicit consent, board approval and de-identification; never as a revenue line |
| Pay-per-API for citizen-facing partners | Reintroduces a cost barrier one step removed |
| Data-for-access barter with a telecom | Trades citizen privacy for reach |

**Zero-rating is the one commercial negotiation that must happen** (§07.3): an
agreement that calls and USSD sessions to the national short-code are free to
the citizen. Without it the poorest users pay to use a free service.

---

## 12.7 Financial governance

| Control | Mechanism |
|---|---|
| Budget ceiling | ACU caps per tenant per month |
| Early warning | §05.4.6 Cost Agent at 70 / 85 / 95 % with a month-end forecast |
| Attribution | Spend by province, module, channel, agent, language |
| Approval | A routing change that lowers answer quality requires `gov_admin` acknowledgement |
| Audit | Every cap change, conversion-table change and routing change is audited |
| Funder reporting | Monthly statement per tenant (`monthlyStatement()` exists) |
| Independent verification | ACU conversion is published, so a funder can recompute the cost from usage |

**The ACU conversion table is published on purpose.** A funder who can recompute
the cost from the usage logs does not have to trust the invoice.
