# CONGO VOICE AI-OS — Developer Document Set

**Status:** specification, written against the running codebase on branch
`claude/congo-voice-ai-os-3o5r8q` at commit `611850e`.
**Audience:** a senior engineering organisation building this without further
business clarification.
**Scope rule:** nothing in the existing platform is removed. Every module,
table, route, role, journey and requirement already built is preserved and
extended. Where this document proposes a change to existing behaviour it says
so explicitly and names the file.

---

## What this is

CONGO VOICE AI OS is national voice-first public infrastructure for the
Democratic Republic of the Congo, serving health, agriculture and education in
French, Lingala, Kikongo, Swahili and Tshiluba. It is **free for every citizen,
for ever**, funded by government and development partners.

This document set specifies its transformation from a voice-first service into
an **AI Infrastructure Operating System**: a platform that runs, supervises,
repairs, governs and improves itself, and that other ministries and other
countries can deploy as their own sovereign instance.

## The one constraint that shapes everything

**No payment gateway exists in this platform and none will be added.** There is
no merchant, no wallet, no card rail, no settlement engine, no commission split,
no marketplace, no citizen billing of any kind. A mother in Kwilu calling about
a convulsing child is never a transaction.

This removes an entire category of architecture — and an entire category of
attack surface, compliance burden and failure mode. What replaces "monetisation"
is **§12 Sustainability, Cost Governance and Sovereign Licensing**: how the
platform proves its value per franc to its funders, holds its own unit cost
down, and earns revenue from *institutions* — other ministries, other states,
development banks — without ever touching a citizen's money.

## What already exists (measured, not estimated)

| Dimension | Count | Source of truth |
|---|---:|---|
| Database tables | 69 | `src/server/db/schema.ts` |
| API routes | 128 | `src/app/api/**/route.ts` |
| Provider webhooks | 9 | `src/app/api/hooks/**` |
| Roles | 7 | `src/server/core/rbac.ts` |
| Permissions | 25 | `src/server/core/rbac.ts` |
| Languages | 5 | `languageEnum` — fr, ln, kg, sw, lua |
| Service modules | 3 | health, agriculture, education |
| AI agents | 12 | `src/server/ai/agents/` |
| Model capabilities | 4 | llm, vision, stt, tts |
| Model providers | 5 | Anthropic, Gemini, OpenAI, Google Speech, offline mock |
| Scheduler jobs | 16 | `src/server/core/scheduler.ts` |
| Service level objectives | 6 | `src/server/core/slo.ts` |
| Citizen channels | 5 | IVR, USSD, SMS, WhatsApp, web/PWA |
| Tests | 1 958 in 99 files, 590 s | `npm test` |
| Public pages | 17 | `src/app/(public)/` |
| Application pages | 27 | `src/app/(app)/` |
| Blog articles | 30 | `content/blog/`, each ≥ 90/100 on the SEO gate |

## How to read this set

| # | Document | Answers |
|---|---|---|
| 01 | [Executive Product Vision](01-vision.md) | What the AI-OS is, what it replaces, why it wins |
| 02 | [Market Gap Deep Review](02-market-gap.md) | What exists, what it fails at, where the gaps are |
| 03 | [Complete User Ecosystem](03-user-ecosystem.md) | Every actor, their rights, their journeys |
| 04 | [AI Command Centres](04-command-centres.md) | One per user type: data, actions, automations, limits |
| 05 | [Agent Architecture](05-agents.md) | Every agent: purpose, I/O, permissions, triggers, escalation |
| 06 | [Platform Modules](06-modules.md) | Module-by-module product specification |
| 07 | [Connector Ecosystem](07-connectors.md) | Every external API, why, where, what data |
| 08 | [System Architecture](08-architecture.md) | Runtime, orchestration, events, gateway, scale |
| 09 | [Data Architecture](09-data.md) | ERD, schemas, lake, vector, knowledge graph, streams |
| 10 | [API Specification](10-api.md) | Endpoints, envelopes, auth, limits, errors, webhooks |
| 11 | [Security Architecture](11-security.md) | Zero trust, identity, threat, anti-abuse, compliance |
| 12 | [Sustainability & Sovereign Licensing](12-sustainability.md) | Funding, unit cost, institutional revenue |
| 13 | [Admin Super Control Centre](13-admin-control.md) | Total operator visibility and control |
| 14 | [Operations Architecture](14-operations.md) | DevOps, observability, DR, BC, testing |
| 15 | [Build Roadmap](15-roadmap.md) | MVP → beta → national → sovereign → continental |
| 16 | [Competitive Advantage](16-advantage.md) | Why this is defensible |
| 17 | [Production Readiness Review](17-production-readiness.md) | The gate, and what is still open |
| 18 | [Trend Intelligence, embedded](18-trend-intelligence.md) | How the trend engine was mapped onto this platform |

