# 11 — Security Architecture

What is true today, what is added, and what only the deployment can decide.
This section extends `docs/SECURITY.md`; where they differ, that file is the
record of what is built and this one is the specification of what is next.

**The platform will never be described as unhackable or impenetrable.** A
system that told its operators otherwise would stop them preparing for the day
it is breached. What a system can be is expensive to attack, quick to detect an
attack, and able to limit what one compromise reaches.

---

## 11.1 Threat model

| Adversary | Motivation | Most likely vector | Impact |
|---|---|---|---|
| Opportunistic attacker | Resale, defacement | Credential stuffing, exposed endpoint | Account access |
| **Budget drainer** | Free compute | Scripted USSD/SMS volume, model extraction | **Degraded mode for real citizens** |
| Data broker | Citizen phone numbers | Directory enumeration, report exfiltration | Mass privacy harm |
| Insider | Curiosity, coercion, politics | Legitimate credentials used illegitimately | Targeted privacy harm |
| **Political actor** | Suppress or manipulate a health signal | Compromise a `gov_admin`; tamper with a protocol | **Clinical harm at scale** |
| Hostile state | Surveillance of dissidents by health contact | Infrastructure or provider compromise | Catastrophic |
| Vandal | Disruption | DDoS on the voice short-code | Service denial when it is needed most |

**The two that shape the architecture** are the budget drainer and the political
actor. The first is why rate limiting is counted in PostgreSQL across instances
and why ACU caps exist. The second is why protocol content requires a review
board quorum that a single compromised administrator cannot satisfy, and why the
audit log is hash-chained.

---

## 11.2 Zero trust

| Principle | Implementation | Status |
|---|---|---|
| No implicit trust from network position | Every `/api/v1` request authenticates and authorises; there is no internal unauthenticated surface | EXISTS |
| Verify on every request, not at session start | Session epoch checked per request; a withdrawn token dies on its next use | EXISTS |
| Least privilege | 27 permissions; no route checks a role inline | EXISTS |
| Short-lived elevation | Step-up window of 15 minutes for high-risk actions | EXISTS |
| Explicit, expiring break-glass | `break_glass_access` with justification and expiry | EXISTS |
| Assume breach | Hash-chained audit; per-purpose keys; no credential readable by any route | EXISTS |
| **Device trust** | — | **NEW — §11.4** |
| **Continuous risk scoring of a session** | — | **NEW — §11.5** |

---

## 11.3 Identity, access and tenancy

### Built

- HMAC-signed session tokens; tampering with any claim, including issue time,
  invalidates the signature.
- Session epoch per account — the only way to revoke a stateless token.
- PIN: guesses counted, not characters. Five failures → 15 min, doubling to a
  day. Counted per account **and** per address, account authoritative. Common
  PINs refused. Work factor recorded inside each hash so it can be raised
  without locking anyone out; old hashes upgrade on next sign-in.
- TOTP second factor, required for `gov_admin` and `platform_admin`, throttled
  on the same counter — a million combinations falls to an attacker allowed to
  keep trying.
- OIDC for staff SSO.
- Lockout keys are a keyed digest, so `auth_attempts` is not a readable list of
  who recently used the service.

### NEW — three closures

#### Territory scope (closes G-08)

```ts
export const ROLE_TERRITORY_SCOPE: Partial<Record<Role, "own" | "province" | "national">> = {
  chw: "own",
  agri_officer: "own",
  teacher: "own",
  ngo: "province",       // within the organisation's agreed territories
  gov_admin: "national",
  platform_admin: "national",
};
```

Applied as a row filter in the scoped `ctx.db`, not as a check a caller can
forget. **A `platform_admin` reading outside their own territory is audited with
the territory named** — national access is legitimate and must still be
visible.

**DECISION for the programme:** supervision across provinces may be exactly what
is wanted. Until it is decided, today's exposure is every case in one module
rather than one territory's, and that should be a decision rather than an
omission.

