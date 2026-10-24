# Truth audit — does the platform do what it says?

Method: every load-bearing public claim was performed against a running release
candidate (production build, `.next/standalone`, embedded PostgreSQL, no vendor
keys), not read in the code. Evidence commands are in `probe-truth.mjs`,
`probe-channels.mjs`, `probe-journeys.mjs` and `probe-resilience.mjs`.

Status key — **REAL** works end to end · **PARTIAL** works in part · **STUBBED**
placeholder or canned · **ABSENT** copy only · **BROKEN** fails · **BLOCKED**
cannot be judged here and why.

| Claim | Where it is made | Status | Evidence |
|---|---|---|---|
| A question can be asked in any of the five languages and is answered | home, `/services`, `/langues-nationales` | **REAL** | five turns posted, five answers 117–162 characters, all HTTP 200 |
| The language is detected rather than asked for | `/langues-nationales` | **REAL** | 4 of 5 detected as sent; the Kikongo sample contained a French word and came back `fr`, which is the behaviour the quality gates describe for an unmeasured language |
| A danger sign is caught and produces an emergency instruction, a case and a human alert | `/services`, `/urgence`, `/aide` | **REAL** | "convulsions… ne tète plus" → critical case `c9b1a1de…`, emergency wording, case present in the health worker's queue graded `critical` |
| The whole platform runs with no AI provider keys of any kind | `/gouvernance`, README, `/financement` | **REAL** | this entire audit ran with `ANTHROPIC/OPENAI/GEMINI/TWILIO/WHATSAPP` all unset; every answer above came from the offline provider |
| Photograph a plant and get a diagnosis | `/services`, `/acces` | **REAL** (mechanism) · **BLOCKED** (quality) | a real 718 KB iPhone HEIC was accepted, decoded and answered with an image-informed result (62 % confidence, different from the text-only 48 %); a 512 px app icon was answered with "the photo is hard to read — take it again in daylight" rather than an invented diagnosis. Diagnostic *accuracy* needs a vision provider key and is not measurable here |
| A file that is not really an image is refused | `docs/SECURITY.md` | **REAL** | `MZ\x90\x00…` named `payload.jpg` → HTTP 400 with a French explanation |
| Works without a smartphone: USSD, SMS, IVR | `/acces`, `/services` | **REAL** | USSD four-screen menu walked to completion, every screen inside the operator's 160-character limit; inbound SMS accepted and its gateway replay absorbed; IVR and WhatsApp webhooks refuse an unsigned or forged request with 403/401 |
| Everything is saved: input, answer, risk, language, module, timestamp | `/gouvernance`, CLAUDE.md | **REAL** | 5 of 5 sampled interactions carry language, module, risk and timestamp |
| The audit trail is hash-chained | `/gouvernance`, blog | **REAL** | 5 of 5 sampled rows carry `hash` and `prevHash`; the scheduler's daily verification reported `{date: 2026-10-23, ok: true}` |
| Institutional reports carry definitions, denominators and a suppression rule | `/financement`, `/gouvernance`, blog | **REAL** | report job queued → running → ready; CSV downloaded with period, scope, data-freshness, definitions, denominators and the "effectif inférieur à 5 masqué" rule; unauthenticated download refused 401 |
| Every AI call is metered and the ledger adds up | `/financement`, blog | **REAL** (mechanism) · **BLOCKED** (money) | ledger rows written per call with task, and the per-task sum equals the reported total; the offline provider's cost is genuinely 0, so a cost-per-interaction figure needs a real provider |
| A person can ask for a copy of their data, or for erasure | `/confidentialite` | **REAL** | both requests accepted and recorded with a 30-day due date and a legal-hold flag |
| A plafond stops non-urgent AI, never a safeguard | `/financement` | **PARTIAL** | the thresholds and the degraded path are unit-tested; driving a real tenant to 100 % of a cap was not performed in this environment |
| Measured language quality in five languages | `/langues-nationales` | **ABSENT by design, and stated as such** | the gates exist and an unmeasured language falls back to scripts; four of five languages have no measurement, which `docs/LAUNCH_READINESS.md` §2 already declares a launch blocker |
| WCAG 2.2 AA | `/accessibilite` | **REAL** (automated scope) | axe-core, no A/AA violation on 38 pages; the page itself separates what is implemented from what is not, and screen-reader fieldwork is not claimed |

## Defects this phase produced

- **D-01** the published API contract named an image field the server did not
  read, so an integrator's photograph was discarded while the answer still named
  a crop disease and a confidence. Fixed and tested.
- **D-02** a file under any unread field name was dropped silently. Now refused
  with a message naming the field to use.

No stubbed dashboard, no canned AI response, no "coming soon" behind a live
button, and no hard-coded demo content on a public surface was found.
