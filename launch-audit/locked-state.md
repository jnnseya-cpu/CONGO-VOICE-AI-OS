# Locked state — 8 November 2026

The durable record of a verified tree. A git tag was intended for this and
could not be pushed: this session's git access permits branch pushes but
refuses tags (`HTTP 403`). A committed record is in any case the more useful
artefact, because it survives a clone, a fork and a container that no longer
exists.

```
commit  c758359177ec4d1ee7c491b90ec7f90a1e22383f
branch  claude/congo-voice-ai-os-3o5r8q
date    2026-11-08
```

To place the tag locally, if wanted:

```
git tag -a locked/2026-11-08 c758359 -m "Verified, locked state"
git push origin locked/2026-11-08     # needs access this session does not have
```

---

## Gates executed on this tree

Every line was run and its result read. Nothing is carried over from an earlier
run and nothing is an estimate.

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | clean — no `any`, no `@ts-ignore` |
| Lint | `npm run lint` | clean |
| Migrations | `npm run db:check` | 1 040 statements, 1 migration, no undeclared destructive statement |
| Inventory | `npm run lock:check` | unchanged |
| Tests | `npm test` | **93 files, 1 794 tests, 0 failures, 432 s** |
| Build | `npm run build` | Next standalone; dependency closure verified |
| SEO | `npm run seo:report` | 30 articles, weakest 100/100, threshold 90 |

Not run here, and why:

| Gate | Why |
|---|---|
| `npm run test:coverage` | Runs in CI; a second full pass adds ~15 min for no new signal at this point |
| `npm audit --omit=dev` | Runs in CI, which has the network path for it |
| `npm run smoke` | Needs a deployed origin; there is none in this environment |

---

## What is locked

`inventory.lock.json`, enforced by `tests/inventory-lock.test.ts` and by the CI
step `npm run lock:check`, which runs **before** the test suite.

| Surface | Count |
|---|---:|
| Database tables | 64 |
| Enums, with their values | 15 |
| `/api/v1` routes | 119 |
| Provider webhooks | 9 |
| Roles | 7 |
| Permissions | 25 |
| Role grant text, and resolved size per role | 7 + 7 |
| AI agents | 12 |
| Model providers | 5 |
| Model capabilities | 4 |
| Scheduler steps | 15 |
| Service objectives | 6 |
| Settable credentials | 17 |
| Never-settable secrets | 8 |
| Channel drivers | 8 |
| Channel mode resolvers | 8 |
| Public pages | 17 |
| Application pages | 27 |
| Blog articles | 30 |
| AI-OS documents | 18 |
| Core documents | 12 |
| Test files | 93 |
| npm scripts | 35 |
| **Content-hashed safety files** | **12** |

### The twelve guarded files

Pinned by content hash, because a behavioural test proves they work today while
a hash proves nobody altered them in a commit that was about something else.

`ai/safety.ts` · `ai/agents/risk.ts` · `ai/agents/workflow.ts` ·
`ai/protocols/engine.ts` · `ai/language/gates.ts` · `ai/review/gate.ts` ·
`core/rbac.ts` · `core/credentials.ts` · `core/status.ts` · `core/mfa.ts` ·
`core/residency.ts` · `channels/modes.ts`

---

## How the lock behaves

| Situation | Result |
|---|---|
| Something removed | Fails, naming it as `DROPPED` |
| Something added | Fails, naming it as added — an unreviewed route is also drift |
| A guarded file edited | Fails, naming the file |
| A deliberate change | `npm run lock`, and commit the lock with the change |

Declaring a change puts it in the diff, where a reviewer sees exactly which
surface moved. Nothing has to be remembered.

### Floors that regenerating the lock cannot lower

Asserted independently of the lock file, so it cannot be used to silence a
failure:

- all seven roles, with `citizen` holding exactly five permissions;
- all five national languages, and all three modules plus `general`;
- every citizen channel — IVR, USSD, SMS, WhatsApp, PWA;
- a voice notification channel, because the people most likely to need an
  escalation followed up are the least likely to read the message about it;
- the offline provider, and all four model capabilities;
- the eight secrets that may never be set from the console;
- the retention, SLA, audit-chain, ACU-cap and language-gate sweeps;
- `/system/ready`, `/system/health` and the `/urgence` page;
- the nine provider webhooks and the eighteen AI-OS documents;
- **no payment-shaped route, table or credential, ever.**

---

## Proven, not assumed

Each guard was made to fire before it was trusted.

| Simulation | Caught by | Restored |
|---|---|---|
| Four surfaces deleted from the lock | Each reported `DROPPED`, exit 1 | ✓ |
| `case:escalate` removed from the shared `FIELD_OFFICER` list — all seven role lines stay byte-identical while five roles lose it | Resolved role sizes (`chw: was 13, now 12`) **and** the `rbac.ts` content hash | ✓ byte-identical |

---

## What the lock found on its first run

Eight figures were wrong across six documents, each hand-counted once and never
checked again. All are corrected, and all are now computed from source:

| Claimed | Actual |
|---|---|
| 27 permissions | **25** |
| 14 scheduler steps | **15** — the fifteenth, `prune_security_counters`, spans a line break the original grep could not cross |
| 29 blog articles | **30** |
| 15 public pages | **17** |
| 28 application pages | **27** |
| chw / agri_officer / teacher: 12 permissions | **13** |
| ngo: 14 | **15** |
| gov_admin: 18 | **22** |
| platform_admin: 19 | **25** |

---

## What this record is not

It is **not a release** and **not a GO**. It states that a tree passed a set of
gates on a date. The production readiness verdict is in
`docs/ai-os/17-production-readiness.md` and is unchanged:

- **GO** for local development
- **CONDITIONAL GO** for a pilot, blocked on four human actions
- **NO-GO** for national production, with 18 open items, among them that no
  independent penetration test has been performed

The lock pins structure and file content. It cannot tell anyone that a
danger-sign rule still escalates correctly — the 1 794 tests do that. The two
are complementary and neither replaces the other.
