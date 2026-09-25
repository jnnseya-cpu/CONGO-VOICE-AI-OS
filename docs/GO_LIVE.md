# Go live — step by step

This is the ordered procedure for putting CONGO VOICE AI OS in front of
citizens on its own domain. It assumes a Google Cloud project and the Terraform
in `infra/`. Nothing here is optional except where it says so.

Read `docs/LAUNCH_READINESS.md` first. It says what the platform is and is not
ready for, and this runbook does not change that verdict: it gets a **supervised
pilot** onto a real domain safely.

---

## 0. What ships where

There is one question people ask first, so it is answered first.

**The backend, the frontend and the shared code are not three deployments. They
are one.** This is a Next.js application: the pages and the API routes are the
same program, and `src/shared` is compiled into both halves of it. There is no
separate API server to host, no separate frontend bucket to upload to, and no
CORS between them because there is no boundary to cross.

| In the repository | At runtime |
|---|---|
| `src/app/**` (pages), `src/client/**` | Server-rendered by the container, and bundled to the browser |
| `src/app/api/**`, `src/app/api/hooks/**`, `src/server/**` | The same Node process inside the same container |
| `src/shared/**` | Compiled into both sides; no separate artifact |
| `public/**` | Static files served by the same process |

One container image → one Cloud Run service. What is genuinely outside it:

| Outside the container | Why |
|---|---|
| PostgreSQL (Cloud SQL) | State has to outlive an instance |
| A storage bucket | A Cloud Run disk does not survive the instance; recordings must |
| Secret Manager | Keys are referenced, never baked into an image |
| The domain and its DNS | See §4 — this is the step most often skipped |

This is a deliberate deviation from the specification's proposed monorepo of
services, argued out in `docs/ARCHITECTURE.md` under **DO-01**. If a reviewer
rejects that reasoning, the split is real work and this runbook changes.

---

## 1. Decide the four inputs

Write these down before touching anything. Everything else follows from them.

| Input | Example | Notes |
|---|---|---|
| Domain | `congovoice.cd` | The origin citizens type. Must be registered and its DNS reachable by you. |
| Environment | `pilot` | `dev`, `staging`, `pilot` or `prod`. **This is not cosmetic** — see §6. |
| Region | `europe-west1` | Latency to Kinshasa. Revisit if a data-residency decision is taken. |
| Province and module for the pilot | Kinshasa, health | The pilot is bounded; the feature flags widen it later. |

---

## 2. Build an image, by digest

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run build

# NEXT_PUBLIC_SITE_URL must be present at BUILD time as well as at runtime.
# The browser bundle inlines it; getting it wrong bakes the wrong origin into
# every page.
docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://congovoice.cd \
  -t europe-west1-docker.pkg.dev/PROJECT/cvos/app:$(git rev-parse --short HEAD) .
docker push europe-west1-docker.pkg.dev/PROJECT/cvos/app:$(git rev-parse --short HEAD)

# Deploy by digest, never by tag: a tag can be moved under you.
docker inspect --format='{{index .RepoDigests 0}}' \
  europe-west1-docker.pkg.dev/PROJECT/cvos/app:$(git rev-parse --short HEAD)
```

## 3. Stand up the infrastructure

```bash
cd infra
cp environments/pilot.tfvars.example environments/pilot.tfvars
# Fill in: project_id, image (the digest from §2), public_url, domain, db_password.
terraform init
terraform plan  -var-file=environments/pilot.tfvars
terraform apply -var-file=environments/pilot.tfvars
```

This creates the Cloud Run service, a PostgreSQL instance reachable only over a
private address, the media bucket, the service account, the scheduler job, and
**empty** secrets. Fill each one:

```bash
terraform output secrets_to_populate
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets versions add cvos-pilot-session-secret     --data-file=-
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets versions add cvos-pilot-data-encryption-key --data-file=-
# …and one version per remaining secret.
```

> **The data encryption key is not rotatable by editing it.** Phone numbers are
> encrypted with a key derived from it and found through a blind index derived
> from it. Replace it and every stored number becomes unreadable and
> unfindable — the readiness probe reports this rather than hiding it, but the
> damage is already done. `docs/SECURITY.md` describes the rotation procedure.

## 4. The domain

This is the step that is skipped, and the failure is quiet.

`NEXT_PUBLIC_SITE_URL` is what canonical links, the sitemap, social images and
the telephony callback URLs are built from. The telephony provider signs each
webhook over **the full URL it called**. A service reachable on one origin while
believing it lives on another rejects every inbound call with a signature
failure that looks exactly like a telephony fault.

```bash
# Terraform created the mapping. Get the records it needs:
terraform output dns_records_to_create
```

- **The zone is yours in Cloud DNS** → set `manage_dns = true` and
  `dns_zone_name`, and Terraform writes the apex `A`/`AAAA` records and the
  `www` `CNAME` for you.
- **The zone is at a registrar or a ministry's DNS** (the usual case for `.cd`)
  → add the records by hand at the registrar, exactly as printed.

Then verify the domain in Google Search Console if Cloud Run asks for it, and
wait for the managed certificate. It is normally minutes and can be an hour.

```bash
# Certificate issued and the domain answering?
curl -sI https://congovoice.cd | head -3
```

## 5. Migrate and seed — carefully

Migrations are applied at boot by the application itself, so the first request
after deploy creates the schema. Two things to get right:

```bash
# Confirm the migration carries no destructive statement before it ever runs.
npm run db:check
```

**Do not run `npm run seed` against a pilot or production database.** It is
synthetic demonstration data in five languages, and it refuses to run in
production for that reason. Create the real accounts instead, through
`/admin/utilisateurs`, and give each one a PIN that is not `1234`.

## 6. Set the stage, and understand what it changes

`DEPLOYMENT_STAGE` is not a label. `pilot` and `prod` are the two values at
which the platform assumes a real citizen is on the other end, and three
behaviours change:

1. **An escalation must be able to reach a person.** With no SMS, WhatsApp or
   voice provider configured, the readiness probe reports degraded rather than
   letting the platform tell a citizen that someone was alerted.
2. **Clinical content must be signed.** Without a current Clinical Review Board
   approval the platform will escalate and refer, but it will not assess — it
   cannot tell anyone their situation is less than urgent on nobody's authority.
   See §7.
3. **Log-only providers fail loudly** instead of pretending a message was sent.

## 7. Constitute the Clinical Review Board

Nothing health-related is assessed until this is done (AI-10).

1. Create an account for each member (`/admin/utilisateurs`).
2. Appoint them to their seats — two physicians and one community health
   expert — recording each one's registration number:

```bash
curl -X POST https://congovoice.cd/api/v1/admin/review/members \
  -H 'content-type: application/json' -H "authorization: Bearer $ADMIN_TOKEN" \
  -d '{"boardKey":"crb","userId":"<uuid>","seat":"physician","credential":"CNOM-…"}'
