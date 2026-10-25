# 10 — API Specification

The contract. Existing routes are documented as built; new routes are specified
to implementation level.

---

## 10.1 Conventions

| Property | Value |
|---|---|
| Base | `https://congovoicecd.com/api/v1` |
| Transport | HTTPS only; HSTS in production; `upgrade-insecure-requests` |
| Content | `application/json`, or `multipart/form-data` for media |
| Versioning | Path (`/v1`). A breaking change takes a new path; `/v1` is supported for 24 months after `/v2` |
| Auth | `Authorization: Bearer <session token>` (HMAC-signed) or the session cookie |
| Caching | API responses carry `no-store` and vary on credentials |
| Language | Response text is French canonical, localised per the caller's language |
| Trace | `X-Request-Id` echoed; adopted from Cloud Run's trace header where present |

### Envelope

Success is the resource itself. Failure is always:

```json
{
  "error": {
    "code": "forbidden",
    "message": "Message lisible par un humain, en français.",
    "requestId": "a1b2c3…",
    "details": [{ "path": "body.phone", "issue": "format" }]
  }
}
```

`message` is written for the person who will read it, not for a developer.
A citizen-facing 409 says *"Cette demande a déjà été envoyée. Attendez la
réponse plutôt que de réessayer."*

### Status codes

| Code | Meaning | Notes |
|---|---|---|
| 200 / 201 | Success | |
| 202 | Accepted | Async work; body carries `statusUrl` |
| 400 | Validation failed | `details[]` names the field paths |
| 401 | No or invalid session | |
| 403 | Authenticated, not permitted | Also step-up required |
| 404 | Not found, or not visible to this caller | **Deliberately indistinguishable** — a 403 on another tenant's row confirms it exists |
| 409 | Conflict | Idempotency key reused with a different body; concurrent transition |
| 410 | Gone | Expired report, withdrawn artefact |
| 413 | Body too large | Cap is enforced before parsing |
| 422 | Semantically invalid | e.g. transition not permitted by the state machine |
| 429 | Rate limited | `Retry-After`, `X-RateLimit-*` |
| 500 | Server error | **Never leaks internals**; `requestId` is the handle |
| 503 | Not ready | Readiness failing — including an unstaffed review board |

### Rate limits

| Class | Limit | Keyed by | Headers |
|---|---|---|---|
| `default` | 120/min | user, else IP | `X-RateLimit-Limit`, `-Remaining`, `-Reset` |
| `ai` | 30/min | account, plus a per-address spend cap | same |
| `auth` | 10/min | address | same + `Retry-After` |

### Idempotency

Any unsafe method accepts `Idempotency-Key`. The key is stored with a request
fingerprint; the same key with a different body returns **409**.

---

## 10.2 Authentication

| Method | Route | Auth | Limit | Notes |
|---|---|---|---|---|
| POST | `/auth/login` | — | `auth` | `{phone, pin}` or `{anonymous: true}` → `{token, user}` |
| POST | `/auth/logout` | session | `default` | Advances the session epoch — **withdraws the token everywhere it was copied** |
| GET | `/auth/me` | session | `default` | 401 to a first-time visitor is correct, not an error |
| POST | `/auth/mfa/setup` | session | `default` | Returns `{secret, otpauthUri}`; MFA stays disabled until verified |
| POST | `/auth/mfa/verify` | session | `default` | `{code}` → enables MFA and starts the 15-minute step-up window |
| GET | `/auth/oidc/start` | — | `auth` | Staff SSO |
| GET | `/auth/oidc/callback` | — | `auth` | |

### Session semantics

A signed token cannot be deleted, so every account carries an **epoch**.
Signing out, erasure, suspension, or a role that no longer matches the token
withdraws it on the next request.

### PIN policy

Five failures → 15-minute lock; each further burst doubles to a day. Counted
**per account and per address**, the account counter being authoritative
because it cannot be sidestepped by changing a header. Common PINs are refused.
Lockout keys are a keyed digest of the number, never the number.

### Step-up

High-risk actions require a second factor verified within 15 minutes:
vendor credentials, break-glass, user management, pilot data reset.
`403` with *"Vérification de sécurité requise"*.

