/**
 * Channel error contract.
 *
 * Every channel-layer route answers failures with the same envelope:
 *   { code, message_key, safe_localised_message, retryable, fields[], request_id }
 *
 * `safe_localised_message` is what a citizen may hear or read: it never leaks internal
 * detail, provider names or personal data, and it exists in the five platform languages.
 * The generic API envelope of `src/lib/core/api.ts` is untouched; channel routes convert
 * their own errors here before returning.
 */
import { randomUUID } from "node:crypto";
import type { LanguageCode } from "@/lib/db/schema";

export const CHANNEL_ERROR_CODES = [
  "CONSENT_REQUIRED",
  "MEDIA_QUALITY_LOW",
  "LANGUAGE_UNSUPPORTED",
  "CLARIFICATION_REQUIRED",
  "SAFETY_ESCALATION_CREATED",
  "STATE_CONFLICT",
  "RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
  "POLICY_BLOCKED",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "UNAUTHORISED",
  "INTERNAL_ERROR",
] as const;

export type ChannelErrorCode = (typeof CHANNEL_ERROR_CODES)[number];

interface CodeSpec {
  status: number;
  retryable: boolean;
  messageKey: string;
}

const SPEC: Record<ChannelErrorCode, CodeSpec> = {
  CONSENT_REQUIRED: { status: 403, retryable: false, messageKey: "channel.error.consent_required" },
  MEDIA_QUALITY_LOW: { status: 422, retryable: true, messageKey: "channel.error.media_quality_low" },
  LANGUAGE_UNSUPPORTED: { status: 400, retryable: false, messageKey: "channel.error.language_unsupported" },
  CLARIFICATION_REQUIRED: { status: 409, retryable: true, messageKey: "channel.error.clarification_required" },
  SAFETY_ESCALATION_CREATED: { status: 200, retryable: false, messageKey: "channel.error.safety_escalation_created" },
  STATE_CONFLICT: { status: 409, retryable: false, messageKey: "channel.error.state_conflict" },
  RATE_LIMITED: { status: 429, retryable: true, messageKey: "channel.error.rate_limited" },
  DEPENDENCY_UNAVAILABLE: { status: 503, retryable: true, messageKey: "channel.error.dependency_unavailable" },
  POLICY_BLOCKED: { status: 403, retryable: false, messageKey: "channel.error.policy_blocked" },
  NOT_FOUND: { status: 404, retryable: false, messageKey: "channel.error.not_found" },
  VALIDATION_FAILED: { status: 400, retryable: false, messageKey: "channel.error.validation_failed" },
  UNAUTHORISED: { status: 401, retryable: false, messageKey: "channel.error.unauthorised" },
  INTERNAL_ERROR: { status: 500, retryable: true, messageKey: "channel.error.internal" },
};

