# Security posture

What is actually true of this codebase, what is not, and what only the
deployment can decide. Nothing here is aspirational: every claim below is
enforced in code and covered by a test, or it is listed as a gap.

## 1. On "end-to-end encryption" and "impenetrable"

Neither is achievable here, and saying otherwise would be a lie a citizen
could be harmed by. Two specific reasons:

**End-to-end encryption, in its real meaning, is incompatible with what this
platform does.** End-to-end means the server cannot read the content. This
platform must read the content: a deterministic rule has to see the words
"convulse" and "ne tète plus" to grade a call as severity 4, open a case and
alert a human. A voice triage service that could not read the transcript
could not triage. The honest description is *encrypted in transit, encrypted
at rest, and readable only by the service and the people whose role permits
it* — which is what is implemented.

**No system is impenetrable**, and a platform that told its operators
otherwise would stop them from preparing for the day it is breached. What a
system can be is expensive to attack, quick to detect an attack, and able to
limit what one compromise reaches. Those are the properties pursued below.

## 2. Encryption

| Layer | What protects it |
|---|---|
| In transit, citizen to platform | TLS, terminated by the host. `upgrade-insecure-requests` and HSTS are set in production |
| In transit, platform to AI provider | TLS to the provider's API. Transcripts leave the country here — see §6 |
| Recordings, photos, generated reports | AES-256-GCM in `core/crypto.ts`, applied by the storage layer so no caller can forget |
| Second-factor seeds | AES-256-GCM, per-purpose key |
| Everything else in the database | Whole-disk encryption by the database host. Field-level encryption of phone numbers is a gap — see §7 |

Keys derive from one root, `DATA_ENCRYPTION_KEY`, through HKDF with a purpose
label, so a key that protects recordings cannot read second-factor seeds.
**Losing the root key makes every stored recording unreadable.** It belongs in
a secret manager with versioning, not in an environment file.

## 3. Identity and access

- Sessions are HMAC-signed tokens. Tampering with any claim, including the
  issue time, invalidates the signature.
- Because a signed token cannot be deleted, every account carries a session
  epoch. Signing out, erasure, suspension or a role that no longer matches
  the token withdraws it on the next request, everywhere it was copied.
- A PIN is short by necessity, so guesses are counted, not characters:
  five failures locks for fifteen minutes and each further burst doubles
  that to a day. The count is kept per account **and** per address. The
  account counter is the one that matters, because it cannot be sidestepped
  by changing a header.
- Common PINs are refused outright. The work factor is recorded inside each
  hash, so it can be raised without locking anyone out; old hashes upgrade on
  the owner's next sign-in.
- Six-digit second-factor codes are throttled on the same counter. A million
  combinations falls to an attacker who is allowed to keep trying.
- Roles and permissions live in `core/rbac.ts`. No route checks a role inline.

## 4. The request perimeter

- Every `/api/v1` route goes through `handle()`, which authenticates, checks
  the permission, counts the request against a shared limit, verifies the
  session has not been withdrawn, caps the body, and logs the outcome.
- Rate limits are counted in PostgreSQL, so the limit is the limit no matter
  how many instances are running. The in-process window stays as a cheap
  first line, and a database failure falls back to it rather than taking the
  platform down.
- The client address is read from the trusted end of `X-Forwarded-For`.
  **This assumes the platform sits behind exactly one proxy that appends the
  real address.** Exposed directly to the internet, the header is
  attacker-controlled and per-address limits become advisory. Account-level
  lockout is unaffected.
- A content security policy allows only this origin for script, style, font,
  image, connection, frame and form targets. Framing is denied. API responses
  carry `no-store` and vary on credentials.

## 5. What is recorded

Every write carries actor, role, language, module, location and timestamp.
The audit log is hash-chained and verified daily by the scheduler; a break
raises an acknowledged alert to platform administrators. Reading the user
directory is itself audited, because it is the cheapest way to walk off with
citizen phone numbers.

## 6. Decisions the programme still has to make

These are not code gaps. They are choices only the programme owner can make,
and each has a real cost either way.

1. **Transcripts leave the country** when a hosted model answers. The offline
   provider keeps everything local but answers far less well. Running a
   national instance removes the trade-off at the cost of hosting it.
2. **Inline script is still allowed** by the policy. Removing the allowance
   needs a per-request nonce, which forces all 158 prerendered pages to be
   rendered on demand. That is a performance decision, not a default.
3. **Retention periods** for raw audio are unset.
4. **Independent penetration testing** has not been done. Nothing in this
   document substitutes for it.

## 7. Known gaps, stated plainly

- **Phone numbers are stored in clear text.** `core/crypto.ts` already
  provides a blind index for exactly this, but converting the column touches
  sign-in, the directory, notifications and the channel layer, and was not
  attempted rather than half-done. Until then they are protected by disk
  encryption and access control, not by the application.
- **No intrusion detection.** Failed sign-ins and refused permissions are
  logged and countable, but nothing watches them in real time.
- **No secret rotation procedure** is written down for the session secret or
  the data key.
- **Four moderate advisories** remain in `@esbuild-kit`, reached only through
  `drizzle-kit`, a development dependency. The production dependency tree
  reports none.

## 8. Verifying a deployment

`node scripts/smoke.mjs https://host` drives a running server the way a
citizen, a health worker and an attacker each would: it checks the probes and
headers, takes an anonymous session through an ordinary question and a danger
sign, confirms the danger sign was graded critical by rule and reached a
worker's queue, confirms a worker cannot read administration, signs out and
proves the token stops working, and finally locks an account and shows the
lock holds from a different address. It exits non-zero on any failure.