---

## 10.3 Interactions — the citizen path

### `POST /v1/interactions`

`multipart/form-data` or JSON.

| Field | Type | Notes |
|---|---|---|
| `text` | string | Optional if audio present |
| `audio` | file | `audio/ogg`, `audio/mpeg`, `audio/wav` |
| `images` / `images[]` | file[] | **Both field names accepted**; a file under any other name is refused |
| `module` | enum | Hint: `health`\|`agriculture`\|`education`\|`general` |
| `province` | string | |
| `wantsAudio` | boolean | Spoken reply |

```http
POST /api/v1/interactions
Authorization: Bearer eyJ…
Idempotency-Key: 018f3a2b-7c4d-7e8f-9a0b-1c2d3e4f5a6b
Content-Type: multipart/form-data

text=Mon enfant a de la fièvre depuis deux jours et il convulse
module=health
province=Kwilu
wantsAudio=true
```

```json
{
  "interaction": {
    "id": "018f3a2b-…",
    "module": "health",
    "language": "fr",
    "languageConfidence": 0.97,
    "understanding": "Enfant fébrile depuis 48 h avec convulsions.",
    "response": "Ce sont des signes de danger. …",
    "responseLanguage": "fr",
    "severity": "critical",
    "riskScore": 0.94,
    "escalationRequired": true,
    "caseId": "018f3a2c-…",
    "citations": ["protocol:paludisme-grave@v7", "protocol:convulsions@v3"],
    "followUpQuestions": ["L'enfant boit-il ?"],
    "confidence": 0.91,
    "audioUrl": "/api/v1/interactions/018f3a2b-…/audio",
    "promptVersion": "health-sys@v12",
    "protocolVersion": "paludisme-grave@v7"
  },
  "emergency": {
    "script": "Emmenez l'enfant au centre de santé le plus proche immédiatement.",
    "humanAlerted": true,
    "alertChannel": "sms"
  }
}
```

**`humanAlerted` is computed, never assumed.** It is `true` only when a channel
actually accepted the message. If no channel is live it is `false` and the
response says so — the platform does not tell a mother a nurse was called when
no nurse was called.

| Method | Route | Permission | Limit |
|---|---|---|---|
| POST | `/interactions` | `interaction:create` | `ai` |
| GET | `/interactions` | `interaction:read_own` / `read_all` | `default` |
| GET | `/interactions/{id}` | ownership or `read_all` | `default` |
| GET | `/interactions/{id}/audio` | ownership | `default` |
| POST | `/interactions/{id}/feedback` | `feedback:create` | `default` |

### Sessions (multi-turn)

| Method | Route | Notes |
|---|---|---|
| POST | `/sessions` | Open a channel session |
| GET | `/sessions/{id}` | State |
| POST | `/sessions/{id}/turns` | Add a turn |
| POST | `/sessions/{id}/resume` | Resume after a dropped call |
| GET | `/sessions/{id}/stream` | SSE for a live transcript |

---

## 10.4 Cases

| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/cases` | `case:read` | Module-scoped by role; territory scope added (§11.3) |
| POST | `/cases` | `case:write` | |
| GET/PATCH | `/cases/{id}` | `case:read` / `case:write` | |
| POST | `/cases/{id}/acknowledge` | `case:write` | Stops the SLA clock's first leg |
| POST | `/cases/{id}/assignments` | `case:assign` | |
| POST | `/cases/{id}/transitions` | `case:write` | **422** if the state machine forbids it |
| POST | `/cases/{id}/escalate` | `case:escalate` | |
| POST | `/cases/{id}/notes` | `case:write` | |
| POST | `/cases/{id}/follow-ups` | `case:write` | |
| POST | `/cases/{id}/merge` | `case:write` | Sets `mergedInto`; never deletes |
| POST | `/cases/{id}/risk-overrides` | `case:write` | **`reason` is required** |
| POST | `/cases/{id}/call` | `case:write` | Bridged call; the citizen's number is never returned |
| GET | `/queues` | `case:read` | |

**`/risk-overrides` requires a reason by schema**, not by convention. An
override without a reason destroys the only signal that tells the programme
whether the model or the worker was wrong.

---

## 10.5 Platform and system

| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/system/ready` | — | Liveness/readiness. **Container probes point here** |
| GET | `/system/health` | — | Full programme readiness. **May answer 503 on a technically perfect deployment** when the review board lacks quorum. In production, failing checks are reduced to `{id}` only — an unauthenticated caller learns *that* something fails, never *what* |
| GET | `/system/slo` | `dashboard:admin` | Attainment; `null` below 30 observations |
| POST | `/system/bootstrap` | bootstrap token | Single-use, expiring, creates the first admin |
| POST | `/system/recover-admin` | recovery token | Break-glass admin recovery |
| POST | `/system/reset-pilot-data` | `admin:config` + step-up | Pilot only; refuses in production |

