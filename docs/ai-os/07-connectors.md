# 07 — Connector Ecosystem

Every external dependency the AI-OS needs, why, where it attaches, what data
crosses, and the provider choice with its trade-off.

**Payments, banking, open banking, card rails, settlement, currency exchange
and subscription billing are absent by instruction and by design.** There is no
money in this platform. Removing that entire category also removes PCI-DSS
scope, settlement reconciliation, chargeback handling and the largest single
source of fraud surface in a consumer platform. That is a structural advantage,
not an omission.

---

## 7.1 The connector contract — NEW

Today each integration is bespoke (`channels/twilio.ts`, `channels/whatsapp.ts`,
`ai/providers/*`). The registry makes every one of them uniform.

```ts
export interface Connector {
  id: string;                       // "twilio_voice", "anthropic_llm"
  category: ConnectorCategory;
  /** Where data physically goes. Checked against the tenant's residency policy. */
  jurisdiction: string[];           // ["US"], ["ZA"], ["local"]
  /** What the platform sends. Enumerated — nothing undeclared may be sent. */
  sends: DataClass[];               // "transcript" | "phone" | "image" | "aggregate" | "none"
  receives: DataClass[];
  /** Credentials, all via core/credentials.ts. Never read back. */
  credentials: string[];
  /** Health probe. Must not cost money to run. */
  health(): Promise<ConnectorHealth>;
  /** Quota and cost shape, for the Cost agent. */
  quota: { unit: string; perMinute?: number; perDay?: number; costPerUnit?: number };
  /** Ordered failover. Empty means this capability simply degrades. */
  failover: string[];
  /** What the platform does when every option is unavailable. Mandatory. */
  degradedBehaviour: string;
}
```

### Four rules

1. **Residency is checked before the call, not after.** `core/residency.ts`
   already refuses a provider outside policy; the registry extends it to every
   category. A connector whose `jurisdiction` is not permitted is not attempted.
2. **`sends` is an allow-list.** Sending a data class not declared is a fault,
   not a warning. This is what makes "transcripts leave the country" an
   auditable statement rather than a hope.
3. **Every connector declares `degradedBehaviour`.** A connector with no stated
   behaviour when it is down cannot be registered. This is how the platform
   keeps its promise to run with nothing configured.
4. **Health probes must be free.** A probe that costs money cannot run often
   enough to be useful.

---

## 7.2 Category 1 — AI model providers

| Provider | Capabilities | Jurisdiction | Sends | Status |
|---|---|---|---|---|
| Anthropic | llm, vision | US | transcript, image | EXISTS |
| Google Gemini | llm, vision, stt, tts | US / multi | transcript, image, audio | EXISTS |
| OpenAI | llm, vision, stt | US | transcript, image, audio | EXISTS |
| Google Speech | stt, tts | US / multi | audio | EXISTS |
| **Offline mock** | all four | **local** | **none** | EXISTS |

**Why it matters:** this is the only category where the platform's own
architecture already solves the hard problem. `ai/gateway.ts` is the single
place that knows a vendor exists. `AI_LLM_ORDER` decides precedence. The offline
provider means the complete platform — triage, protocols, escalation, cases,
reporting — runs with **zero API keys**, and all 1 749 tests do.

### ADDED

| Addition | Why |
|---|---|
| **SLM class provider** (self-hosted small model, in-region) | §05.10's R1 tier needs a cheap, fast, resident model. Candidates: a quantised 3–8 B model on Cloud Run GPU or a regional inference host |
| **Embedding provider** | §09.5 needs embeddings. Must be per-language capable; multilingual-e5 or a comparable open model, self-hosted to keep the corpus resident |
| **Sovereign inference option** | A tenant may require that no transcript leaves. The registry must support "local only" as a complete configuration, with the capability loss stated explicitly |

**Decision for the programme:** hosted frontier models give materially better
answers today; a national instance removes the residency trade-off at the cost
of hosting it. §01.8 forbids pretending this choice does not exist.

---

## 7.3 Category 2 — Telephony and messaging

| Need | Provider options | Jurisdiction | Sends | Status |
|---|---|---|---|---|
| Inbound/outbound voice (IVR) | Twilio; Africa's Talking; Vonage; **a DRC operator short-code** | US / KE / local | audio, phone | EXISTS (Twilio) |
| SMS | Africa's Talking; Twilio; operator direct | KE / US / local | text, phone | EXISTS |
| USSD | **Operator-direct only** — USSD is not resellable at scale | local | text, phone | EXISTS |
| WhatsApp | Meta Cloud API; Twilio | US | text, audio, image, phone | EXISTS |
| Delivery reports | Same provider | — | message id, status | EXISTS |

**The strategic point:** USSD and voice short-codes must ultimately be
**operator-direct with Vodacom, Airtel, Orange and Africell**. A resold
international route costs more per message, adds latency that pushes the
`ivr_first_reply_p95` 6 s objective, and makes the service dependent on a
commercial relationship outside the country. The platform's channel abstraction
(`channels/modes.ts`) means this is a configuration change, not a rewrite.

**Zero-rating is a programme negotiation, not a technical feature**: an
agreement with each operator that calls and USSD sessions to the national
short-code are free to the citizen. Without it, the poorest users pay to use a
free service — which would quietly reintroduce the barrier §01.8 forbids.

---

## 7.4 Category 3 — Identity and authentication

| Need | Provider | Jurisdiction | Sends | Status |
|---|---|---|---|---|
| Staff SSO | OIDC — any compliant IdP (government directory, Azure AD, Keycloak) | tenant's choice | identity assertion | EXISTS (`core/oidc.ts`, `/v1/auth/oidc/*`) |
| Second factor | TOTP, local | local | **none** | EXISTS (`core/mfa.ts`) |
| Citizen identity | **None. Deliberately.** | — | — | — |

