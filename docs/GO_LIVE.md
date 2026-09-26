# Go live — step by step

This is the ordered procedure for putting CONGO VOICE AI OS in front of
citizens on its own domain. It assumes a Google Cloud project and the Terraform
in `infra/`. Nothing here is optional except where it says so.

Read `docs/LAUNCH_READINESS.md` first. It says what the platform is and is not
ready for, and this runbook does not change that verdict: it gets a **supervised
pilot** onto a real domain safely.

---

## 0. Run it as one command

Everything from §2 to §3 is scripted. Doing it by hand means twenty pasted
blocks into a shell that resets its working directory and its `core/project`
between commands, and a paste that drops one character fails in a way that looks
like an entirely different problem.

```bash
git clone https://github.com/jnnseya-cpu/CONGO-VOICE-AI-OS.git
cd CONGO-VOICE-AI-OS
PROJECT=<your-project-id> bash scripts/go-live.sh
```

It installs Terraform if it is missing, checks billing, enables the APIs,
creates the state bucket, generates and stores the database password, fills in
the variables file, creates the registry, builds the image, pins it by digest,
creates the database and the secret containers, fills every secret, and brings
the service up. It prints the service URL and the DNS records to add.

Every step checks before it acts, so **it is safe to run again** after any
failure: it skips what exists and resumes at the first thing that does not.
Nothing is destroyed. No `gcloud` call depends on ambient configuration.

To supply a real vendor key rather than run on the offline provider:

```bash
export ANTHROPIC_API_KEY=sk-...      # or GEMINI_API_KEY / OPENAI_API_KEY
PROJECT=<your-project-id> bash scripts/go-live.sh
```

The rest of this document is what the script does, and why, step by step. Read
it when something fails or when you need to do one part by hand.

---

## 0a. The machine you run from

