# 17 — Production Readiness Review

The gate. What is verified, what is not, and what only a human can decide.

**Default verdict is NO-GO.** A GO is earned by evidence, never by the absence
of a known problem.

---

## 17.1 Current verdict

| Scope | Verdict | Basis |
|---|---|---|
| **Local / development** | **GO** | 1 749 tests in 92 files pass; typecheck, lint, build, standalone closure, a11y, PWA offline all clean |
| **Pilot — one province, one module** | **CONDITIONAL GO** | Blocked on four human actions, §17.4 |
| **National production** | **NO-GO** | Pilot evidence not yet collected; §17.5 |
| **Sovereign tenant** | **NO-GO** | Phase 4 not built |
| **AI-OS (Phases 1–4)** | **NOT BUILT** | This document set is the specification |

---

## 17.2 What is verified, with evidence

| Area | Evidence | Verdict |
|---|---|---|
| Test suite | `npm test` — **1 749 tests, 92 files, 823 s, 0 failures** | PASS |
| Type safety | `npm run typecheck` — zero errors; no `any`, no `@ts-ignore` | PASS |
| Lint | `npm run lint` — zero errors | PASS |
| Build | `npm run build` — Next standalone | PASS |
| Dependency closure | `npm run check:standalone` — every runtime dependency resolvable inside `.next/standalone` | PASS |
| Behavioural smoke | `scripts/smoke.mjs` — 36/37 against a running production build. The one failure is `/system/health` answering 503, which is this deployment honestly reporting an unstaffed board and an unwired alert channel | PASS (the failure is correct behaviour) |
| Adversarial | 181 cases | PASS |
| Accessibility | axe-core over every page | PASS |
| Performance, 3G profile | 3 of 4 budgets met | PARTIAL |
| PWA offline | SW registers, controls, renders offline | PASS |
| Local restore drill | 69 MB snapshot, **3 s restore**, recovery point honoured — three post-snapshot rows gone, prior data intact | PASS |
| Write latency | p95 **177 ms at 1 concurrent**, **788 ms at 5**, 0 % errors, target 4 000 ms | PASS at measured concurrency |
| Credential console | Live on a pristine instance: 403 without step-up, gateway `mock`→`gemini,mock`→`mock`, no key in payload or audit trail | PASS |
| Channel wiring | Live: `escalation_delivery` clears only with driver **and** credentials, fails again when either is withdrawn | PASS |
| Node security floor | 22.23.4+, post-21 October 2026 releases | PASS |

---

## 17.3 What is NOT tested, and why

| Area | Why not | Consequence |
|---|---|---|
| Production deployment and the live service | No cloud credentials in this environment (`gcloud auth list` → none) | **No claim is made about the live service** |
| Real AI quality, transcription accuracy, cost per interaction | No provider keys; every answer came from the offline provider | Quality and cost figures are **unmeasured** |
| Real SMS, WhatsApp, voice delivery | Log providers only; **no message left the machine, deliberately** | Delivery is unproven; routing is proven |
| Safari, Firefox, Edge, real handsets | Only Chromium available here | Device matrix unverified |
| Screen-reader and low-literacy usability | Requires fieldwork with citizens | **The most important untested thing in this list** |
| Cloud monitoring, alerting, uptime, budget alerts | `scripts/alerts.sh` needs the project | No alerting exists yet |
| Cloud point-in-time restore | Needs the project | Region-level DR unproven |
| Independent penetration test | Out of scope for an automated pass | §11.11 item 1 |
| Sustained load from multiple sources | Single address; the limiter binds by design | True write capacity **not measurable from one address** |
| Payments | **The platform has no payment system.** No payment dependency exists in the manifest | N/A — and permanently so |

---

## 17.4 Pilot blockers — four human actions

Nothing an engineer can do closes these.

| # | Action | Why it blocks | Who |
|---|---|---|---|
| 1 | **Appoint the review board and reach quorum** | `clinicalReadiness()` reports not ready until the seats are filled and the protocols signed. The platform refuses to serve citizens clinical content nobody has signed | Ministry of Health |
| 2 | **Wire one real alert channel** | With none, an escalation reaches nobody and the platform says so rather than pretending. Both halves are required — the operator's credentials *and* the driver, set at `/admin` → Clés des fournisseurs, no redeploy needed | Programme + operator |
| 3 | **Declare the residency policy** | `DATA_RESIDENCY` and `DEPLOYMENT_JURISDICTION`. Until declared, the gateway cannot know which providers are permitted | Programme + legal |
| 4 | **Provide provider keys, or accept offline operation** | Without them the platform runs on rules and the offline provider — fully functional, materially less capable | Programme |

Plus two that block measurement rather than service:

| # | Action | Blocks |
|---|---|---|
| 5 | **Population denominators** from INS / WorldPop | Every rate, every equity figure, §04.5's denominator rule |
| 6 | **Operator agreements** — short-code and zero-rating | True channel economics; and without zero-rating the poorest pay to use a free service |

---

## 17.5 National production gate

A pilot does not become national by growing. These must hold.