/** Citizen-safe wording, French canonical first. */
const MESSAGES: Record<ChannelErrorCode, Record<LanguageCode, string>> = {
  CONSENT_REQUIRED: {
    fr: "Avant de continuer, nous avons besoin de votre accord pour utiliser ce service.",
    ln: "Liboso ya kokoba, tosengeli na ndingisa na yo mpo na kosalela service oyo.",
    kg: "Na ntwala ya kulanda, beto ke lomba nswa na nge sambu na kusadila kisalu yai.",
    sw: "Kabla ya kuendelea, tunahitaji ridhaa yako ya kutumia huduma hii.",
    lua: "Kumpala kua kutungunuka, tudi tukeba mvua webe bua kuenza mudimu eu.",
  },
  MEDIA_QUALITY_LOW: {
    fr: "Le son ou l'image n'est pas assez clair. Réessayez plus près du téléphone, dans un endroit calme.",
    ln: "Mongongo to elilingi ezali polele te. Meka lisusu pene ya telefone, na esika ya kimia.",
    kg: "Nzwenga to kifwanisu ke pwelele ve. Meka diaka pene-pene ya telefone, na kisika ya pi.",
    sw: "Sauti au picha haiko wazi vya kutosha. Jaribu tena karibu na simu, mahali penye utulivu.",
    lua: "Diyi anyi tshimfuanyi katshiena tshijalame. Teta kabidi pabuipi ne telefone, muaba wa ditalala.",
  },
  LANGUAGE_UNSUPPORTED: {
    fr: "Cette langue n'est pas encore disponible. Nous continuons en français.",
    ln: "Monoko oyo ezali naino te. Tokokoba na lifalanse.",
    kg: "Ndinga yai kele ntete ve. Beto ke landa na kifalansa.",
    sw: "Lugha hii bado haipatikani. Tutaendelea kwa Kifaransa.",
    lua: "Muakulu eu kawuena kuena to. Netutungunuke mu tshifalansa.",
  },
  CLARIFICATION_REQUIRED: {
    fr: "Je ne suis pas certain d'avoir bien compris. Pouvez-vous préciser en une phrase ?",
    ln: "Nandimi malamu te. Okoki kolimbola na phrase moko?",
    kg: "Mono bakisi mbote ve. Nge lenda tendula na diambu mosi?",
    sw: "Sina uhakika nimeelewa vizuri. Unaweza kufafanua kwa sentensi moja?",
    lua: "Tshiena mumvue bimpe. Udi mua kumvuija mu tshiambilu tshimue?",
  },
  SAFETY_ESCALATION_CREATED: {
    fr: "Un agent a été alerté et va vous rappeler. Suivez le conseil d'urgence donné.",
    ln: "Toyebisi agent, akobenga yo. Landa toli ya lombango oyo topesi yo.",
    kg: "Beto zabisa nsadi, yandi ta bokila nge. Landa ndongisila ya nswalu.",
    sw: "Mhudumu amearifiwa na atakupigia simu. Fuata ushauri wa dharura uliopewa.",
    lua: "Tudi bamanyishe muena mudimu, neakubikile. Landa mubelu wa lukasa.",
  },
  STATE_CONFLICT: {
    fr: "Cette demande a déjà été traitée ou a changé entre-temps.",
    ln: "Likambo oyo esilaki kosalema to ebongwani.",
    kg: "Diambu yai me salama dezia to me soba.",
    sw: "Ombi hili tayari limeshughulikiwa au limebadilika.",
    lua: "Dilomba edi diakadi dienzeke anyi diakushintuluka.",
  },
  RATE_LIMITED: {
    fr: "Trop de demandes en peu de temps. Patientez un instant puis réessayez.",
    ln: "Basengi mingi na tango moke. Zela mwa moke, meka lisusu.",
    kg: "Balombi mingi na ntangu fioti. Vingila fioti, meka diaka.",
    sw: "Maombi mengi kwa muda mfupi. Subiri kidogo kisha ujaribu tena.",
    lua: "Malomba a bungi mu tshikondo tshîpi. Indila katupa, teta kabidi.",
  },
  DEPENDENCY_UNAVAILABLE: {
    fr: "Le service est momentanément indisponible. Votre message est enregistré, réessayez bientôt.",
    ln: "Service ezali kosala malamu te sikoyo. Message na yo ebombami, meka lisusu.",
    kg: "Kisalu ke sala mbote ve ntangu yai. Nsangu na nge me bumbama, meka diaka.",
    sw: "Huduma haipatikani kwa sasa. Ujumbe wako umehifadhiwa, jaribu tena baadaye.",
    lua: "Mudimu kawena wenza mpindieu. Mukenji webe mmulame, teta kabidi.",
  },
  POLICY_BLOCKED: {
    fr: "Nous ne pouvons pas répondre à cette demande. Adressez-vous à un agent de santé.",
    ln: "Tokoki koyanola na likambo oyo te. Kende epai ya agent ya santé.",
    kg: "Beto lenda vutula ve na diambu yai. Kwenda na nsadi ya mavimpi.",
    sw: "Hatuwezi kujibu ombi hili. Wasiliana na mhudumu wa afya.",
    lua: "Katuena mua kuandamuna dilomba edi. Ya kudi muena mudimu wa makanda.",
  },
  NOT_FOUND: {
    fr: "Cette conversation est introuvable ou a expiré.",
    ln: "Lisolo oyo ezali te to esili tango.",
    kg: "Disolo yai kele ve to ntangu me manisa.",
    sw: "Mazungumzo haya hayapatikani au muda wake umeisha.",
    lua: "Muyuki eu kawuena anyi tshikondo tshiakujika.",
  },
  VALIDATION_FAILED: {
    fr: "La demande est incomplète. Vérifiez les informations envoyées.",
    ln: "Bosengi ekoki te. Talá makambo oyo otindi.",
    kg: "Lombi ke ya kukuka ve. Tala mambu ya nge tindaka.",
    sw: "Ombi halijakamilika. Angalia taarifa ulizotuma.",
    lua: "Dilomba kadiakumbana. Tangila malu uvua mutume.",
  },
  UNAUTHORISED: {
    fr: "Veuillez vous identifier avant de continuer.",
    ln: "Svp mikomisa liboso ya kokoba.",
    kg: "Kudisonika ntete na ntwala ya kulanda.",
    sw: "Tafadhali jitambulishe kabla ya kuendelea.",
    lua: "Tuadija kudimanyisha kumpala kua kutungunuka.",
  },
  INTERNAL_ERROR: {
    fr: "Une erreur est survenue de notre côté. Votre message est enregistré.",
    ln: "Libunga esalemi epai na biso. Message na yo ebombami.",
    kg: "Kifu me salama na ndambu na beto. Nsangu na nge me bumbama.",
    sw: "Kumetokea hitilafu upande wetu. Ujumbe wako umehifadhiwa.",
    lua: "Bualu kabuakenza bimpe kutudi. Mukenji webe mmulame.",
  },
};

