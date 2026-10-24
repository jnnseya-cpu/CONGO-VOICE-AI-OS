# Defects — one record each

Severity: **P0** catastrophic · **P1** critical · **P2** high · **P3** medium ·
**P4** low. Every record below was reproduced, fixed, retested and regression-tested
unless its status says otherwise.

---

## D-01 — A photograph sent under the documented field name is silently discarded

- **Severity** P2 · **Blocker** no · **Area** interactions API, agriculture journey
- **Environment** release candidate, local production build · **Role** any citizen or integrator
- **Preconditions** a multipart `POST /api/v1/interactions` carrying `images[]`, the
  spelling published in `docs/API.md` and in the route's own comment
- **Steps** post `text` + `module=agriculture` + one HEIC under `images[]`
- **Expected** the photograph is analysed, or the request is refused
- **Actual** HTTP 200 with a confident diagnosis — "Mosaïque africaine du manioc
  (48 %)" — produced from the text alone. `attachmentIds` absent. Nothing told
  the caller their photograph had been dropped
- **Frequency** every time · **Evidence** `/tmp` probe output reproduced in
  `tests/interaction-attachments.test.ts`
- **Impact** a farmer, or a ministry system integrating against the documentation,
  is given a crop-disease name and a percentage that did not come from the
  photograph they relied on. It is the platform's own definition of a false
  success
- **Root cause** the handler read `form.getAll("images")`; the documentation and
  the route's doc comment said `images[]`. The client happened to send `images`,
  so it was invisible from inside the product
- **Fix** both spellings accepted; a file under any other field name is refused
  with a message naming the right one; `docs/API.md` and the comment corrected
- **Regression test** `tests/interaction-attachments.test.ts` (4 cases)
- **Retest** PASS — documented field accepted, client field accepted, unknown
  field refused 400, non-image refused 400
- **Residual risk** none known · **Status** FIXED

---

## D-02 — A double tap created two interactions, and for a danger sign two cases

- **Severity** P2 · **Blocker** no · **Area** interactions API, every journey
- **Preconditions** the same question posted twice with one `Idempotency-Key`
- **Expected** one interaction; the second call returns the first answer
- **Actual** two interactions with different ids. The channel route for queued
  offline turns honoured the header; this route — the one the application posts
  to and the one the documentation gives integrators — ignored it
- **Impact** a citizen double-tapping on a slow connection, or any client
  retrying after a timeout, produces two turns. On a danger sign that is two
  critical cases and two people alerted to one child, which is how a queue stops
  being trusted
- **Root cause** `withIdempotency` was never wired into `POST /api/v1/interactions`
- **Fix** the route honours `Idempotency-Key`, keyed per account, with a request
  fingerprint so the same key used for a different question is refused 409
  rather than silently answered with the wrong result
- **Regression test** `tests/interaction-attachments.test.ts` (3 cases) and
  live probe `RS-08`
- **Retest** PASS — one interaction in the database, identical answer returned,
  409 on a conflicting reuse, unkeyed requests unaffected
- **Status** FIXED

---

## D-03 — Every citizen was shown an English slogan as the first line

- **Severity** P3 · **Blocker** no · **Area** citizen shell, i18n
- **Steps** open the home page or the sign-in page at 360 px in any language
- **Expected** the first sentence a citizen reads is in their language
- **Actual** "Your Voice. Our Intelligence. Stronger Congo." — defined once, in
  the French dictionary, in English, and inherited by all five languages
- **Impact** four of the five audiences do not read English, and the platform's
  own rule is that citizen-facing text is French canonical and then localised
- **Fix** the two citizen surfaces render `hero_sub`, which already exists,
  reviewed, in all five languages. The brand line stays in `src/shared/site.ts`
  for metadata and social cards, where an international reader sees it. No
  translation was invented
- **Regression test** `tests/i18n-citizen-copy.test.ts` (3 cases, including that
  the five renderings are distinct)
- **Retest** PASS — live first screen now reads "L'IA au service de la santé…"
- **Residual risk** whether the programme wants a localised slogan at all is a
  branding decision; it is on the human-action list
- **Status** FIXED

---

## D-04 — Every visitor who chose a language spent a request on a guaranteed 401

- **Severity** P4 · **Blocker** no · **Area** client shell
- **Actual** the language provider wrote the choice to the profile for everybody,
  including anonymous visitors, whose write always failed. One wasted request on
  a metered connection and one console error that real error monitoring then has
  to learn to ignore
- **Fix** the profile write happens only when a session exists; the cookie, which
  is the actual persistence, is unchanged
- **Retest** PASS — the novice walkthrough now completes with no page errors at all
- **Status** FIXED

---

## D-05 — The write path could not be load-tested, and the tool crashed rather than saying so

- **Severity** P3 · **Blocker** no · **Area** performance tooling
- **Actual** `scripts/loadtest.mjs` drove every virtual user through one anonymous
  session, so the AI limit (30/min/account) returned 429 for 96–100 % of write
  requests; after a session per user was added, the sign-in limit
  (10/min/address) threw an unhandled error
- **Impact** the platform's write capacity was unmeasured while the report implied
  it had been tested
- **Fix** a session per virtual user, rotated before the per-account ceiling, and
  the rate ceiling reported as "NOT MEASURABLE from one address" with the two
  limits named, instead of an exception
- **Retest** write p95 **177 ms at 1 concurrent** and **788 ms at 5** (target
  4000 ms), 0 % errors; above that the limiter binds, by design
- **Residual risk** a true sustained write figure needs several source addresses
  or a load-test environment with both limits raised. On the human-action list
- **Status** FIXED (tool) · performance of the write path **PARTIAL**

---

## D-06 — The artefact check could fail a sound image, and the deployed image lagged a Node security release

Recorded in the previous cycle and already fixed (commit `96d9b87`): the
standalone checker verified hoisting rather than resolution, and `.nvmrc` pinned
a Node patch level below the 21 October security releases. Both retested.

---

## Observations that are not defects

- `/api/v1/auth/me` answers 401 to a first-time visitor. A client discovering
  whether a session exists has to ask, and 401 is the answer; nothing is logged
  server-side and no retry storm follows.
- The brand link on the first screen is 175×34 px, under the 44 px guidance. It
  is the logo, not an action, and every primary action measured 207×58 or larger.
- A health worker can read a case outside their own territory (module-scoped
  only), and any `report:export` holder can download another organisation's
  report. Both are recorded in `docs/SECURITY.md` §7 as decisions the programme
  owns rather than silent omissions.

## Harness artefacts — findings that did not survive verification

Recorded because they show what the evidence rule is for. Five probe "failures"
were my own instrumentation: an anonymous session opened through the wrong
endpoint; a report job read under the wrong response key; a translation helper
called with language descriptors instead of codes; a French-only regex run
against a page that was in Lingala; and Playwright's `.first()` repeatedly
selecting an off-canvas element rather than the one a person can see. Each was
investigated and withdrawn rather than reported.
