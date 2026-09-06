# Deployment

CONGO VOICE AI OS is a single Next.js 16 application (frontend + API) with an embedded or external PostgreSQL database. It runs on any Node.js 22 host; the reference target is Google Cloud (Cloud Run or GKE + Cloud SQL + Cloud Storage), which matches the programme's portfolio conventions.

## 1. Minimal (pilot / demo)
```bash
npm ci
npm run build
SESSION_SECRET=$(openssl rand -hex 32) DATA_DIR=/var/lib/cvos npm start
```
The embedded PGlite database and uploads live under `DATA_DIR`. Suitable for a single instance.

## 2. Production (Google Cloud)
| Component | Setting |
|-----------|---------|
| Database | Cloud SQL PostgreSQL 16 — `DATABASE_URL=postgresql://user:pass@host:5432/cvos` (migrations in `drizzle/` run automatically at boot) |
| Media | `STORAGE_DRIVER=gcs`, `GCS_BUCKET=…` (install `@google-cloud/storage` in the image) — signed access, retention policies on the bucket |
| Secrets | Secret Manager → env vars (`SESSION_SECRET`, provider keys, telephony tokens). Never in the image. |
| Compute | Cloud Run (min instances ≥ 1 for IVR latency) or GKE Autopilot; 1 vCPU / 1 GB is enough for pilot volumes |
| Scheduler | Cloud Scheduler → `POST /api/v1/workflow/run` with header `x-cron-secret: $CRON_SECRET` every 5 minutes (reminders, SLA sweep, report jobs, audit integrity) |
| Edge | Cloud Armor / WAF in front; HTTPS only; `Permissions-Policy` restricts microphone/camera to same origin |
| Observability | Cloud Logging picks up structured logs; `/api/v1/system/health` for probes; request logs in `api_request_logs` |

## 2b. Public site and search engines

Set `NEXT_PUBLIC_SITE_URL` to the live origin (for example `https://congovoice.cd`). It drives the canonical links, `robots.txt`, `sitemap.xml` and the social preview image, and it flips the public pages from "address being activated" to live. `robots.txt` allows the public programme pages and disallows `/api`, `/cas`, `/admin`, `/tableau-de-bord`, `/historique`, `/messages`, `/notifications`, `/parametres`, `/rapports`, `/recherche`, `/langues`, `/ressources` and `/connexion`; keep that list in step with any new route that can display citizen data. Register the domain, then submit `${NEXT_PUBLIC_SITE_URL}/sitemap.xml` to the search engines used in the country.

## 3. AI providers
Set any subset; routing order is configurable (`AI_LLM_ORDER`, `AI_VISION_ORDER`, `AI_STT_ORDER`, `AI_TTS_ORDER`). With none set the platform runs in offline rules mode (`AI_ALLOW_MOCK=true`), which is also the degraded mode when every provider fails. Provider names never reach clients.

## 4. Channels
| Channel | Configuration |
|---------|---------------|
| WhatsApp (Meta Cloud API) | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`; webhook `https://<host>/api/hooks/whatsapp`; submit template messages for approval in Phase 0 |
| Voice call / IVR (Twilio) | Voice webhook `https://<host>/api/hooks/ivr/twilio`; `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; toll-free/short code agreed with MNOs |
| USSD / SMS (Africa's Talking) | `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`, `AFRICASTALKING_SENDER`; callbacks `/api/hooks/ussd`, `/api/hooks/sms`, `/api/hooks/sms/dlr` |
| PWA | served by the app; installable; offline queue and background sync built in |

## 5. Data residency and sovereignty
Primary region `europe-west1` for latency to Kinshasa, with a documented path to a Kinshasa-hosted node (Phase 5): the stack is portable (PostgreSQL, object storage, Node). All citizen data is exportable (`/api/v1/reports/*`, `/api/v1/language/export`).

## 6. Hardening checklist
- `SESSION_SECRET` ≥ 32 random bytes; rotate on incident.
- MFA enabled for admin and supervisor roles; break-glass access reviewed weekly.
- Retention: raw audio 90 days (configurable), agri media 12 months, structured records per programme policy; erasure requests honoured within 30 days.
- Quarterly penetration test; dependency scanning in CI; backups restore-tested.