export interface ChannelErrorBody {
  code: ChannelErrorCode;
  message_key: string;
  safe_localised_message: string;
  retryable: boolean;
  fields: string[];
  request_id: string;
}

export class ChannelError extends Error {
  readonly code: ChannelErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fields: string[];
  readonly language: LanguageCode;
  readonly requestId: string;
  /** Extra, non-sensitive payload merged into the response body (e.g. sessionId). */
  readonly extra: Record<string, unknown>;

  constructor(
    code: ChannelErrorCode,
    opts: { language?: LanguageCode; fields?: string[]; requestId?: string; detail?: string; extra?: Record<string, unknown> } = {},
  ) {
    const spec = SPEC[code];
    super(opts.detail ?? code);
    this.name = "ChannelError";
    this.code = code;
    this.status = spec.status;
    this.retryable = spec.retryable;
    this.fields = opts.fields ?? [];
    this.language = opts.language ?? "fr";
    this.requestId = opts.requestId ?? randomUUID();
    this.extra = opts.extra ?? {};
  }

  body(): ChannelErrorBody & Record<string, unknown> {
    return { ...this.extra, ...channelErrorBody(this.code, this.language, this.fields, this.requestId) };
  }

  response(): Response {
    return Response.json(this.body(), { status: this.status, headers: { "X-Request-Id": this.requestId } });
  }
}

export function channelErrorBody(
  code: ChannelErrorCode,
  language: LanguageCode = "fr",
  fields: string[] = [],
  requestId: string = randomUUID(),
): ChannelErrorBody {
  const spec = SPEC[code];
  return {
    code,
    message_key: spec.messageKey,
    safe_localised_message: MESSAGES[code][language] ?? MESSAGES[code].fr,
    retryable: spec.retryable,
    fields,
    request_id: requestId,
  };
}

/** Localised, citizen-safe text for a code — used when a channel speaks the error aloud. */
export function safeMessage(code: ChannelErrorCode, language: LanguageCode = "fr"): string {
  return MESSAGES[code][language] ?? MESSAGES[code].fr;
}

/** Converts any thrown value into the channel error envelope. */
export function toChannelResponse(err: unknown, language: LanguageCode = "fr", requestId: string = randomUUID()): Response {
  if (err instanceof ChannelError) return err.response();
  console.error("[channels]", err);
  const body = channelErrorBody("INTERNAL_ERROR", language, [], requestId);
  return Response.json(body, { status: 500, headers: { "X-Request-Id": requestId } });
}

export function newRequestId(): string {
  return randomUUID();
}
