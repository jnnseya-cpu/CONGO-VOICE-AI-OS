/**
 * Click to call (FR-CS-04).
 *
 * A community health worker following up a case should not be given the
 * household's number. Once it is in a private handset it is out of the
 * platform's reach: it survives the worker leaving, it is copied, and no audit
 * trail covers what happens to it. So the platform calls the worker first and
 * bridges the call; the number travels only between the platform and the
 * telephony provider.
 */
import "server-only";
import { env } from "@server/core/env";
import { safeLog } from "@server/core/redact";
import { permits } from "@server/core/residency";

export interface BridgedCallInput {
  caseId: string;
  workerNumber: string;
  citizenNumber: string;
}

export interface BridgedCallResult {
  ok: boolean;
  provider: string;
  callId?: string | null;
  failureReason?: string | null;
}

function maskTail(number: string): string {
  return number.length <= 4 ? "…" : `…${number.slice(-4)}`;
}

export async function placeBridgedCall(input: BridgedCallInput): Promise<BridgedCallResult> {
  const provider = process.env.VOICE_PROVIDER ?? "log";

  // A carrier outside the deployment's residency policy is not dialled: the
  // citizen's number and the call itself would travel with it.
  const verdict = permits(provider === "twilio" ? "twilio" : provider);
  if (!verdict.permitted) {
    return { ok: false, provider, failureReason: `voice_provider_outside_residency_policy` };
  }

  if (provider === "twilio") {
    const { twilioAccountSid, twilioAuthToken, twilioFrom } = env.notifications;
    if (!twilioAccountSid || !twilioAuthToken || !twilioFrom) {
      return { ok: false, provider, failureReason: "twilio_not_configured" };
    }
    // The worker is dialled first; answering connects them to the citizen. The
    // instruction is built here rather than fetched, so no callback URL has to
    // carry the citizen's number.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="fr-FR">Mise en relation avec la personne concernée.</Say><Dial callerId="${twilioFrom}"><Number>${input.citizenNumber}</Number></Dial></Response>`;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: twilioFrom, To: input.workerNumber, Twiml: twiml }),
      });
      if (!res.ok) return { ok: false, provider, failureReason: `twilio_http_${res.status}` };
      const json = (await res.json()) as { sid?: string };
      return { ok: true, provider, callId: json.sid ?? null };
    } catch (err) {
      return { ok: false, provider, failureReason: err instanceof Error ? err.message : "call_failed" };
    }
  }

  // No telephony configured. Log-only is fine on a laptop and is a failure
  // anywhere a worker is expecting the phone to ring.
  safeLog.info("call:bridge", `case=${input.caseId} worker=${maskTail(input.workerNumber)} citizen=${maskTail(input.citizenNumber)}`);
  if (env.isProd) return { ok: false, provider: "log", failureReason: "voice_provider_not_configured" };
  return { ok: true, provider: "log", callId: `log-${Date.now()}` };
}
