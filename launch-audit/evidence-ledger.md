# Evidence ledger

Release candidate: commit `96d9b87` plus the fixes of this cycle (see
`cycle-reports/cycle-1.md`). Environment: production build served from
`.next/standalone`, `NODE_ENV=production`, `DEPLOYMENT_STAGE=pilot`, embedded
PostgreSQL in a scratch data directory, local storage driver, **no vendor keys of
any kind**. Date: 24 October 2026.

Status: PASS · FAIL · PARTIAL · BLOCKED · NOT TESTED · N/A. BLOCKED and NOT
TESTED are never promoted.

## Build, types, lint, tests

| ID | What | Command | Status | Evidence |
|---|---|---|---|---|
| B-01 | Production build is deterministic and traceable | `npm run build` | PASS | compiled in 13.2 s; `postbuild` artefact check: "Everything the container loads at runtime is in the image", including a real HEVC HEIC decoding to a 292 508-byte JPEG |
| B-02 | Type check | `npm run typecheck` | PASS | clean, `strict: true`, no `any`, no `@ts-ignore` anywhere in `src` |
| B-03 | Lint | `npm run lint` | PASS | zero errors, zero warnings, no rule disabled except two documented font-stylesheet exceptions |
| B-04 | Whole suite | `npm test` | PASS | see cycle report for the final count; the suite is not skipped, `.only`-free, and the SEO and env-contract gates fail the build when breached |
| B-05 | Adversarial safety corpus | `vitest run tests/red-team.test.ts` | PASS | 184 tests over a 181-case corpus: 3 modules, 5 languages, 8 attack families including prompt injection and data exfiltration. The suite also records its own shortfall against the 300-per-module-per-language the specification asks for |
| B-06 | Dependency audit | `npm audit` | PARTIAL | 4 moderate remain, all `@esbuild-kit` reached only through `drizzle-kit`; npm's remedy is a major downgrade that breaks schema generation. Production tree reports none |
| B-07 | Migration safety | `npm run db:check` | PASS | 1033 statements, one migration, no undeclared destructive statement |

## Channels (`launch-audit/probe-channels.mjs`)

14 of 14 PASS. USSD four-screen menu walked to completion with every screen
inside the operator's 160-character limit; an invalid digit answered rather than
dropped; a request with no number refused in the operator's own format; inbound
SMS accepted and its gateway replay absorbed; STOP accepted; unsigned and forged
telephony webhooks refused 403; unsigned WhatsApp refused 401; a flood from one
number cut off after 20 requests in a minute (6 of 26 refused).

## Critical journeys, authorisation and API abuse (`launch-audit/probe-journeys.mjs`)

30 of 30 PASS. Anonymous citizen served without an account; health question
answered; **no severity score and no provider or model name** in the citizen's
payload (asserted only on a 200, so the check cannot pass vacuously); danger sign
→ critical case → present in the health worker's queue, graded by rule; worker
can read the original words; health worker served no agriculture case and refused
platform configuration, the user directory and the audit log; partner refused
case write and escalation; **one citizen cannot read another's interaction
(403)**; a citizen cannot read a case file (403); unauthenticated case queue 401;
self-promotion through the profile endpoint ignored (role stays `citizen`);
oversized body 400; wrong types 400 with a clean validation error and no stack
trace; an injection payload treated as text with the database intact; malformed
identifier 400.

## Resilience and correctness under failure (`launch-audit/probe-resilience.mjs`)

10 of 10 PASS. With no AI provider configured at all, a danger sign still
produced the emergency instruction and opened a case. The platform reported its
own degradation (503) rather than claiming health, and the public report carried
**identifiers only** — no provider names, no jurisdictions, no unset variables,
no staleness figures. The container's readiness probe stayed green while the
programme was degraded, which is the distinction that keeps a working container
from being killed. The scheduler ran and reported what it did, and refused both a
wrong secret and an anonymous caller (401). A duplicate submission under one
idempotency key produced one interaction. Ten simultaneous turns were all served
and every one left a metering row.

## Browser-level checks

| ID | What | Command | Status | Evidence |
|---|---|---|---|---|
| UI-01 | Every page loads clean as an administrator | `node scripts/crawl.mjs` | PASS | 38 pages, 249 distinct internal link targets, no console error, no failed request, no broken link |
| UI-02 | WCAG 2.2 A/AA | `node scripts/a11y.mjs` | PASS (automated scope) | no violation on 38 pages; tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa. Screen-reader and voice fieldwork NOT TESTED |
| UI-03 | Behavioural smoke against a running build | `node scripts/smoke.mjs` | PARTIAL | 36 of 37. The one failure is the health probe answering 503 — this deployment correctly reporting the unstaffed clinical board and unwired alert channel. The check is right and the answer is honest |
| UI-04 | Progressive web app, offline | `node scripts/pwa-offline.mjs` | PASS | worker installs, activates, claims the page, shell cached, a page renders with the network down (21 012 characters). The queued-turn receipt is covered by unit tests, not by this check, and the script says so |
| UI-05 | Novice on a 360 px phone over slow 3G | `launch-audit/probe-novice.mjs` | PARTIAL | see `novice-walkthrough.md` |