**Never point a container liveness probe at `/system/health`.** It returns 503
until the board has quorum; Cloud Run would kill the container every seventy
seconds and a citizen would see an internal error from a working platform. This
is asserted by a test over `Dockerfile` and `scripts/go-live.sh`.

---

## 10.6 Administration

| Method | Route | Permission | Step-up |
|---|---|---|---|
| GET/PUT | `/admin/config` | `admin:config` | — |
| GET/PUT/DELETE | `/admin/providers` | `admin:config` + `platform_admin` | **Yes** |
| GET/PUT | `/admin/feature-flags` | `admin:config` | — |
| GET/POST | `/admin/tenants`, `/{id}` | `admin:config` | — |
| GET/POST | `/admin/organisations`, `/{id}` | `admin:config` | — |
| GET/POST | `/admin/kb` | `admin:config` | — |
| GET/PATCH | `/admin/protocols`, `/{id}` | `admin:config` | — |
| GET/POST | `/admin/templates`, `/{id}` | `admin:config` | — |
| GET/POST | `/admin/languages`, `/glossaries` | `admin:config` | — |
| POST | `/admin/break-glass` | `admin:config` | **Yes** |
| GET | `/admin/stats`, `/status` | `dashboard:admin` | — |
| POST | `/admin/seed` | `admin:config` | Non-production only |

### `/admin/providers` — vendor credentials

```http
PUT /api/v1/admin/providers
Authorization: Bearer eyJ…
Content-Type: application/json

{ "name": "GEMINI_API_KEY", "value": "AIza…" }
```

```json
{
  "credential": {
    "name": "GEMINI_API_KEY",
    "group": "ai",
    "label": "Clé Google Gemini",
    "secret": true,
    "source": "console",
    "hint": "…WXYZ",
    "updatedAt": "2026-10-25T09:12:00Z"
  },
  "active": { "llm": ["gemini", "mock"], "stt": ["gemini", "mock"], "offlineMode": false }
}
```

**Three invariants:** the value is never returned by any route; `platform_admin`
only; a second factor verified within 15 minutes. Eight secrets are refused by
name — `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`,
`BOOTSTRAP_TOKEN`, `ADMIN_RECOVERY_TOKEN`, `OIDC_CLIENT_SECRET`,
`DATABASE_URL`, `DATABASE_CA_CERT`.

Channel drivers are offered as closed lists — `SMS_PROVIDER` ∈ {log,
africastalking, twilio} — so a misspelling cannot become an alert channel that
silently writes to the log.

---

## 10.7 NEW — Agent and command-centre routes

| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/command-centre` | any authenticated | The three zones for this caller's role |
| GET | `/command-centre/act` | any | ACT zone only. **p95 ≤ 400 ms** |
| GET | `/agents` | `agent:operate` | Agents available to this caller |
| GET | `/agents/{id}/runs` | `agent:operate` | |
| POST | `/agents/{id}/invoke` | `agent:operate` | On-demand run → `202` + `statusUrl` |
| GET | `/proposals` | `agent:operate` | Open proposals for this caller |
| POST | `/proposals/{id}/accept` | `agent:operate` | Executes; returns the action |
| POST | `/proposals/{id}/reject` | `agent:operate` | `reason` required — it trains the loop |
| POST | `/actions/{id}/reverse` | `agent:operate` | Any reversible action |
| GET | `/admin/agents` | `agent:govern` | Conduct report |
| PUT | `/admin/agents/{id}/authority` | `agent:govern` | **Rejects any value above compiled `maxAutonomy`** |
| POST | `/admin/agents/{id}/suspend` | `agent:govern` | |
| POST | `/admin/agents/kill-switch` | `agent:govern` | All tiers 2–4 → L0. Step-up required |

### Proposal acceptance

```http
POST /api/v1/proposals/018f3b1c-…/accept
```

```json
{
  "action": {
    "id": "018f3b1d-…",
    "actionType": "send_follow_up",
    "targetType": "case",
    "targetId": "018f3a2c-…",
    "executedAt": "2026-10-25T09:40:12Z",
    "reversible": true,
    "reversalWindow": "PT1H"
  }
}
```

A proposal whose `evidence[]` no longer resolves at acceptance time returns
**409** — the world changed between proposal and decision, and executing a stale
proposal is how an autonomous system causes harm.

---

## 10.8 NEW — Developer platform

| Method | Route | Permission |
|---|---|---|
| GET/POST | `/developer/keys` | `admin:config` (platform) or organisation owner |
| DELETE | `/developer/keys/{id}` | same |
| GET/POST | `/developer/webhooks` | same |
| POST | `/developer/webhooks/{id}/test` | same |
| GET | `/developer/webhooks/{id}/deliveries` | same |
| GET | `/developer/openapi.json` | public |

### API keys

| Property | Specification |
|---|---|
| Format | `cvos_{live\|sandbox}_{32 random chars}` |
| Storage | Argon2id hash; **the value is shown once at creation and never again** |
| Scope | Permissions ⊆ the owning organisation's permissions, never more |
| Rotation | Create-then-revoke with an overlap window |
| Sandbox | Resolves to a sandbox tenant with synthetic data. **No production citizen data is reachable from a sandbox key, in any route, ever** |

### Webhooks

| Property | Specification |
|---|---|
| Signature | `X-CVOS-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">` |
| Replay window | 5 minutes; outside it the delivery is rejected |
| Retries | 5 attempts, exponential backoff to 24 h, then dead-letter |
| Redelivery | Manual from the console |
| Ordering | Not guaranteed. Consumers must be idempotent by `eventId` |

Subscribable events are the §08.8 taxonomy, filtered to what the subscriber's
scope permits. **Citizen content is never in a webhook payload** — identifiers
and codes only; the subscriber fetches detail through the API under its own
permissions.

---

## 10.9 Provider webhooks (inbound)

| Route | Provider | Verification |
|---|---|---|
| `/hooks/ivr/twilio` + 4 sub-routes | Twilio | Signature; **refused when unverifiable in production** |
| `/hooks/whatsapp` | Meta | Signature; same rule |
| `/hooks/sms`, `/hooks/sms/dlr` | Operator | **Unsignable**; per-number rate limit |
| `/hooks/ussd` | Operator | **Unsignable**; per-number rate limit |

Outside production, with no token configured, signature checks accept — the
platform must run with no vendor keys. A deployment with the webhook wired at
the provider and the token missing is therefore **refused**, not trusted.

A Twilio recording is downloaded **only from Twilio's own API host**: the
download carries the account's credentials, so the host is a credential boundary
and is checked rather than assumed.

---

## 10.10 Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | No valid session |
| `forbidden` | 403 | Permission, tenancy, or step-up required |
| `not_found` | 404 | Absent or not visible |
| `validation_failed` | 400 | `details[]` has the paths |
| `conflict` | 409 | Idempotency mismatch; stale proposal; concurrent transition |
| `transition_not_permitted` | 422 | State machine refused |
| `rate_limited` | 429 | `Retry-After` |
| `body_too_large` | 413 | |
| `provider_unavailable` | 503 | All providers for a capability are down |
| `residency_refused` | 503 | Policy forbids every available provider |
| `not_ready` | 503 | Readiness failing |
| `degraded_mode` | 200 | **Not an error** — answered on rules; the body says so |

`degraded_mode` as a success is deliberate. A citizen who gets a correct
protocol answer with no model involved has been served, and the platform should
say how rather than pretend or fail.