#### Report tenancy (closes G-09)

`report:export` ceases to be sufficient. A finished report is readable by:
its commissioning organisation, the tenant's `gov_admin`, and
`platform_admin`. Every download stays audited.

#### The `auditor` role

`audit:read` + `review:read` + `report:export`, and nothing else. A
data-protection authority verifying retention should not need an account that
can read a child's transcript.

---

## 11.4 NEW — Device and session trust

| Signal | Use | Privacy rule |
|---|---|---|
| Device fingerprint (staff PWA only) | New-device sign-in requires a second factor even inside the window | **Never applied to citizens.** A shared village handset would lock out the next user |
| Session risk score | Impossible travel, new device, new address range, unusual hours, unusual volume | Raises step-up requirements; never silently blocks |
| Binding | Session token bound to a device identifier for staff roles | A stolen token on a new device requires re-verification |

**Hard rule:** no device signal is ever collected on a citizen channel. A
feature phone has no fingerprint, a shared handset has many users, and the
privacy cost falls entirely on the people the platform exists to protect.

---

## 11.5 NEW — Security Command Centre (closes G-07)

`docs/SECURITY.md` §7 records the gap: *"Failed sign-ins and refused permissions
are logged and countable, but nothing watches them in real time."*

| Layer | Specification |
|---|---|
| Collection | `auth_attempts`, `api_logs`, `rate_limit_counters`, `audit_logs`, `break_glass_access`, inbound channel volumes, `ai_usage_logs` |
| Baselining | Per account, per role, per territory, per channel; 28-day rolling, seasonal-aware |
| Detection | Rules first, model second — a rule fires, the model explains |
| Response | §05.4.10 Abuse & Integrity Agent, max L2 with one L3 action |
| Escalation | `platform_admin` page; session-epoch bump; break-glass review |

### Detection catalogue

| # | Detection | Rule | Response |
|---|---|---|---|
| D-01 | Credential stuffing | > 20 distinct accounts from one address in 10 min | Address throttle; alert |
| D-02 | Account takeover | Successful sign-in after ≥ 3 failures from a new address | Force step-up; notify the account |
| D-03 | Directory enumeration | `user:manage` reads > 3× the account's 28-day baseline | Alert; **reading the directory is already audited** |
| D-04 | Report exfiltration | Report downloads > 5× baseline, or > 3 organisations in an hour | Alert; suspend the key |
| D-05 | **Budget drain** | One number or address > 50× the median ACU in 24 h | Tighten the per-number limit (**L3**, 1 h, reversible) |
| D-06 | Model extraction | High-entropy prompt sequences, systematic coverage of a protocol space | Rate-limit; alert |
| D-07 | Bot traffic on USSD/SMS | Inter-message timing below human floor; identical payload sequences | Per-number limit; operator allow-list review |
| D-08 | Insider browsing | Case reads with no corresponding assignment or action | Alert; supervisor review |
| D-09 | **Audit chain break** | Daily verification fails | **Immediate page**; acknowledged alert to all `platform_admin` |
| D-10 | Residency violation | Gateway attempted a provider outside policy | Refuse; alert; freeze that provider |
| D-11 | Protocol tamper | `protocol_versions` changed without a matching `review_signoffs` quorum | **Suspend the artefact**; page the board |
| D-12 | Break-glass misuse | Used without an open incident, or beyond its justification | Alert the board and the ministry |

**D-09 and D-11 are the two that matter most.** They are the detections that
protect against the political actor in §11.1 — the adversary who does not want
data but wants the platform to say something different.

---

## 11.6 Anti-abuse framework

