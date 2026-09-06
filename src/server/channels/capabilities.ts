/**
 * Channel capability negotiation.
 *
 * One canonical conversation service serves IVR, WhatsApp, USSD, SMS and the PWA.
 * The capability set is what tells the service how to shape a reply: whether it may
 * send audio, images, buttons, long text, ask for a location, or rely on the client
 * to replay queued work in the background.
 */
import type { ChannelType } from "@server/db/schema";

export interface ChannelCapabilities {
  /** Can receive and/or play audio (voice notes, spoken replies). */
  audio: boolean;
  /** Can send photos in, and receive them back. */
  images: boolean;
  /** Can send short video clips (≤30 s, ≤16 MB). */
  video: boolean;
  /** Supports discrete choices (WhatsApp buttons, DTMF keys, USSD menu digits). */
  buttons: boolean;
  /** Can display a long answer at once; when false the reply is chunked. */
  longText: boolean;
  /** Can share a GPS location. */
  location: boolean;
  /** Client can queue work offline and replay it later (service worker / app). */
  backgroundSync: boolean;
  /** Hard limit of a single outbound message, in characters. */
  maxTextLength: number;
  /** Maximum number of quick-reply buttons. */
  maxButtons: number;
  /** Maximum number of list rows. */
  maxListItems: number;
  /** Replies are spoken rather than read. */
  spokenReply: boolean;
}

const PWA: ChannelCapabilities = {
  audio: true,
  images: true,
  video: true,
  buttons: true,
  longText: true,
  location: true,
  backgroundSync: true,
  maxTextLength: 4000,
  maxButtons: 6,
  maxListItems: 20,
  spokenReply: false,
};

export const CHANNEL_CAPABILITIES: Record<ChannelType, ChannelCapabilities> = {
  pwa: PWA,
  android: PWA,
  assisted: { ...PWA, backgroundSync: false },
  ivr: {
    audio: true,
    images: false,
    video: false,
    buttons: true, // DTMF keypad
    longText: false,
    location: false,
    backgroundSync: false,
    maxTextLength: 400,
    maxButtons: 9,
    maxListItems: 9,
    spokenReply: true,
  },
  whatsapp: {
    audio: true,
    images: true,
    video: true,
    buttons: true,
    longText: true,
    location: true,
    backgroundSync: false,
    maxTextLength: 4096,
    maxButtons: 3,
    maxListItems: 10,
    spokenReply: false,
  },
  ussd: {
    audio: false,
    images: false,
    video: false,
    buttons: true, // numbered menu
    longText: false,
    location: false,
    backgroundSync: false,
    maxTextLength: 160,
    maxButtons: 9,
    maxListItems: 9,
    spokenReply: false,
  },
  sms: {
    audio: false,
    images: false,
    video: false,
    buttons: false,
    longText: false,
    location: false,
    backgroundSync: false,
    maxTextLength: 459, // 3 concatenated GSM-7 messages
    maxButtons: 0,
    maxListItems: 0,
    spokenReply: false,
  },
};

const BOOLEAN_KEYS = ["audio", "images", "video", "buttons", "longText", "location", "backgroundSync", "spokenReply"] as const;
const NUMBER_KEYS = ["maxTextLength", "maxButtons", "maxListItems"] as const;

/**
 * Negotiates the effective capabilities: the channel ceiling intersected with what the
 * client claims it can do. A client can only ever narrow the channel, never widen it.
 */
export function negotiateCapabilities(channel: ChannelType, claimed?: Record<string, unknown> | null): ChannelCapabilities {
  const base = CHANNEL_CAPABILITIES[channel] ?? CHANNEL_CAPABILITIES.pwa;
  if (!claimed) return { ...base };
  const out: ChannelCapabilities = { ...base };
  for (const key of BOOLEAN_KEYS) {
    const v = claimed[key];
    if (typeof v === "boolean") out[key] = base[key] && v;
  }
  for (const key of NUMBER_KEYS) {
    const v = claimed[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = Math.min(base[key], Math.floor(v));
  }
  return out;
}

/** Stored on the session row (jsonb of booleans plus numeric limits). */
export function capabilitiesToRecord(caps: ChannelCapabilities): Record<string, boolean> {
  // sessions.capabilities is typed as Record<string, boolean>; numeric limits are derived
  // from the channel, so only the boolean negotiation result needs persisting.
  const out: Record<string, boolean> = {};
  for (const key of BOOLEAN_KEYS) out[key] = caps[key];
  return out;
}

export function capabilitiesFromRecord(channel: ChannelType, record: Record<string, boolean> | null | undefined): ChannelCapabilities {
  return negotiateCapabilities(channel, record ?? undefined);
}