| # | Criterion | Target | Status |
|---|---|---|---|
| 1 | Pilot run ≥ 90 days with no severity-4 case failing to reach a human | 100 % | NOT STARTED |
| 2 | Board-reviewed sample of answers judged clinically safe | ≥ 99.5 % | NOT STARTED |
| 3 | Independent penetration test, findings closed or accepted in writing | Complete | **OPEN** |
| 4 | DR restore drilled against a real cloud project, RTO met | Complete | **OPEN** |
| 5 | Monitoring and alerting live, each alert proven to reach a named person | Complete | **OPEN** |
| 6 | Cost per interaction measured with real providers | ≤ 0.02 USD | NOT MEASURED |
| 7 | SLO attainment over 90 days | All 6 met | NOT MEASURED |
| 8 | Device matrix on real handsets across operators | Complete | **OPEN** |
| 9 | Usability tested with non-literate citizens in each language | Complete | **OPEN** |
| 10 | On-call rotation of ≥ 2 engineers with drilled runbooks | Complete | **OPEN** |
| 11 | Retention and erasure verified by an independent auditor | Complete | **OPEN** |
| 12 | Every territory served has ≥ 1 active responder | 100 % | **OPEN** |

**Criterion 12 is the one most likely to be waved through, and it must not be.**
A platform that triages perfectly into an empty roster has moved the failure, not
removed it.

---

## 17.6 AI-OS phase gates

Each phase's exit criteria from §15, restated as a gate.

| Phase | Gate | Blocking criterion |
|---|---|---|
| 1 — Intelligence | Retrieval + cost | **100 %** of clinical answers carry a resolvable citation |
| 2 — Agents | Agent runtime | **Zero** proposals with unresolvable evidence; **zero** writes outside declared scope; kill-switch drill executed |
| 3 — Autonomy | Self-healing + security | Auto-repair reversal rate ≤ 5 %; **independent penetration test complete**; DR drilled against a real project |
| 4 — Sovereign | Tenancy | **Zero** cross-tenant leakage proven by property tests; tenant export round-trip verified; their engineer restores unaided |

---

## 17.7 Anti-gaming rules

These bind this review and every future one.

1. **Never convert BLOCKED or NOT TESTED into PASS.** A thing not executed is
   not a thing that passed.
2. **Never claim a deployment succeeded unless it actually succeeded.**
3. **Never claim a feature works unless it has been inspected and, where
   technically possible, tested.**
4. **Never claim the platform is secure because it builds.** A green build is
   evidence about compilation, nothing else.
5. **Never describe any system as unhackable or hacker-impenetrable.**
6. **Never suppress a type, lint or build error to force a deployment.** If a
   bypass is unavoidable, document it with its justification.
7. **Never skip, disable or quarantine a test to reach green.** A failing test
   is a finding.
8. **Never present an estimate as a measurement.** Every figure cites a command
   and a date, or is marked as a target.
9. **Never report a GO for a scope wider than the evidence covers.**
10. **A failure that is correct behaviour is reported as a pass with its reason**
    — as with the 503 in §17.2 — never hidden and never silently reclassified.

---

## 17.8 The standing open list

| # | Item | Section | Owner |
|---|---|---|---|
| 1 | Independent penetration test | §11.11 | Programme |
| 2 | Case reads not territory-scoped | §11.3 | Engineering + programme decision |
| 3 | Reports downloadable across organisations | §11.3 | Engineering |
| 4 | No intrusion detection | §11.5 | Engineering, Phase 3 |
| 5 | Audit chain not externally anchored | §11.7 | Engineering, Phase 3 |
| 6 | No written secret-rotation procedure | §14.7 | Specified here; needs adoption |
| 7 | Cloud PITR never executed | §14.6 | Operations |
| 8 | Region-outage DR never drilled | §14.6 | Operations |
| 9 | Immutable backups not implemented | §14.6 | Operations |
| 10 | `@esbuild-kit` advisories via `drizzle-kit` (dev only) | §11.11 | Monitor; production tree clean |
| 11 | Inline script allowed by the CSP | §11.6 | Programme decision |
| 12 | `X-Forwarded-For` assumes exactly one proxy | §11.11 | Deployment |
| 13 | USSD/SMS operator IP allow-list | §11.6 | Deployment |
| 14 | ALB backend timeout error with serverless NEGs | §14.3 | Operations |
| 15 | Retention periods not legally validated under Congolese law | §09.10 | Legal |
| 16 | Transcripts leave the country with hosted models | §07.2 | Programme decision |
| 17 | Sustained load not measurable from one address | §08.9 | Operations |
| 18 | No clinical outcome data | §16.4 | Research programme |

---

## 17.9 Sign-off

A release to citizens requires four signatures. No one of them can substitute
for another.

| Role | Attests |
|---|---|
| **Engineering lead** | The build, tests and checks in §17.2 passed on this commit |
| **Clinical board chair** | Every clinical artefact in this release is signed and current |
| **Security owner** | Known gaps are listed, accepted in writing, and none is unmitigated |
| **Programme owner** | The human actions in §17.4 are complete, and a responder exists in every territory served |

```
Commit        : ________________________
Scope         : ________________________   (pilot | national | tenant)
Date          : ________________________

Engineering   : ____________________  ____________
Clinical board: ____________________  ____________
Security      : ____________________  ____________
Programme     : ____________________  ____________
```

**This document gives no GO for anything beyond local development.** The pilot
gate is conditional on §17.4 and the national gate on §17.5, and both are the
programme's to close — not this document's, and not an engineer's.
