/**
 * Which operator each channel will actually use, right now.
 *
 * Two things decide it, and both have to be present: the driver — which
 * operator, chosen by the deployment or from the administration console — and
 * that operator's credentials. A driver on its own is the dangerous
 * half-configured state: the console shows a channel as wired, the readiness
 * probe agrees, and every message is quietly written to the log instead of
 * reaching a person.
 *
 * So the rule lives here once, and both the senders and the readiness probe ask
 * the same question. A probe that answered this question its own way would
 * eventually answer it differently, and the difference would show up as an
 * escalation that nobody received.
 */
import "server-only";

export type SmsMode = "africastalking" | "twilio" | "log";
export type WhatsappAlertMode = "meta" | "twilio" | "log";
export type VoiceMode = "twilio" | "log";

const set = (value: string | undefined) => Boolean(value && value.trim().length > 0);
const driver = (value: string | undefined, fallback = "log") => (value?.trim() || fallback).toLowerCase();

/** Twilio needs all three: an account, a token, and a number to call from. */
export function twilioConfigured(): boolean {
  return set(process.env.TWILIO_ACCOUNT_SID) && set(process.env.TWILIO_AUTH_TOKEN) && set(process.env.TWILIO_FROM);
}

/** Meta's Cloud API needs the token and the sending number's id. */
export function metaWhatsappConfigured(): boolean {
  return set(process.env.WHATSAPP_ACCESS_TOKEN) && set(process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function smsMode(): SmsMode {
  const configured = driver(process.env.SMS_PROVIDER);
  if (configured === "africastalking" && set(process.env.AFRICASTALKING_API_KEY) && set(process.env.AFRICASTALKING_USERNAME)) {
    return "africastalking";
  }
  if (configured === "twilio" && twilioConfigured()) return "twilio";
  return "log";
}

/** The alert path supports both Meta and Twilio; the conversational channel is Meta only. */
export function whatsappAlertMode(): WhatsappAlertMode {
  const configured = driver(process.env.WHATSAPP_PROVIDER);
  if (configured === "twilio" && twilioConfigured()) return "twilio";
  if (configured === "meta" && metaWhatsappConfigured()) return "meta";
  return "log";
}

/**
 * The conversational WhatsApp channel, which speaks Meta's API only.
 *
 * It is deliberately not tied to which operator carries alerts: a deployment
 * may route escalations through Twilio and still answer WhatsApp conversations
 * through Meta. What it does honour is "log" chosen explicitly, because the
 * console offers that as "do not send", and a kill switch that left one half of
 * the channel sending would be a lie.
 */
export function conversationalWhatsappMode(): "graph" | "log" {
  if (process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === "log") return "log";
  return metaWhatsappConfigured() ? "graph" : "log";
}

export function voiceMode(): VoiceMode {
  return driver(process.env.VOICE_PROVIDER) === "twilio" && twilioConfigured() ? "twilio" : "log";
}

/** True when at least one channel could actually carry an escalation to a person. */
export function anyAlertChannelLive(): boolean {
  return smsMode() !== "log" || whatsappAlertMode() !== "log" || voiceMode() !== "log";
}

/**
 * Channels whose operator is named but whose credentials are missing.
 *
 * Worth distinguishing from "nothing configured", because the two need
 * different actions from the person reading the probe: one has to choose an
 * operator, the other has to finish entering a key they have already started.
 * The names are the French ones the console uses.
 */
export function halfWiredChannels(): string[] {
  const named = (value: string | undefined) => {
    const d = driver(value);
    return d !== "log" && d.length > 0;
  };
  return [
    named(process.env.SMS_PROVIDER) && smsMode() === "log" ? "SMS" : null,
    named(process.env.WHATSAPP_PROVIDER) && whatsappAlertMode() === "log" ? "WhatsApp" : null,
    named(process.env.VOICE_PROVIDER) && voiceMode() === "log" ? "appel" : null,
  ].filter((v): v is string => v !== null);
}
