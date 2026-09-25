# Architecture

## 1. One canonical turn
Every channel (PWA, IVR, WhatsApp, USSD/SMS, assisted console) calls the same orchestrator, `runInteraction()` in `ai/agents/orchestrator.ts`. A turn always follows the same stages, and each stage writes its result to the interaction row before the next one starts (write-ahead autosave), so a dropped call or a crashed provider still leaves a complete trace.

```
capture ──► autosave (files, interactions)                       ← original input, channel, actor, geo
   └─► emergency short-circuit (keyword rules, all 5 languages)   ← scripted emergency text, CHW alert
        └─► speech-to-text (gateway: whisper → gemini → mock)
             └─► language agent (LID, code-switch, French pivot, intent, module) + verified corpus examples + lexicon
                  └─► personalisation (language, province, recent needs; never health inferences)
                       └─► domain agent  health: protocol engine (deterministic severity 0–4) + knowledge citations
                                          agriculture: farm context, top-3 candidates, tiered actions, chemical guard, notifiable list
                                          education: learner band, teach-check-adapt, quiz, hint-first homework
                            └─► risk agent (rules only: can raise, never lower; low-confidence policy; uncited → fallback)
                                 └─► compose the seven-part answer (French canonical) ──► localise (language agent)
                                      └─► persist domain record, corpus sample, event, audit
                                           └─► workflow agent (case, queue, SLA, escalation, notifications)
                                                └─► text-to-speech (google_tts → openai → on-device)
```

The seven-part contract (`FinalAnswer`): what the user asks · what the system understood · the risk · the recommended action · escalation (required, to whom, why) · confidence (score, low flag) · saved summary.

## 2. Layers and directories
| Layer | Location | Notes |
|-------|----------|-------|
| Frontend | `src/app/*` pages, `src/client/**` | Server components read server modules directly; client components call `/api/v1`. |
| Shared | `src/shared/**` | Types, the seven-part contract, i18n dictionaries, formatters. No server imports. |
| Backend entry points | `src/app/api/v1/**`, `src/app/api/hooks/**` | Thin handlers through `handle()` (auth, RBAC, rate limit, logging, errors) or signature-verified webhooks. |
| Backend services | `src/server/{core,db,ai,channels,reports}` (moving to `src/server`) | Business logic, agents, gateway, workflow, reports. |
| Data | `src/server/db/schema.ts`, `drizzle/` | PostgreSQL dialect; embedded PGlite in dev/test. |

## 3. AI gateway and routing
`ai/gateway.ts` is the only module that knows vendors. Chains per capability (env-configurable):

| Capability | Default chain | Rationale |
|------------|---------------|-----------|
| LLM (reasoning, extraction, explanation) | Claude → Gemini → OpenAI → offline rules | Claude for judgement-heavy structured output; two independent fallbacks; rules keep the platform alive. |
| Vision (crop / livestock photos) | Claude → Gemini → OpenAI | Multimodal understanding with the same failover. |
| Speech-to-text | OpenAI Whisper-family (fr, sw, ln) → Gemini audio (all five) → mock | Whisper is strong on French/Swahili; Gemini listens directly to Kikongo/Tshiluba audio. |
| Text-to-speech | Google TTS (fr, sw) → OpenAI TTS → on-device speech synthesis | Natural voices where they exist; the browser or handset speaks otherwise. |

Every call is logged (`ai_usage_logs`, `acu_ledger`) with an internal provider key, tokens/seconds, latency, success and estimated cost. Provider names, prompts and keys never reach clients (`SEC-08`). Structured outputs are validated with zod on every provider; a schema failure or refusal moves to the next provider.

## 4. Deterministic safety
- Health severity comes from versioned protocol trees (`ai/protocols`), never from the model; red flags short-circuit to severity 4.
- Keyword danger-sign detection in five languages runs before any model call.
- Health guidance is sanitised (no diagnosis claims, no dosing outside approved text) and must cite an approved knowledge document or protocol id; otherwise a scripted fallback is served and an `ai.contract.violation` event is recorded.
- The risk agent can only raise severity; low confidence on a health turn always reaches a human.
- Safeguarding disclosures enter a restricted pathway.