| Attack | Control | Status |
|---|---|---|
| DDoS (HTTP) | Cloud LB + WAF; rate limits counted in PostgreSQL so they hold across instances | PARTIAL — WAF is NEW |
| DDoS (voice/USSD) | Operator-side; per-number limits platform-side | PARTIAL — operator agreement needed |
| SQL injection | Drizzle parameterised queries; **no string-built SQL anywhere** | EXISTS |
| XSS | React escaping; CSP allowing only this origin for script, style, font, image, connect, frame and form; JSON-LD escaped through `shared/jsonld.ts` | EXISTS |
| CSRF | Bearer tokens; `SameSite` cookies; API responses `no-store` and vary on credentials | EXISTS |
| Clickjacking | Framing denied | EXISTS |
| Open redirect | `shared/redirect.ts` — rejects non-`/` starts, `//`, backslashes, control chars, > 512 chars | EXISTS |
| SSRF | Twilio recordings downloaded only from Twilio's host; WhatsApp media requires `https://`; storage prefixes constrained to `^[a-z0-9][a-z0-9-]{0,31}$` | EXISTS |
| Session hijacking | Signed tokens; epoch revocation; HSTS; `upgrade-insecure-requests` | EXISTS |
| Credential stuffing | Account + address lockout with doubling; common-PIN refusal | EXISTS |
| API abuse | Three limit classes; per-account AI spend cap | EXISTS |
| Bot traffic | Per-number inbound limits under a keyed digest | EXISTS |
| **Prompt injection** | §11.8 | PARTIAL |
| Cache poisoning on a shared handset | `cvos-signed-out` purges the data cache; Topbar clears `cvos-data-*` | EXISTS |
| Upload abuse | Body caps; type allow-list; image decode in a bounded worker; EXIF stripped | EXISTS |

### CSP decision, stated not hidden

Inline script is still allowed. Removing the allowance needs a per-request
nonce, which forces all prerendered pages to render on demand. **That is a
performance decision for the programme, not a default** — and on a platform
whose users are on 2G, prerendering is not a luxury.

---

## 11.7 Audit, evidence and the chain

### Built

Every write carries actor, role, language, module, location and timestamp. The
audit log is **hash-chained** and verified daily by the scheduler
(`audit_chain`); a break raises an acknowledged alert to platform
administrators. Reading the user directory is itself audited, because it is the
cheapest way to walk off with citizen phone numbers.

### NEW — external anchoring (closes G-16)

A hash chain proves internal consistency. It does not prove that the whole chain
was not rewritten by someone with database access.

| Control | Specification |
|---|---|
| Daily Merkle root | Computed over the day's audit entries |
| Anchor | Written to an append-only store **outside the platform's own cloud project**, with object lock and a separate credential |
| Verification | Any auditor can recompute a day's root and compare |
| Failure | Mismatch → D-09 page, and the affected range is quarantined, not deleted |

**Cost: a few bytes a day. Benefit: the difference between "our logs say" and
"the record is verifiable".**

### NEW — evidence packs

A signed, time-boxed export for a regulator: control statements, the audit
roots, retention attainment, residency conformance, break-glass usage, access
reviews. **Control evidence, never content** — the §04.9 auditor can prove audio
older than 90 days was purged without ever reading a transcript.

---

## 11.8 AI-specific security

| Risk | Control | Status |
|---|---|---|
| **Prompt injection via citizen input** | Citizen text is data, never instruction. Structured output with Zod schemas; a violation is a provider error, not a pass-through. **Severity, danger signs and escalation are deterministic and never read model output** | EXISTS |
| Prompt injection via retrieved content | Only board-signed artefacts are retrievable; provenance mandatory on every chunk and graph edge | EXISTS + NEW |
| Prompt injection via a connector | Connector `receives` is an allow-list; nothing undeclared enters a prompt | NEW |
| Model output claiming unsupported clinical facts | `checkOutboundClaims` + §05.4.9 continuous drift audit | EXISTS + NEW |
| Training-data leakage | No citizen content in semantic memory; no fine-tuning on transcripts without explicit consent and board approval | EXISTS |
| Model substitution attack | Credentials never readable; provider pinned by id; residency checked; `evaluation_runs` detect behaviour change | EXISTS |
| Jailbreak to bypass safety | Safety is **outside** the model. A perfect jailbreak still faces deterministic danger-sign routing and risk scoring | EXISTS |
| Agent privilege escalation | `writes[]` allow-list; autonomy ceiling compiled, not configured; governance agent suspends | NEW |
| Agent acting on stale state | Proposal evidence re-verified at acceptance; 409 if it no longer resolves | NEW |
| Runaway agent spend | `budgetAcu` per run, checked before each call | NEW |