Cloud Shell (<https://shell.cloud.google.com>) is the least trouble: it is
already authenticated, and `gcloud`, `docker`, `git` and Node are there. Two
things about it are not obvious and both cost time:

**Terraform is not preinstalled.** It used to be. Install it into `$HOME`, which
is the only directory that survives a session reset — an `apt install` does not:

```bash
mkdir -p ~/bin && cd /tmp
TF=$(curl -s https://checkpoint-api.hashicorp.com/v1/check/terraform \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['current_version'])")
curl -sLO "https://releases.hashicorp.com/terraform/${TF}/terraform_${TF}_linux_amd64.zip"
unzip -oq "terraform_${TF}_linux_amd64.zip" -d ~/bin && rm -f terraform_*.zip
grep -q 'HOME/bin' ~/.bashrc || echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/bin:$PATH" && terraform version
```

**The project ID is not the project name.** Creating a project called "Congo
Voice" produces an id like `congo-voice-478213`. Every command below wants the
id. Find it, set it, and check that billing is actually attached — every step
after this one fails with an unhelpful error if it is not:

```bash
gcloud projects list          # the PROJECT_ID column, not NAME
export PROJECT=<your-project-id>
export REGION=africa-south1
export DOMAIN=congovoicecd.com
gcloud config set project $PROJECT
gcloud billing projects describe $PROJECT   # billingEnabled must be true
```

A local machine works too; it needs `gcloud`, `terraform`, `docker`, `git` and
Node 22, and `gcloud auth login` plus `gcloud auth configure-docker
$REGION-docker.pkg.dev`.

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

## 0b. Choosing a host

The rest of this runbook assumes Google Cloud Run, because the Terraform in
`infra/` targets it. That is a decision, so here is the reasoning and what would
overturn it.

| Host | Verdict |
|---|---|
| **Cloud Run** | Use this. The infrastructure is declared, including the domain mapping, and Cloud Scheduler drives the maintenance endpoint. |
| **Firebase App Hosting** | Fine — it *is* Cloud Run with a build pipeline in front, and `apphosting.yaml` is in the repository. Simpler to operate, less control over the network and the schedule. |
| **A VPS or colo** | Viable, and the right answer in one case: data residency (below). The Dockerfile runs anywhere. |
| **Vercel** | No. See below. |

**Why not Vercel.** `src/server/channels/background.ts` exists because an
operator kills a USSD session after a few seconds and a telephony webhook must
acknowledge immediately, so the citizen's answer is produced *after* the
response is sent and delivered over SMS or WhatsApp. That requires a process
that stays alive past the response, holding tracked promises. A platform whose
functions are frozen when the response returns would drop that answer silently,
which is the worst possible failure mode: the citizen hears the call end
normally and nothing ever arrives. Two smaller reasons point the same way:
`min_instances` is deliberately never zero because a cold start on an IVR call
is a citizen listening to silence, and `scripts.ts` reads `public/audio/…` from
disk at runtime to decide whether a human recording of an emergency script
exists.

**When a VPS is right.** There is no Google Cloud region in the DRC;
`europe-west1` is Belgium. If the programme is required to keep citizen health
data inside the country, that settles it, and no amount of encryption at rest
changes where the bytes are. The cost is that backups, TLS renewal, patching,
scaling, monitoring and the restore exercise become the programme's own work —
and NFR-005, the recovery-time objective, is unproven today precisely because
nobody has yet restored from a backup. Choosing a VPS makes that debt the
operator's rather than the platform's; it does not pay it.

**What does not change.** Whichever is chosen, it is the same container image
and the same application. Steps 4 to 10 below are identical.

## 0c. Where citizen data may go

Decide this before §1, because it constrains the region, the providers and the
carriers all at once. `docs/DATA_RESIDENCY.md` is the full inventory — every
destination, what it receives, and what is lost by refusing it. `npm run
residency:docx` produces the same inventory as a Word document, which is the
form a ministry or a legal reviewer will ask for.

The programme's intent is that everything stays in the DRC. No cloud region
exists in the country, so the pilot runs from the nearest available one and
migrates when one does. The platform is told this explicitly rather than
inferring it:

```hcl
region                  = "africa-south1"   # Johannesburg
deployment_jurisdiction = "ZA"
data_residency          = ["ZA", "US"]      # hosting in ZA, AI and telephony in US
```

A destination outside `data_residency` is **never registered** — it has no code
path, so no ordering, retry or fallback can reach it. A message carrier outside
it returns a delivery failure, which the escalation path reports and the
readiness probe degrades on.

Two things worth knowing before the ministry asks:

- **Moving the container does not move the model.** A voice recording sent to a
  transcription service abroad has left the country whether the server is in
  Johannesburg or Kinshasa. The providers are the residency question.
- **`data_residency = ["CD"]` works today** and puts the platform in offline
  rules mode: it still triages by protocol, detects danger signs, grades
  severity and speaks the fixed emergency scripts — none of that ever used a
  model — but it stops understanding free speech. That is a different product,
  and under a strict localisation requirement it is the honest one.

```bash
# What a deployment would have to admit if asked:
curl -s https://congovoicecd.com/api/v1/system/health | jq '.failing'
```

## 1. Decide the four inputs

Write these down before touching anything. Everything else follows from them.

| Input | Example | Notes |
|---|---|---|
| Domain | `congovoicecd.com` | The origin citizens type. Must be registered and its DNS reachable by you. |
| Environment | `pilot` | `dev`, `staging`, `pilot` or `prod`. **This is not cosmetic** — see §6. |
| Region | `europe-west1` | Latency to Kinshasa. Revisit if a data-residency decision is taken. |
| Province and module for the pilot | Kinshasa, health | The pilot is bounded; the feature flags widen it later. |

---

## 2. Build an image, by digest

The registry has to exist before anything can be pushed into it, and §3 creates
it. Break the circle with a targeted apply first — this touches nothing else:

```bash
cd infra
terraform init -backend-config="bucket=$PROJECT-tfstate"
terraform apply -var-file=environments/pilot.tfvars \
  -target=google_project_service.required \
  -target=google_artifact_registry_repository.app
cd ..
```

New projects run Cloud Build as the Compute Engine default service account,
which can push nowhere and write no logs until it is told it may:

```bash
PN=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
for role in artifactregistry.writer logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$PN-compute@developer.gserviceaccount.com" \
    --role="roles/$role" --condition=None >/dev/null
done
```

Then:

```bash
npm ci
npm run typecheck && npm run lint && npm test
```

Then build in Cloud Build rather than on the machine you are typing on. Cloud
Shell gives you a 5 GB home directory, which a Next.js build plus `node_modules`
plus Docker layers does not comfortably fit in:

```bash
# _TAG, because $SHORT_SHA is empty for a build that no trigger started.
gcloud builds submit --config cloudbuild.yaml --substitutions=\
_REGION=$REGION,_SITE_URL=https://$DOMAIN,_TAG=$(git rev-parse --short HEAD)

# Deploy by digest, never by tag: a tag can be moved under you.
gcloud artifacts docker images describe \
  africa-south1-docker.pkg.dev/$PROJECT/cvos/app:latest --format='value(image_summary.digest)'
```

`NEXT_PUBLIC_SITE_URL` is passed as a build argument because it is inlined into
the browser bundle. An image built without it carries the wrong origin, silently.

## 3. Stand up the infrastructure

State goes in a bucket, not on the machine you ran from. A local state file on a
Cloud Shell VM is gone when the VM is recycled, and state that is gone means
every resource is orphaned — still running, still billing, no longer managed.
It also holds the database password in clear, so it must never sit in a working
copy where it can be committed.

```bash
gcloud storage buckets create gs://$PROJECT-tfstate --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://$PROJECT-tfstate --versioning

cd infra
cp environments/pilot.tfvars.example environments/pilot.tfvars
# Fill in: project_id, image (the digest from §2), public_url, domain.
terraform init -backend-config="bucket=$PROJECT-tfstate"
```

**This is two applies, not one, and the order is forced.** A Cloud Run service
cannot deploy referencing a secret version that does not exist, and the
`DATABASE_URL` it needs cannot be written until the database has an address. So:
everything except the service, then the secret values, then the service.

```bash
# Phase one: the database, the network, the bucket, the identity, and the
# secret CONTAINERS — which Terraform creates empty, on purpose.
terraform apply -var-file=environments/pilot.tfvars \
  -target=google_sql_database_instance.main \
  -target=google_sql_database.app \
  -target=google_sql_user.app \
  -target=google_storage_bucket.media \
  -target=google_service_account.app \
  -target=google_storage_bucket_iam_member.app_media \
  -target=google_project_iam_member.app_sql \
  -target=google_secret_manager_secret.app \
  -target=google_secret_manager_secret_iam_member.app
```

Fifteen to twenty minutes, nearly all of it the PostgreSQL instance. When it
sits on `google_sql_database_instance` for ten minutes it is working, not hung.

Then the values. Terraform never writes a secret value — a person does:

```bash
terraform output secrets_to_populate        # the exact container names
terraform output database_private_ip

printf '%s' "$(openssl rand -hex 32)" | \
  gcloud secrets versions add congovoice-pilot-session_secret --data-file=-
printf '%s' "$(openssl rand -hex 32)" | \
  gcloud secrets versions add congovoice-pilot-data_encryption_key --data-file=-
printf '%s' "$(openssl rand -hex 32)" | \
  gcloud secrets versions add congovoice-pilot-cron_secret --data-file=-

# DATABASE_URL is composed, not generated: the instance has no public address,
# so this string resolves only from inside the service's VPC.
printf '%s' "postgresql://cvos_app:$TF_VAR_db_password@<private-ip>:5432/cvos?sslmode=require" \
  | gcloud secrets versions add congovoice-pilot-database_url --data-file=-
```

The three vendor keys — `anthropic_api_key`, `gemini_api_key`,
`openai_api_key` — still need a version each, because Cloud Run will not mount a
secret that has none. An empty one is a legitimate answer: the gateway treats a
blank credential as *not configured* and stays on the offline provider rather
than registering a vendor whose every call would 401.

```bash
for k in anthropic_api_key gemini_api_key openai_api_key; do
  printf '' | gcloud secrets versions add "congovoice-pilot-$k" --data-file=-
done
```

```bash
# Phase two: everything else — the service, its public invoker, the scheduler
# job and the domain mapping.
terraform apply -var-file=environments/pilot.tfvars
```

> **The data encryption key is not rotatable by editing it.** Phone numbers are
> encrypted with a key derived from it and found through a blind index derived
> from it. Replace it and every stored number becomes unreadable and
> unfindable — the readiness probe reports this rather than hiding it, but the
> damage is already done. `docs/SECURITY.md` describes the rotation procedure.

## 4. The domain

This is the step that is skipped, and the failure is quiet.

**Cloud Run domain mappings are not offered in every region.** If the mapping
step fails, that is what happened — the service itself is fine and answering on
its `run.app` URL. The script attempts the mapping last and on its own so an
unsupported region costs a warning rather than the whole run. Two ways forward:

| Option | When |
|---|---|
| A global external Application Load Balancer in front of the service, with a Google-managed certificate for the domain | Works in every region. The usual answer for a `.cd` domain, and the one to take for the pilot. |
| Redeploy in a region that offers mappings | Only with the latency and the residency change written down. `docs/DATA_RESIDENCY.md` records the jurisdiction the pilot declared; changing the region changes it, and `DATA_RESIDENCY` in the tfvars must change with it or the residency guard will refuse providers it should allow. |

Whichever you choose, `NEXT_PUBLIC_SITE_URL` must end up matching the origin
citizens actually reach. The image has it baked in, so a change means a rebuild.

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
curl -sI https://congovoicecd.com | head -3
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

Terraform sets `DEPLOYMENT_STAGE` from `var.environment`, so this follows the
environment you named in §1 rather than being a separate thing to remember.

It also sets `CRON_OIDC_AUDIENCE` and `CRON_SERVICE_ACCOUNT`, which is how the
maintenance endpoint recognises Cloud Scheduler's identity token. Both must be
present or the scheduler is refused — and a refused scheduler is silent:
reminders stop firing, SLA breaches stop being swept, expired recordings stop
being deleted and the audit chain stops being verified, while everything else
looks healthy. The readiness probe now reports the deployment degraded if no
maintenance run has been recorded for 45 minutes, so this cannot pass unnoticed
again.

## 7. Constitute the Clinical Review Board

Nothing health-related is assessed until this is done (AI-10).

1. Create an account for each member (`/admin/utilisateurs`).
2. Appoint them to their seats — two physicians and one community health
   expert — recording each one's registration number:

```bash
curl -X POST https://congovoicecd.com/api/v1/admin/review/members \
  -H 'content-type: application/json' -H "authorization: Bearer $ADMIN_TOKEN" \
  -d '{"boardKey":"crb","userId":"<uuid>","seat":"physician","credential":"CNOM-…"}'
```

3. Submit each artefact for review, and have the board sign it at
   `/admin/comite`: the ten health protocols, the fixed scripts, the knowledge
   documents and the health system prompts.
4. Confirm: `/admin/comite` shows the board **constituted** and nothing
   outstanding, and `/api/v1/system/health` returns 200.

Steps 1–4 and the first citizen journeys can be rehearsed end to end:

```bash
REHEARSAL_ADMIN=+243… REHEARSAL_PHYSICIANS=+243…,+243… \
REHEARSAL_CHW=+243… REHEARSAL_WORKER=+243… \
npm run rehearsal -- https://congovoicecd.com
```

It signs in over HTTP as each person, seats the board, has the members sign
every piece of health content, then asks the platform real questions as an
anonymous citizen and follows the case into a worker's queue: a danger sign
graded as an emergency with the rules that fired named, an ordinary case
assessed rather than withheld, agriculture answered without an unregistered
chemical rate, education answered, the case acknowledged by a health worker,
and the maintenance job verifying the audit chain. Everything it does, a person
would do on the day — so a green run is the platform working, not a mock of it.

A quorum approves. **One member suspends, alone and immediately** — that is the
rollback power, and it is the button to use when something is found in the
field, not a code change.

## 8. Preflight

Run this against the real origin before anyone is told the number.

```bash
npm run preflight -- https://congovoicecd.com
```

It checks, as an anonymous caller: the readiness probe, that the origin it
serves is the origin it believes in (canonical, `og:url`, sitemap, robots),
that plain HTTP redirects, the security headers, that no private endpoint
answers without a session, that the IVR webhook is reachable, and that the
seeded demonstration administrator cannot sign in. It exits non-zero on any
failure and prints what to fix.

Then the three checks that need a browser:

```bash
npm run rehearsal -- https://congovoicecd.com  # 28 checks: seated, signed, answering
npm run smoke -- https://congovoicecd.com    # 37 behavioural checks
npm run crawl -- https://congovoicecd.com    # every page, console errors, broken links
npm run a11y  -- https://congovoicecd.com    # WCAG 2.2 A/AA, fails on one violation
```

## 9. Connect the channels

Only now, when the origin is right, point the providers at it:

| Channel | Where it goes |
|---|---|
| Voice (IVR) | `https://congovoicecd.com/api/hooks/ivr/twilio` |
| SMS | `https://congovoicecd.com/api/hooks/sms` and `/api/hooks/sms/dlr` |
| WhatsApp | `https://congovoicecd.com/api/hooks/whatsapp` |
| USSD | `https://congovoicecd.com/api/hooks/ussd` |

Set `TWILIO_AUTH_TOKEN` (and the equivalents) at the same time. Until it is set,
signature validation is skipped so the platform still runs offline — which is
right on a laptop and wrong on a public origin. The preflight says so explicitly.

Then place one real call, send one real SMS, and check the interaction appears
in `/historique` and the case in `/cas`.

## 10. Open it, narrowly

```bash
# One province, one module, 5% of traffic, held for seven days.
curl -X POST https://congovoicecd.com/api/v1/admin/feature-flags \
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
