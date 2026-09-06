# API reference (`/api/v1`)

All endpoints: HTTPS, JSON (or `multipart/form-data` for media), versioned under `/api/v1`. Authentication is a signed session cookie (`cvai_session`) or `Authorization: Bearer <token>` returned by login. Every route passes through the same handler: authentication → permission check (RBAC matrix in `core/rbac.ts`) → rate limiting (`default` 120/min, `ai` 30/min per user or IP) → request logging (`api_request_logs`) → uniform errors `{ error: { code, message, details? } }` → audit hooks. Channel webhooks under `/api/hooks/*` are signature-verified instead of session-authenticated.

| Group | Method & path | Permission | Purpose |
|-------|---------------|-----------|---------|
| Auth | `POST /auth/login` | public | `{phone, pin}` for registered users or `{anonymous:true, language, province, consent}` for citizens → `{user, token}` + cookie |
| | `POST /auth/logout` · `GET /auth/me` · `PATCH /auth/me` | session | profile, language, province, consent, preferences |
| | `POST /auth/mfa/setup` · `POST /auth/mfa/verify` | admin/supervisor | TOTP step-up (see operations module) |
| Users | `GET /users?role=` · `POST /users` | `user:manage` | institutional accounts (phone, PIN, role, province, organisation) |
| Interactions | `POST /interactions` | `interaction:create` (ai limit) | JSON `{text, module?, province?, wantsAudio?}` or multipart `text, module, audio, images[]` → the full turn result (seven-part answer, localised answer, follow-ups, case id, audio URL) |
| | `GET /interactions?module=&scope=all` · `GET /interactions/{id}` | `interaction:read_own` / `interaction:read_all` | history and detail (no prompts, no provider names) |
| | `POST /interactions/{id}/feedback` | `feedback:create` | `{rating, useful, comment, misunderstood, speechRating}` — feeds the language learning loop |
| Sessions (channels) | `POST /sessions` · `GET /sessions/{id}` · `POST /sessions/{id}/resume` · `POST /sessions/{id}/turns` (multipart, `Idempotency-Key`) · `GET /sessions/{id}/stream` (SSE) · `GET /workflows/{id}` | `interaction:create` | channel-agnostic conversation service used by IVR, WhatsApp, USSD/SMS and the PWA |
| Media | `POST /files` (multipart `files[]`) · `GET /files/{id}` · `POST /media/uploads` (resumable) | owner or `case:read` | uploads and secure download |
| Speech | `POST /tts` `{text, language}` | `interaction:create` (ai limit) | audio or `204` (use on-device synthesis) |
| Cases | `GET /cases?status=&module=&mine=1` · `POST /cases` · `GET /cases/{id}` · `PATCH /cases/{id}` | `case:read` / `case:write` (module-scoped for field roles) | queue, manual creation, workspace, status/assignment/notes |
| | `POST /cases/{id}/escalate` · `/acknowledge` · `/transitions` · `/assignments` · `/risk-overrides` · `/follow-ups` · `/notes` · `/merge` | `case:escalate` / `case:write` | full state machine, SLA, overrides with mandatory reason |
| Tasks & queues | `GET /tasks` · `GET /queues` | `case:read` | worker tasks, queue depth and oldest item |
| Notifications | `GET /notifications?unread=1` · `PATCH /notifications/{id}` · `POST /notifications/{id}/ack` · `POST /notifications/broadcast` | `notification:read_own` / `notification:broadcast` | inbox, acknowledgement, programme broadcasts |
| Reminders | `GET/POST /reminders` | citizen | vaccination, ANC, planting, revision reminders (consent-gated) |
| Autosave | `PUT /autosave` `{clientKey, module, language, payload}` · `GET /autosave?clientKey=` | `autosave:write` | drafts with version history |
| Analytics | `GET /analytics/dashboard` · `/analytics/activity` · `/analytics/alerts` · `/analytics/insight` · `/analytics/module/{health|agriculture|education}` | dashboard permissions | command dashboard, module dashboards, data-derived alerts and insight |
| Reports | `GET /reports/{interactions|cases|health|agriculture|education|audit|usage}?days=30` (CSV) · `POST /report-jobs` · `GET /report-jobs/{id}` · `GET /report-jobs/{id}/download` · `/report-definitions` | `report:export` | exports (CSV/XLSX/PDF), async jobs, scheduled definitions |
| Metering | `GET /metering/acu?scope=&period=` | admin/gov | ACU consumption, cost per interaction, caps |
| Knowledge & protocols | `GET /knowledge/search?module=&q=` · `GET /admin/kb` · `POST /admin/kb` · `GET /admin/protocols` · `PATCH /admin/protocols/{id}` · `GET /health/protocols` · `GET /health/vaccination-schedule` · `GET /health/facilities` | authenticated / `admin:config` | approved knowledge, protocol lifecycle, EPI calendar, referral directory |
| Agriculture | `GET /agriculture/prices` · `POST /agriculture/prices/upload` · `GET /agriculture/calendar` · `GET /agriculture/weather` · `GET/PATCH /agriculture/clusters` · `GET /agriculture/registry` | authenticated / officer | market sheet, planting calendars, forecasts, outbreak clusters, input registry |
| Education | `GET/PUT /education/profile` · `POST /education/quiz` · `POST /education/quiz/{id}/answer` · `GET /education/stories` · `POST /education/lessons` · `GET /education/evidence` · `POST /education/plan` | learner / teacher | learner profile, oral quizzes, stories, lessons, evidence, revision plans |
| Language learning | `GET /language/samples` · `PATCH /language/samples/{id}` · `GET/POST /language/lexicon` · `GET /language/proficiency` · `GET /language/export?language=` | `language:review` / `language:export` | native-speaker review queue, lexicon, proficiency, datasets |
| Consent & privacy | `GET/POST /consents` · `GET/POST /data-requests` | citizen | purpose-specific consents, access/erasure requests |
| Admin | `GET /admin/status` · `GET /admin/stats` · `GET/PUT /admin/config` · `POST /admin/seed` · `/admin/tenants` · `/admin/organisations` · `/admin/templates` · `/admin/break-glass` · `GET /audit-logs` | `dashboard:admin` / `admin:config` / `audit:read` | platform status (internal keys only), usage and cost, configuration, tenancy, templates, break-glass, audit trail |
| System | `GET /system/health` · `POST /workflow/run` (`x-cron-secret`) | public / cron | probes and scheduled maintenance (reminders, SLA sweep, report jobs, audit integrity) |
| Offline sync | `POST /sync/events` | session | append-only, accept-once client events with conflict policy |

## Channel webhooks (`/api/hooks`)
- `GET|POST /hooks/whatsapp` — Meta Cloud API verification and inbound messages (text, voice notes, images, videos, buttons); signature `X-Hub-Signature-256`.
- `POST /hooks/ivr/twilio` (+ `/gather`, `/recording`, `/continue`) — TwiML call flow: rotating-language greeting, DTMF fallback, recording, chunked spoken replies, 24 h resume by caller id; signature `X-Twilio-Signature`.
- `POST /hooks/ussd` — Africa's Talking USSD (`CON`/`END`), two-level menu, answers by SMS.
- `POST /hooks/sms` · `POST /hooks/sms/dlr` — inbound SMS and delivery reports.

## Error codes
`bad_request` (400) · `unauthorized` (401) · `forbidden` (403) · `not_found` (404) · `rate_limited` (429) · `internal_error` (500). Channel and session routes additionally use the PRD contract codes `CONSENT_REQUIRED`, `MEDIA_QUALITY_LOW`, `LANGUAGE_UNSUPPORTED`, `CLARIFICATION_REQUIRED`, `SAFETY_ESCALATION_CREATED`, `STATE_CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `POLICY_BLOCKED`. Errors never contain provider traces, prompts, secrets or SQL.