## Conventions used throughout

- **EXISTS** — built, tested, in the repository today. A file path is given.
- **EXTEND** — exists, and this document specifies additions to it.
- **NEW** — does not exist; full specification given.
- **DECISION** — a choice only the programme owner can make; the options and
  their costs are stated, never resolved silently.

Any figure in this set either cites a file or is marked as a target. No figure
is an estimate presented as a measurement.

## The ten rules this set binds itself to

Carried from §17.7 and applying to every section above:

1. Never convert BLOCKED or NOT TESTED into PASS.
2. Never claim a deployment succeeded unless it actually succeeded.
3. Never claim a feature works unless it has been inspected and, where
   technically possible, tested.
4. Never claim the platform is secure because it builds.
5. Never describe any system as unhackable or hacker-impenetrable.
6. Never suppress a type, lint or build error to force a deployment.
7. Never skip, disable or quarantine a test to reach green.
8. Never present an estimate as a measurement.
9. Never report a GO for a scope wider than the evidence covers.
10. A failure that is correct behaviour is reported as a pass with its reason,
    never hidden and never silently reclassified.

## Size

19 documents, ~5 100 lines, ~40 000 words. The current verdict is in
[§17](17-production-readiness.md): **GO for local development, CONDITIONAL GO
for a pilot blocked on four human actions, NO-GO for national production.**

## The lock

`inventory.lock.json` records the platform's surface: every table, enum value,
route, role, resolved role size, permission, agent, provider, capability,
scheduler step, service objective, settable and never-settable credential,
channel driver, page, document, test file and npm script — plus a content hash
of each file in the deterministic safety layer.

`tests/inventory-lock.test.ts` and the CI step `npm run lock:check` compare the
live source against it and fail on **any** difference, in either direction.

| Command | Effect |
|---|---|
| `npm run lock:check` | Compare. Non-zero and a named diff on any drift. Runs in CI |
| `npm run lock` | Rewrite the lock — the deliberate act of declaring a change |

Why both directions: a lock that objected only to removals would let an
unreviewed route appear. Declaring a change puts it in the diff, where a
reviewer sees exactly which surface moved.

**The guarded files** are pinned by content because a behavioural test proves
they work today, while a hash proves nobody altered them in a commit that was
about something else: `ai/safety.ts`, `ai/agents/risk.ts`, `ai/agents/workflow.ts`,
`ai/protocols/engine.ts`, `ai/language/gates.ts`, `ai/review/gate.ts`,
`core/rbac.ts`, `core/credentials.ts`, `core/status.ts`, `core/mfa.ts`,
`core/residency.ts`, `channels/modes.ts`.

**The count table above is checked too.** Every row is parsed and compared
against the live platform, because a table of counts that nothing verifies is a
table of counts that drifts — five of its figures were wrong when the check was
first written. The test names the row, so a stale figure is a one-line fix.

**Floors that a regenerated lock cannot lower.** Regenerating the lock silences
a drift report, so the test also asserts invariants independently of it: all
seven roles and five languages present, every citizen channel including IVR and
USSD, a voice notification channel, the offline provider, all four model
capabilities, the eight never-settable secrets, the retention/SLA/audit
scheduler jobs, the readiness and emergency surfaces, the nine provider
webhooks, the eighteen AI-OS documents — and **no payment-shaped route, table or
credential may ever appear**.
