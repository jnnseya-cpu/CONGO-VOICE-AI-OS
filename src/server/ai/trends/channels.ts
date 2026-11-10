/**
 * Canaux d'activation — Trend Intelligence §7 and Appendix A's runtime rules.
 *
 * Appendix A reserves six routing values and is explicit that the enum "makes
 * no feature available on its own … Other route values remain unavailable until
 * an adapter and policy explicitly enable them."
 *
 * That mechanism is what lets this engine embed here without being cut down.
 * All six values exist, so a brief from any conforming installation validates
 * and the contract stays stable. Two of them are then marked permanently
 * unavailable **on this deployment**, with the reason recorded next to them —
 * because this platform is free for every citizen for ever, has no payment
 * system, and must never market to a person about their own health.
 *
 * The difference matters. A channel that is absent from the enum is a contract
 * fork. A channel that is present and refused is a policy this platform states
 * and a reviewer can read.
 */
import "server-only";

/** Appendix A: `allowed_channels` items. The order is the schema's order. */
export const BRIEF_CHANNELS = [
  "seo",
  "organic_social",
  "sales_enablement",
  "owned_placement",
  "lifecycle",
  "paid",
] as const;

export type BriefChannel = (typeof BRIEF_CHANNELS)[number];

export type ChannelAvailability =
  /** An adapter exists and policy permits it. */
  | "available"
  /** Reserved in the contract; no adapter on this deployment yet. */
  | "not_implemented"
  /** Refused by this deployment's charter. Never becomes available by configuration. */
  | "refused_by_policy";

export interface ChannelRegistration {
  channel: BriefChannel;
  availability: ChannelAvailability;
  /** French, because it is shown to the people running the service. */
  labelFr: string;
  /** Why, in one sentence. Rendered beside the channel in the console. */
  reasonFr: string;
}

/**
 * What this deployment can and will carry.
 *
 * `owned_placement` is the strongest route here and the one the specification's
 * own release gate leans on: the platform owns its public pages, so an approved
 * change can be applied, measured and rolled back without any third party.
 */
export const CHANNEL_REGISTRY: readonly ChannelRegistration[] = [
  {
    channel: "seo",
    availability: "available",
    labelFr: "Référencement des pages publiques",
    reasonFr:
      "La plateforme possède ses pages publiques et ses articles ; une modification approuvée est réversible et mesurable.",
  },
  {
    channel: "owned_placement",
    availability: "available",
    labelFr: "Emplacements sur les surfaces propres",
    reasonFr:
      "Bandeaux et appels à l'action sur les pages de la plateforme, derrière un indicateur réversible.",
  },
  {
    channel: "organic_social",
    availability: "not_implemented",
    labelFr: "Publication sociale organique",
    reasonFr:
      "Brouillon exportable uniquement : aucun adaptateur de publication n'est installé, et une publication publique ne peut pas toujours être retirée.",
  },
  {
    channel: "sales_enablement",
    availability: "not_implemented",
    labelFr: "Appui aux équipes de terrain",
    reasonFr:
      "Réservé pour les notes d'information destinées aux agents ; aucun adaptateur n'est encore installé.",
  },
  {
    channel: "lifecycle",
    availability: "refused_by_policy",
    labelFr: "Messages de cycle de vie et CRM",
    reasonFr:
      "Refusé : la plateforme n'adresse jamais un message de prospection à un citoyen au sujet de sa santé. Les rappels de soins existent déjà, sont consentis et relèvent du module de notifications.",
  },
  {
    channel: "paid",
    availability: "refused_by_policy",
    labelFr: "Référencement et social payants",
    reasonFr:
      "Refusé : le service est gratuit pour chaque citoyen et la plateforme ne comporte aucun système de paiement ni d'achat média.",
  },
] as const;

const BY_CHANNEL = new Map<BriefChannel, ChannelRegistration>(
  CHANNEL_REGISTRY.map((r) => [r.channel, r]),
);

export function channelRegistration(channel: BriefChannel): ChannelRegistration {
  const found = BY_CHANNEL.get(channel);
  if (found === undefined) {
    throw new Error(`Canal inconnu : ${channel}`);
  }
  return found;
}

export function isChannelAvailable(channel: BriefChannel): boolean {
  return channelRegistration(channel).availability === "available";
}

