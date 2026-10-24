# Cycle 1 — 24 October 2026

Release candidate at entry: `96d9b87`. Environment: production build served from
`.next/standalone`, pilot stage, embedded PostgreSQL, no vendor keys.

## Phases executed

Recon and safety · truth audit · architecture reconstruction (previous cycle) ·
build and release integrity · route and screen crawl · novice walkthrough ·
critical journeys · authentication and authorisation · API adversarial testing ·
database and migration validation · files and media · AI safety corpus ·
security testing · privacy operations · performance and load · devices and
accessibility (Chromium) · notifications and webhooks · observability (local) ·
failure injection · backup and restore (data layer) · fraud and abuse surface
(rate limits, flood) · legal surface review.

Phases not executed, with reasons, are listed at the end of
`evidence-ledger.md`. None was skipped silently.

## Fixed in this cycle

| ID | Defect | Severity | Verified by |
|---|---|---|---|
| D-01 | A photograph sent under the documented field name was silently discarded while the answer still named a crop disease | P2 | 4 new tests; live probe |
| D-02 | A double tap created two interactions, and for a danger sign two cases and two alerts | P2 | 3 new tests; live probe `RS-08` |
| D-03 | Every citizen, in all five languages, was shown an English slogan as the first line | P3 | 3 new tests; live first screen |
| D-04 | Every visitor who chose a language spent a request on a guaranteed 401 | P4 | novice walk now error-free |
| D-05 | The write path could not be load-tested and the tool crashed instead of saying so | P3 | write p95 measured at 1 and 5 concurrent |

## Newly broken by this cycle

None. Every previously passing test still passes; the suite grew.

## Measurements taken for the first time

- Write path: **p95 177 ms at 1 concurrent, 788 ms at 5**, 0 % errors.
- Read path: **p95 10 / 42 / 72 / 154 ms** at 1 / 5 / 10 / 25 concurrent, 0 % errors.
- Restore: data directory destroyed, snapshot restored, **serving again in 3 s**,
  recovery point honoured (post-snapshot rows gone, earlier data intact).
- Adversarial corpus: **184 tests over 181 cases**, 3 modules, 5 languages,
  8 attack families.
- Channels: **14 of 14** live probes; USSD screens all inside 160 characters.
- Journeys and authorisation: **30 of 30** live probes.
- Resilience: **10 of 10** live probes.

## Still open at the end of the cycle

Everything in `human-actions.md`. In short: the clinical board is unstaffed, four
of five languages are unmeasured, the emergency scripts are unrecorded, the
queues have no rota, the managed database has never been restored, and **no
deployment has been made from this branch**. None of those is a code defect, and
none of them can be closed from here.

## Gate deltas

| Gate | Entry | Exit |
|---|---|---|
| Build integrity | PASS | PASS |
| Truth and fitness for purpose | UNTESTED | PASS with two fixed defects |
| Critical functionality | PARTIAL (no duplicate-submission protection) | PASS |
| Security | PASS | PASS |
| Data integrity | PARTIAL (no restore ever performed) | PASS at the data layer, BLOCKED for Cloud SQL |
| Financial integrity | N/A (no payments) | N/A — internal ACU ledger balances |
| Performance | UNTESTED | PARTIAL (read and page PASS, sustained write BLOCKED) |
| Reliability | PARTIAL | PASS locally |
| Observability | UNTESTED locally | PARTIAL (local honest; cloud alerting BLOCKED) |
| Privacy and compliance | PARTIAL | PASS for the operations exercised |
| Operational readiness | FAIL | FAIL — unchanged, and organisational |

## Decision at the end of the cycle

The loop terminates on condition 3 of the execution loop: every remaining
FAIL or BLOCKED item needs a person — credentials, an appointment, a recording,
a rota, a contract or a business decision. Verdict: **NO-GO for public launch,
CONDITIONAL GO available for a supervised pilot** once items 1–4 of
`human-actions.md` are done.
