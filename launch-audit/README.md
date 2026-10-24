# Launch audit

Executed on 24 October 2026 against a production build of this branch, served
locally. Read `evidence-ledger.md` first: it says what was run, what passed, and
— at the end — what could not be tested here and why.

| File | What it holds |
|---|---|
| `evidence-ledger.md` | every check, its command, its status and its evidence |
| `defects.md` | one record per defect: reproduction, root cause, fix, retest. Includes the probe artefacts that did **not** survive verification |
| `truth-audit.md` | every load-bearing public claim, performed rather than read |
| `novice-walkthrough.md` | a first-time user on a 360 px phone over slow 3G, timed |
| `human-actions.md` | what only a person can do, and what resumes when it arrives |
| `cycle-reports/cycle-1.md` | what was fixed, what broke, what remains, gate deltas |
| `evidence/` | screenshots and tool output |

The probes are runnable:

```
node launch-audit/probe-channels.mjs    http://127.0.0.1:3210   # USSD, SMS, IVR, WhatsApp
node launch-audit/probe-journeys.mjs    http://127.0.0.1:3210   # journeys, permissions, API abuse
node launch-audit/probe-truth.mjs       http://127.0.0.1:3210   # the public claims
node launch-audit/probe-resilience.mjs  http://127.0.0.1:3210   # failure, idempotency, concurrency
node launch-audit/probe-novice.mjs      http://127.0.0.1:3210   # the first-time user
bash launch-audit/dr-drill-local.sh                             # snapshot and restore, timed
```

They need a running instance and the platform's own seeded accounts
(`npm run seed`). `CRON_SECRET` must be exported for the scheduler probes. None
of them sends a message, charges anything or touches production: the messaging
drivers are the log providers and the data directory is a scratch copy.

Nothing in here is evidence about the deployed service. No deployment has been
made from this branch.
