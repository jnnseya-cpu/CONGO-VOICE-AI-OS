# Human action list

Everything here is outside an agent's authority. Each item says what is needed,
why it blocks, and what resumes the moment it arrives.

## Blocks any launch

1. **Appoint the Clinical Review Board and sign the content.**
   Needed: three named people — two physicians and one community-health expert —
   with accounts, who sign each protocol version, fixed script, knowledge
   document and health prompt at `/admin/comite`.
   Why it blocks: until they have signed, the platform refers and escalates but
   will not assess, and its own readiness probe reports degraded. The machinery
   is built and enforced; the seats are empty.
   On arrival: the readiness check clears and the assessment path can be
   exercised end to end against real protocol text.

2. **Deploy the release candidate.**
   Needed: credentials for the `congo-voice` project; this environment has none
   (`gcloud auth list` → "No credentialed accounts"). Command prepared:
   `gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=africa-south1,_SITE_URL=https://congovoicecd.com,_TAG=$(git rev-parse --short HEAD)`
   then deploy that tag to `congovoice-pilot`.
   Why it blocks: nothing in this audit is evidence about the live service, and
   the running revision still predates the Node 22.23.4 security releases.
   On arrival: re-run `scripts/smoke.mjs`, `crawl.mjs`, `a11y.mjs`,
   `pwa-offline.mjs` and `perf-3g.mjs` against the real origin, and the whole
   gate table can be re-scored on the deployed build.

3. **Wire one real alert channel.**
   Needed: a configured SMS, WhatsApp or voice provider for the pilot's province.
   Why it blocks: with none, an escalation reaches nobody and the platform says
   so rather than pretending. `escalation_delivery` is one of the five failing
   health checks.

4. **Declare the residency policy.**
   Needed: values for `DATA_RESIDENCY` and `DEPLOYMENT_JURISDICTION`.
   Why it blocks: two of the five failing health checks are these, and they are
   configuration rather than engineering — the programme has to state which
   jurisdictions it permits.

## Blocks a public launch (not a supervised pilot)

5. **Measure language quality in the four national languages**, with the corpus
   authored and the emergency scripts recorded by native speakers. Until then
   those languages answer from scripts, which is safe and is not the product that
   was funded.
6. **Grow the adversarial corpus** from 181 cases to the 300 per module per
   language the specification asks for, authored with those same speakers.
7. **Staff the queues** with a rota covering the advertised hours.
8. **Run a Cloud SQL point-in-time restore.** A data-layer restore was proven
   here (69 MB, 3 s, recovery point honoured); the managed database has never
   been restored.
9. **Commission an independent penetration test.** Nothing in this audit
   substitutes for one.

## Needed to finish specific measurements

10. **A load-test environment or several source addresses.** The platform's own
    limits — ten sign-ins a minute per address, thirty AI calls a minute per
    account — bind before its capacity does, so sustained write throughput cannot
    be measured from one machine. Raise `RATE_LIMIT_MAX_AUTH_REQUESTS` and
    `RATE_LIMIT_MAX_AI_REQUESTS` deliberately in a dedicated environment, or
    drive the test distributed.
11. **Provider keys in a sandbox project** to measure transcription accuracy,
    answer quality, latency with a real model, and cost per interaction. Every AI
    figure in this audit is the offline provider.
12. **Non-Chromium browsers and real handsets** for the device matrix.
13. **Cloud monitoring and alerting** (`scripts/alerts.sh` needs the project), then
    a controlled failure to prove each alert reaches a named person.

## Decisions only the programme owner can make

14. **The citizen-facing slogan.** The English brand line has been removed from
    the two citizen surfaces and replaced with the localised promise sentence
    that already existed in all five languages. Whether the programme wants a
    localised slogan of its own, and in whose words, is a branding decision.
15. **Whether a field role should read cases outside its own territory**, and
    whether a partner organisation should be able to download another
    organisation's report. Both are recorded in `docs/SECURITY.md` §7; both are
    product decisions with real operational cost either way.
16. **Legal sign-off** on the terms, privacy notice, cookie wording and refund or
    liability language for the target regions.