**Why there is no KYC, no Persona, no Sumsub, no Veriff**: identity verification
exists to establish who is liable in a transaction. There are no transactions.
Requiring a citizen to prove identity before asking about a sick child would
exclude exactly the people the platform exists for. The platform's identity
model is: **anonymous by default, a phone number only if volunteered, encrypted
with a blind index for lookup.**

If a tenant's law later requires identity for a specific function, it enters as
a connector with its own residency declaration — and it must never gate the
emergency path.

---

## 7.5 Category 4 — Cloud and storage

| Need | Provider | Jurisdiction | Status |
|---|---|---|---|
| Compute | Cloud Run `africa-south1` | ZA | EXISTS |
| Database | Cloud SQL PostgreSQL; PGlite embedded for dev/test | ZA / local | EXISTS |
| Object storage | GCS (`@google-cloud/storage`); local driver | ZA / local | EXISTS |
| Secrets | Secret Manager + the console credential store | ZA | EXISTS |
| CDN / WAF | Cloud Load Balancing; **Cloudflare recommended for the public site** | multi | PARTIAL |
| Tracing | OpenTelemetry → any OTLP collector | tenant's choice | EXISTS |

`africa-south1` is the nearest region to the DRC with the required services.
Latency from Kinshasa to Johannesburg is materially better than to Europe and is
the right default until a closer region or a national data centre exists.

**ADDED:** a WAF and bot-management layer in front of the public site and
`/api/hooks` — §11.6.

---

## 7.6 Category 5 — Public and reference data

| Need | Provider | Why |
|---|---|---|
| Weather | Open-Meteo (free, no key); NOAA GFS | Planting advice and crop-risk forecasting. `ai/tools/weather.ts` exists |
| Market prices | Ministry of Agriculture feeds; WFP VAM; manual CSV upload | `market_prices` and the upload route exist; automation is the gap |
| Population denominators | INS (Institut National de la Statistique); WorldPop | **Mandatory.** §04.5's denominator rule cannot be met without them |
| Administrative boundaries | OCHA COD-AB | `territories`, `provinces` |
| Health facility registry | Ministry of Health master facility list | `service_directory` |
| Disease surveillance | WHO AFRO; national IDSR | Baselines for §05.4.3's scan statistic |
| Curriculum | Ministry of Education | `ai/education/curriculum.ts` |
| Crop calendars | FAO; national extension service | `planting_calendars` |

**All of these send nothing and receive reference data.** They are the lowest-
risk connectors in the platform and the highest-value: without denominators and
baselines, analytics are counts, and counts mislead.

---

## 7.7 Category 6 — Communication and documents

| Need | Provider | Sends | Status |
|---|---|---|---|
| Transactional email (staff only) | SendGrid; Brevo; AWS SES | staff address, text | PARTIAL (`EMAIL_PROVIDER` is log-only) |
| Document generation | **In-process** — `pdfkit`, `exceljs`, `docx` | none | EXISTS |
| E-signature | **Not required** — board sign-off is an in-platform, audited act with its own chain | none | N/A |

Document generation is deliberately in-process: a report containing suppressed
small counts must never be rendered by a third party.

---

## 7.8 Category 7 — Operations

| Need | Provider | Status |
|---|---|---|
| Error aggregation | Cloud Error Reporting; Sentry (self-hosted for residency) | PARTIAL — `api_logs` exists; no grouping |
| Metrics / alerting | Cloud Monitoring (`scripts/alerts.sh`) | PARTIAL — script exists, never run against a project |
| Uptime from outside | Any external prober — **must be outside the platform's own cloud** | NEW |
| Status page | Static, on a different origin and provider | NEW |
| Log archive | GCS with object lock | NEW — §11.7 |

**The status page must not share infrastructure with the platform.** A status
page that goes down with the service is worse than none, because it leaves
operators guessing.

---

## 7.9 Category 8 — Explicitly not integrated

Recorded so the absence is a decision, not an oversight.

| Category | Why not |
|---|---|
| Payments, wallets, cards, mobile money | **No money in this platform.** User instruction and design principle |
| Banking / BaaS / open banking | Same |
| Settlement, commission, revenue share | Same |
| KYC / KYB / AML screening | No transactions to screen; §7.4 |
| CRM (Salesforce, HubSpot) | Citizens are not leads. Case management is the system of record |
| Marketing automation | §05.4.11 forbids targeting an individual about their health |
| Ad / attribution SDKs | Never. No tracker on a page where someone describes a sick child |
| Consumer analytics SDKs (GA, Mixpanel) | Analytics are computed in-platform from the audit trail; no citizen behaviour leaves |
| Data enrichment / people-data vendors | Enriching a citizen record from a commercial broker is incompatible with the consent model |
| Accounting / tax | No revenue from users; institutional funding is handled by the funder's own finance systems |
| Logistics | No goods |

---

## 7.10 Connector health and failover

Every connector reports into the §13 control centre:

| Signal | Meaning | Agent response |
|---|---|---|
| `healthy` | Probe succeeds, error rate < 1 % | — |
| `degraded` | Error rate 1–10 % or latency > 2× baseline | System Health Agent proposes failover |
| `failing` | Error rate > 10 % | **L3:** fail out of rotation for ≤ 30 min |
| `unavailable` | Probe fails | Failover; if none, `degradedBehaviour` applies and the readiness probe reports it |
| `refused_by_residency` | Policy forbids it | Never attempted; shown in the console with the reason |

**The failure the platform must never produce** is silently serving a worse
answer because a connector failed. Every degradation is visible in the readiness
probe, the command centre and the audit trail.