```

3. Submit each artefact for review, and have the board sign it at
   `/admin/comite`: the ten health protocols, the fixed scripts, the knowledge
   documents and the health system prompts.
4. Confirm: `/admin/comite` shows the board **constituted** and nothing
   outstanding, and `/api/v1/system/health` returns 200.

A quorum approves. **One member suspends, alone and immediately** — that is the
rollback power, and it is the button to use when something is found in the
field, not a code change.

## 8. Preflight

Run this against the real origin before anyone is told the number.

```bash
npm run preflight -- https://congovoice.cd
```

It checks, as an anonymous caller: the readiness probe, that the origin it
serves is the origin it believes in (canonical, `og:url`, sitemap, robots),
that plain HTTP redirects, the security headers, that no private endpoint
answers without a session, that the IVR webhook is reachable, and that the
seeded demonstration administrator cannot sign in. It exits non-zero on any
failure and prints what to fix.

Then the three checks that need a browser:

```bash
npm run smoke -- https://congovoice.cd    # 37 behavioural checks
npm run crawl -- https://congovoice.cd    # every page, console errors, broken links
npm run a11y  -- https://congovoice.cd    # WCAG 2.2 A/AA, fails on one violation
```

## 9. Connect the channels

Only now, when the origin is right, point the providers at it:

| Channel | Where it goes |
|---|---|
| Voice (IVR) | `https://congovoice.cd/api/hooks/ivr/twilio` |
| SMS | `https://congovoice.cd/api/hooks/sms` and `/api/hooks/sms/dlr` |
| WhatsApp | `https://congovoice.cd/api/hooks/whatsapp` |
| USSD | `https://congovoice.cd/api/hooks/ussd` |

Set `TWILIO_AUTH_TOKEN` (and the equivalents) at the same time. Until it is set,
signature validation is skipped so the platform still runs offline — which is
right on a laptop and wrong on a public origin. The preflight says so explicitly.

Then place one real call, send one real SMS, and check the interaction appears
in `/historique` and the case in `/cas`.

## 10. Open it, narrowly

```bash
# One province, one module, 5% of traffic, held for seven days.
curl -X POST https://congovoice.cd/api/v1/admin/feature-flags \
  -H 'content-type: application/json' -H "authorization: Bearer $ADMIN_TOKEN" \
  -d '{"key":"module.health","enabled":true,"modules":["health"],"provinces":["Kinshasa"],"startCanary":true}'
```

For the first two weeks, a person reads **every** severity-4 interaction and
**every** safeguarding record against the transcript, daily. That is not a
formality: the adversarial corpus found 24 real defects on its first run, and
the field will find more.

---

## Rolling back

| Symptom | Action |
|---|---|
| A protocol gives wrong advice | A board member suspends it at `/admin/comite`. Takes effect on the next turn. |
| A release is bad | `terraform apply` with the previous image digest. The database schema is forward-compatible within a release. |
| A language degrades | It falls to scripted mode on its own when the quality gate fails; the flag can also force it. |
| Everything is wrong | Set `DEPLOYMENT_STAGE=staging` and take the number out of circulation. The platform stops claiming a person was alerted. |

## What this runbook does not give you

A restore exercise (nobody has run one), a load test to ten times peak, a
penetration test, reverse billing so the call is free to the citizen, and the
recorded scripts and speech corpus that would take the four national languages
out of scripted mode. Those are in `docs/REQUIREMENTS.md` with the owner of each
named, and in `docs/LAUNCH_READINESS.md` with what they block.