/** Channels a brief may actually name on this deployment. */
export function availableChannels(): BriefChannel[] {
  return CHANNEL_REGISTRY.filter((r) => r.availability === "available").map((r) => r.channel);
}

export class ChannelRefused extends Error {
  readonly channel: BriefChannel;
  readonly availability: ChannelAvailability;

  constructor(registration: ChannelRegistration) {
    super(`Canal « ${registration.labelFr} » indisponible : ${registration.reasonFr}`);
    this.name = "ChannelRefused";
    this.channel = registration.channel;
    this.availability = registration.availability;
  }
}

/**
 * §2: "If a specific external source or destination has neither permitted
 * key-free access nor a host integration that is already authorised, show that
 * capability as unavailable. Continue the full workflow on available signals
 * and an owned surface. Channel-ready drafts remain exportable."
 *
 * So an unavailable channel does not fail the brief. It is dropped from the
 * live set, the reason is carried, and a draft can still be exported for it —
 * except where policy refuses the channel outright, where no draft is produced
 * at all, because a draft implies an intention to send.
 */
export interface ChannelPlan {
  live: BriefChannel[];
  draftOnly: BriefChannel[];
  refused: Array<{ channel: BriefChannel; reasonFr: string }>;
}

export function planChannels(requested: readonly BriefChannel[]): ChannelPlan {
  const live: BriefChannel[] = [];
  const draftOnly: BriefChannel[] = [];
  const refused: Array<{ channel: BriefChannel; reasonFr: string }> = [];

  for (const channel of requested) {
    const registration = channelRegistration(channel);
    switch (registration.availability) {
      case "available":
        live.push(channel);
        break;
      case "not_implemented":
        draftOnly.push(channel);
        break;
      case "refused_by_policy":
        refused.push({ channel, reasonFr: registration.reasonFr });
        break;
    }
  }
  return { live, draftOnly, refused };
}

/**
 * §18: v1 live execution supports only these two kinds; the others are drafts.
 *
 * Deliberately narrow. The platform's own rule is that nothing citizen-facing
 * changes without a human, and these two are the only reversible writes on a
 * surface the platform itself owns.
 */
export const LIVE_ACTION_KINDS = ["seo_metadata_patch", "owned_content_patch"] as const;
export const DRAFT_ACTION_KINDS = ["seo_page_draft", "organic_social_draft"] as const;

export type ActionKind =
  | (typeof LIVE_ACTION_KINDS)[number]
  | (typeof DRAFT_ACTION_KINDS)[number];

export function isLiveActionKind(kind: ActionKind): boolean {
  return (LIVE_ACTION_KINDS as readonly string[]).includes(kind);
}

/**
 * §18's typed field allowlist.
 *
 * `V1_FORBIDDEN_FIELDS` is named rather than merely omitted so a reviewer can
 * see what is deliberately out of reach: a redirect or a canonical change made
 * automatically could remove a page a citizen reaches in an emergency.
 */
export const V1_PATCHABLE_FIELDS = [
  "seo_title",
  "seo_description",
  "body_block",
  "cta_label",
] as const;

export const V1_FORBIDDEN_FIELDS = [
  "url",
  "slug",
  "canonical",
  "redirects",
  "robots",
  "noindex",
  "structured_data",
  "permissions",
  "template",
  "script",
] as const;

export type PatchableField = (typeof V1_PATCHABLE_FIELDS)[number];

export class FieldNotPatchable extends Error {
  constructor(field: string, reason: string) {
    super(`Champ « ${field} » non modifiable automatiquement : ${reason}`);
    this.name = "FieldNotPatchable";
  }
}

export function validatePatchFields(fields: Record<string, string>): void {
  for (const name of Object.keys(fields)) {
    if ((V1_FORBIDDEN_FIELDS as readonly string[]).includes(name)) {
      throw new FieldNotPatchable(
        name,
        "hors du périmètre de l'automatisation v1 ; seul un éditeur peut le changer",
      );
    }
    if (!(V1_PATCHABLE_FIELDS as readonly string[]).includes(name)) {
      throw new FieldNotPatchable(name, "ne figure pas dans la liste des champs autorisés");
    }
  }
}