**The single strongest security property of this platform** is that its safety
decisions do not depend on the model behaving. An attacker who fully controls
the model's output still cannot make the platform miss a danger sign, under-rate
a severity, or skip an escalation.

---

## 11.9 Encryption

| Layer | Protection |
|---|---|
| In transit, citizen → platform | TLS; HSTS and `upgrade-insecure-requests` in production |
| In transit, platform → provider | TLS. **Transcripts leave the country here** — §07.2 |
| Recordings, photos, generated reports | AES-256-GCM, applied by the storage layer so no caller can forget |
| Second-factor seeds | AES-256-GCM, per-purpose key |
| Phone numbers | AES-256-GCM + keyed blind index for lookup |
| Console-set vendor credentials | AES-256-GCM under its own purpose |
| Agent episodic memory about a citizen | AES-256-GCM under that citizen's purpose |
| Everything else at rest | Whole-disk encryption by the database host |

Keys derive from one root, `DATA_ENCRYPTION_KEY`, through HKDF with a purpose
label, so the key that protects recordings cannot read second-factor seeds.
**Losing the root makes every stored recording unreadable.** It belongs in a
secret manager with versioning.

**Encryption in use** (confidential computing / TEE) is listed in the brief.
Honest assessment: it is available on some clouds, it is not available in
`africa-south1` for the services this platform uses, and claiming it would be
false. It is recorded as a future option, not a control.

---

## 11.10 Compliance

| Regime | Applicability | Position |
|---|---|---|
| Congolese data protection law | **Primary** | Residency declared per tenant; retention swept and audited; erasure implemented |
| GDPR | Where an EU funder or processor is involved | Lawful basis, minimisation, subject rights, breach notification all implemented. DPIA is a programme deliverable |
| WHO digital health guidance | Clinical governance | Review board, protocol versioning, sign-off quorum |
| **PCI-DSS** | **Not applicable** | **No payment data exists in this platform** |
| AML / KYC | **Not applicable** | No transactions |
| ISO 27001 | Target for the operating organisation | Control mapping is a programme deliverable |
| Child data protection | **Primary for M-05** | `ai/education/child-safety.ts`; safeguarding routes to a human |

### What compliance does not cover

**Independent penetration testing has not been done.** Nothing in this document
substitutes for it. It is item 1 of the §17 open list.

---

## 11.11 Open security gaps, stated plainly

Carried forward from `docs/SECURITY.md` §7 and updated:

| # | Gap | Status |
|---|---|---|
| 1 | Independent penetration test not performed | **OPEN** |
| 2 | Case reads not territory-scoped | OPEN — §11.3 specifies the fix |
| 3 | Reports downloadable across organisations | OPEN — §11.3 specifies the fix |
| 4 | USSD/SMS webhooks unauthenticated by the operator's design | MITIGATED by per-number limits; operator IP allow-list is deployment config |
| 5 | No intrusion detection | OPEN — §11.5 specifies it |
| 6 | No written secret-rotation procedure | OPEN — §14.7 specifies it |
| 7 | Four moderate advisories in `@esbuild-kit` via `drizzle-kit`, a dev dependency | OPEN; production tree reports none |
| 8 | Audit chain not externally anchored | OPEN — §11.7 specifies it |
| 9 | `X-Forwarded-For` assumes exactly one proxy | DOCUMENTED; exposed directly, per-address limits become advisory and account lockout is unaffected |
| 10 | Inline script allowed by the CSP | DECISION — §11.6 |