## Performance (`launch-audit/evidence/loadtest-local.txt`)

| Profile | Result | Status |
|---|---|---|
| read (API) | p95 10 ms at 1 concurrent, 42 ms at 5, 72 ms at 10, 154 ms at 25; 0 % errors throughout | PASS against the 800 ms target |
| page (server-rendered) | p95 32 / 123 / 238 / 596 ms at 1 / 5 / 10 / 25; 0 % errors | PASS |
| write (full AI turn) | p95 177 ms at 1 concurrent, 788 ms at 5, 0 % errors; above that the platform's own limits bind | PARTIAL against the 4000 ms target — the measured stages pass, sustained throughput is BLOCKED from a single address |
| Mobile 3G page load | 3 of 4 pages inside the 2500 ms objective; the home page measured 2518 ms | PARTIAL |

All figures are local: Cloud Run concurrency and cold starts, the Cloud SQL
connection limit and round trip, the load balancer and real provider latency are
all absent, and each binds before the application does.

## Recovery (`launch-audit/dr-drill-local.sh`, executed step by step)

| Step | Measurement | Status |
|---|---|---|
| Cold snapshot of the data directory | 69 MB in 1 s, service stopped | PASS |
| Work after the snapshot | three marked interactions written and visible | PASS |
| Data directory destroyed and the snapshot restored | serving again in **3 s**, readiness 200 | PASS |
| Recovery point honoured | the three post-snapshot rows are **gone** (0 found), pre-snapshot data intact | PASS |
| Cloud SQL point-in-time restore | needs the cloud project | BLOCKED |

## Wiring the vendors from the administration console (`/tmp/probe-keys.mjs`, `/tmp/probe-routing2.mjs`, against a running production build)

| What was driven | Result | Status |
|---|---|---|
| The catalogue a platform administrator sees | 17 credentials in 5 groups; no value of any kind in the payload | PASS |
| A write with no recent second factor, on a pristine instance | **403** « Double authentification requise », nothing stored | PASS |
| A write after enrolling and verifying a factor | 200, hint `…WXYZ`, key not echoed back; the gateway moved from `mock` to `gemini,mock` and left offline mode on the same request | PASS |
| An attempt to set `DATA_ENCRYPTION_KEY` | 400, refused by name | PASS |
| A value that is not the shape of that vendor's key | 400, refused before storage | PASS |
| Withdrawing the key | 200; gateway back to `mock`, offline mode on | PASS |
| The audit trail afterwards | `credential.set`, `credential.rotated`, `credential.cleared` present; **no key anywhere in it** | PASS |
| An alert channel's driver with no credentials behind it | `escalation_delivery` stays failing — a half-wired channel is not reported as a channel | PASS |
| The credentials with no driver chosen | `escalation_delivery` stays failing | PASS |
| Both halves set from the console | `escalation_delivery` **clears**, with no redeploy and no cloud console | PASS |
| An operator the platform does not implement | 400, refused | PASS |
| Everything withdrawn again | `escalation_delivery` fails again | PASS |

The page a platform administrator sees is in
`launch-audit/evidence/admin-provider-keys.png`, taken from the running build:
five groups, every credential marked « absente », a password field for each
secret and a plain field for each identifier, and the three channel drivers as
closed lists ("log — ne pas envoyer, journaliser seulement", africastalking,
twilio).

No message left the machine: the Africa's Talking credentials used were
fabricated, so what is demonstrated is the platform's own routing decision, not
delivery by a carrier. Delivery still needs a real operator account, which is on
the human-action list.

## Not tested, and why

| Area | Why |
|---|---|
| Production deployment and anything about the live service | no cloud credentials in this environment (`gcloud auth list` → none) |
| Payments | the platform has no payment system: free for citizens, funded by government and NGOs. No payment dependency exists in the manifest | N/A |
| Real AI quality, cost per interaction, transcription accuracy | no provider keys; every answer came from the offline provider |
| Real SMS, WhatsApp, voice delivery | log providers only; no message left the machine, deliberately |
| Safari, Firefox, Edge, real devices | only Chromium is available here |
| Screen-reader and low-literacy voice usability | fieldwork with citizens |
| Cloud monitoring, alerting, uptime checks, budget alerts | `scripts/alerts.sh` needs the cloud project |
| Penetration test by an independent party | out of scope for an automated pass |
