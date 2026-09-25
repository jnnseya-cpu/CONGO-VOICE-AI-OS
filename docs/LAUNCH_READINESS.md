# Launch readiness — go / no-go

Written 25 September 2026, against commit `905f2e7`. This is an assessment of
whether the platform may be put in front of citizens, not of whether the build
is green. A green build says nothing about whether a promise made to a mother at
two in the morning is kept.

## The verdict

**No-go for an open public launch. Go for a supervised pilot,** on the
conditions in §3.

The software is ready to a degree that can be demonstrated rather than claimed:
every deterministic safety rule is individually proven reachable, the
adversarial suite blocks a release on any miss, the perimeter is hardened and
tested, and the platform runs with no vendor keys at all. What is not ready is
not code. It is the human apparatus a national health service needs around
software of this kind: a clinical authority that has approved the protocols,
staffed queues that answer an escalation, and language quality measured with
speakers of the four national languages rather than asserted.

Those cannot be written. They can only be constituted, staffed and measured, and
until they are, the honest position is a pilot with named clinicians watching.

## 1. What is proven, and how

Every claim below is reproducible from this repository.

| Claim | How it is proven |
|---|---|
| 1 144 tests pass | `npm test` |
| Every safety rule is individually reachable and fires | `tests/rule-coverage.test.ts` |
| 126 adversarial cases hold their invariants through the real pipeline | `tests/red-team.test.ts`, run in CI on every change |
| Coverage of the deterministic domain and policy code ≥ 80 % | thresholds in `vitest.config.ts`, enforced, not reported |
| Danger signs are decided before any model call | `src/server/ai/protocols/`, `tests/health-danger-signs.test.ts` |
| Severity is raise-only; only a clinician override lowers it | `src/server/ai/agents/risk.ts` |
| 37 pages load with no console error and no broken link among 209 targets | `node scripts/crawl.mjs` |
| 37/37 behavioural checks against a running production build | `node scripts/smoke.mjs` |
| No WCAG 2.2 A/AA violation on any page | `node scripts/a11y.mjs` |
| Page load inside the objective on a throttled 3G profile | `node scripts/perf-3g.mjs` |
| Personal data is unreadable on disk | `tests/security.test.ts`, and by inspecting the bytes |
| 200 events captured over 72 hours replay exactly once | `tests/offline-capacity.test.ts` |
| Every requirement identifier in both PRDs has a row | `tests/requirements.test.ts`, `docs/REQUIREMENTS.md` |
| The platform runs with no API keys of any kind | the offline provider, and every test above |

## 2. What is not ready

None of these is a defect in the code. Each is a reason not to open the service
to the public today.

1. **No clinical authority has approved the protocols.** Every protocol version
   records an approver and every one currently reads *"En attente du Comité de
   Revue Clinique"*. The mechanism is built; the board is not constituted. A
   national triage service whose decision trees nobody clinically accountable
   has signed is not a service you open to a country.

2. **Language quality is unmeasured in four of the five languages.** The gates
   exist and an unmeasured language is treated as a failure — it falls back to
   fixed scripts rather than to a generated answer — so the behaviour is safe.
   But safe-by-fallback in Lingala, Kikongo, Swahili and Tshiluba means most
   citizens get scripts, which is not the product that was funded.

3. **The fixed emergency scripts are not recorded.** `missingRecordings()`
   reports exactly which. Until a speaker has recorded them, the emergency path
   is synthesised speech in languages whose synthesis quality nobody has
   assessed.

4. **The adversarial corpus is 126 cases against the 300 per module per language
   the specification requires.** Its first run found 24 real defects in the
   platform, which is the strongest available argument for finishing it before
   launch rather than after.

5. **Queues are not staffed.** The platform will open a case, set an SLA clock,
   alert a role and tell the citizen that a person will call. Whether a person
   calls is not a property of this repository.

6. **Nothing has been restored from a backup.** Replication and backup can be
   configured; a recovery-time objective is only real once someone has restored.

## 3. Conditions for a supervised pilot

A pilot may proceed when all of the following hold. The first three are checked
by the platform itself at `/api/v1/admin/status`, which refuses to report ready
without them.

- `DEPLOYMENT_STAGE=pilot`, with a real provider configured for at least one
  alert channel. With none, an escalation reaches nobody and the platform says
  so rather than telling the citizen a person was alerted.
- `DATA_ENCRYPTION_KEY` and `SESSION_SECRET` set, and the encrypted data
  readable with the key in use. A restored or rotated key that does not match
  what wrote the data is reported, not silently ignored.
- `NEXT_PUBLIC_SITE_URL` set to the real origin.
- A named clinician on call for the pilot's hours, with the escalation role
  assigned to real accounts.
- The pilot bounded to one province and one module to start, with the province
  and module feature flags used to widen it — a canary starts at 5 % and is held
  for seven days.
- Daily review of every severity-4 interaction and every safeguarding record for
  the first two weeks, by a person, against the transcript.

## 4. What would change the verdict to a public launch

In order of what blocks hardest:

1. A constituted clinical review board that has signed each protocol version.
2. Measured language quality above the gate in all five languages, with the
   corpus authored and the emergency scripts recorded by native speakers.
3. The adversarial corpus at its specified size, authored with those same
   speakers.
4. Staffed queues with a rota that covers the hours the service is advertised.
5. A restore exercise completed, and a penetration test by someone who did not
   build this.

Until then, the responsible statement is the one at the top of this document: it
is ready to be used carefully, with people watching, in one place, by a service
that can stop it.