## 5. Learning loop (languages)
Corpus capture → citizen flags and voice ratings → native-speaker verification and lexicon → retrieval into prompts on every turn → dataset export for speech-model fine-tuning → per-language proficiency metrics and go-live gates. See `docs/LANGUAGES.md`.

## 6. Degraded modes
| Failure | Behaviour |
|---------|-----------|
| One LLM provider down | Next provider in the chain, same request. |
| All providers down | Offline rules provider: protocol trees still run; scripted explanations; low-confidence flag. |
| STT unavailable / language below gate | Text or DTMF/USSD-guided mode; the citizen is asked to write or press keys. |
| ACU cap reached | Non-emergency AI degrades to scripted mode; safeguards never switch off. |
| Client offline (PWA) | Voice notes and photos queue locally and sync with idempotency keys. |
| Notification channel outage | WhatsApp → SMS → voice fallback with retries and delivery events. |

## 7. Multi-tenancy, privacy, audit
Tenants and organisations scope institutional data by province/territory; citizens are national. Field-level classification drives encryption, redaction and export permission. The audit log is a per-day hash chain verified by the scheduler; the event store is append-only. Consents are purpose-specific and enforced at query time; erasure requests are tombstoned with statutory audit retained.

## Deliberate deviations from the specification

Two structural requirements are not met as written. Neither is an omission; both
are decisions, recorded here so a reviewer can disagree with the reasoning
rather than guess at it. They carry the status **Deviation** in
`docs/REQUIREMENTS.md`.

### DO-01 — one application rather than a monorepo of services

The specification proposes a monorepo split into separately deployable
services. This repository is one Next.js application with a layered interior
(`src/app`, `src/client`, `src/shared`, `src/server/{core,db,ai,channels,reports}`)
and an enforced import direction.

The split buys independent deployment and independent scaling. Both are paid
for continuously: a release becomes a coordination problem across repositories,
a change that crosses a boundary becomes two pull requests and a version bump,
and a shared type becomes a published package. A national platform maintained by
a small team pays that cost long before it collects the benefit — and the part
that actually needs to scale independently, the AI providers, is already behind
one interface (`src/server/ai/gateway.ts`) and runs somewhere else entirely.

The boundaries the split would have enforced are enforced here instead — and
until recently that sentence was aspirational, which is worth admitting because
it is the usual fate of a boundary nobody checks. The directories existed; by
the time anyone looked, four imports had crossed the line, including a component
that called a reporting agent and opened a database connection of its own.

The rule now, in one direction only:

| Layer | May import | May not |
|---|---|---|
| `src/shared` | nothing from the platform | `@server/*`, `@client/*` — it is the contract both sides depend on |
| `src/client` | `@shared/*`, and **types** from `@server/*` | any server **value** |
| `src/server` | `@shared/*` | `@client/*` |

Type-only imports across the client/server line are allowed deliberately: a type
is erased at build time and creates no runtime coupling, so a component may name
the shape of what a page hands it without being able to reach the database that
produced it. `ModuleDashboard` is the worked example — it declares
`Awaited<ReturnType<typeof moduleDashboard>>` and the page does the fetching.

Three things enforce it, because one is not enough:

1. **ESLint** (`no-restricted-imports`, with `allowTypeImports`) — fails the lint.
2. **`tests/layering.test.ts`** — fails the suite, because a lint rule is
   skippable and a failing test is not.
3. **`import "server-only"`** on server modules — fails the build if one is ever
   pulled into a browser bundle despite the first two.

When a service genuinely needs to scale or fail on its own, this is the line it
gets cut along, and it is now a real line rather than a naming convention.

### DO-05 — no event bus, therefore no schema registry

The specification asks for database migrations with expand/contract
compatibility **and** for event-schema evolution governed by a schema registry
set to BACKWARD compatibility.

The first half is implemented: migrations are generated by Drizzle, checked for
destructive statements by `scripts/check-migrations.mjs` before they can merge,
and applied at boot.

The second half assumes an event bus between services. This platform has none:
domain events are rows in `events`, read by the same application that wrote
them, with no external consumer that could be broken by a schema change. There
is no registry to keep backward-compatible, and standing one up to govern a
table nobody else reads would be ceremony rather than safety. If an external
consumer is ever added — a ministry data warehouse, a partner's dashboard — the
requirement becomes live again and the event payloads become a published
contract.
