import { LANGUAGES } from "./types";

/**
 * Public identity of the programme. Single source of truth for the marketing surface,
 * metadata, structured data and the service directory shown to citizens.
 *
 * Values marked "à confirmer" are programme decisions (short code, numbers, addresses)
 * that are attributed during Phase 0; they are displayed as pending rather than invented.
 */
export const SITE = {
  name: "CONGO VOICE AI OS",
  shortDescription: "Plateforme nationale d'inclusion numérique vocale",
  description:
    "Service public vocal qui permet à chaque citoyen congolais d'obtenir une orientation en santé, un conseil agricole et un appui scolaire en parlant dans sa langue — français, lingala, kikongo, kiswahili ou tshiluba — depuis n'importe quel téléphone, sans savoir lire ni écrire. Gratuit pour les citoyens.",
  tagline: "Your Voice. Our Intelligence. Stronger Congo.",
  taglineFr: "Votre voix. Notre intelligence. Un Congo plus fort.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://congovoicecd.com",
  operator: "Groupe Nseya Digital / JNN Global Ltd",
  country: "République Démocratique du Congo",
  status: "Pilote — préparation du déploiement national",
  /** Access channels. `pending: true` means the number is being attributed with the operators. */
  channels: {
    voice: { label: "Appel vocal", value: "Numéro court national", pending: true, note: "Gratuit pour l'appelant, en cours de négociation avec les opérateurs" },
    whatsapp: { label: "WhatsApp", value: "Numéro WhatsApp du programme", pending: true, note: "Notes vocales, photos et messages" },
    ussd: { label: "USSD", value: "Code court USSD", pending: true, note: "Menu simple, sans internet, sur tout téléphone" },
    sms: { label: "SMS", value: "Numéro court SMS", pending: true, note: "Réponses et rappels par message" },
    web: { label: "Application web", value: "congovoicecd.com", pending: false, note: "Fonctionne hors ligne une fois ouverte" },
  },
  /**
   * One address, because one mailbox exists.
   *
   * This was five — donnees@, presse@, partenaires@, securite@ — which read
   * well and none of which had an inbox. An address on a published page is a
   * promise that someone reads it, and the help page used two of them to tell
   * citizens how to exercise a data right and how to report a safety problem.
   * Mail to either bounced. A citizen who asks for their recordings to be
   * deleted and hears nothing has been failed by the programme, not
   * inconvenienced by a typo.
   *
   * Give a route its own address when the mailbox is created, not before.
   * NEXT_PUBLIC_CONTACT_EMAIL overrides it for a deployment that has others.
   */
  contact: {
    general: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@congovoicecd.com",
    get dataProtection() { return this.general; },
    get press() { return this.general; },
    get partnerships() { return this.general; },
    get safety() { return this.general; },
  },
  contactsActive: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
  contactsNote:
    "Une seule adresse reçoit le courrier du programme. Vous pouvez aussi passer par votre relais communautaire, votre agent agricole ou votre enseignant référent.",
  /** Derived from the shared language list so the public site and the product cannot disagree. */
  languages: LANGUAGES,
} as const;

/** Public pages, used by the header, the footer and the sitemap. */
export const PUBLIC_PAGES = [
  { href: "/programme", label: "Le programme", group: "programme", description: "Le problème, la réponse, la couverture et les résultats attendus." },
  { href: "/services", label: "Les services", group: "programme", description: "Santé, agriculture et éducation : ce que le service fait et ne fait pas." },
  { href: "/blog", label: "Blog", group: "programme", description: "Recherche appliquée et retours de terrain sur l'IA vocale en langues congolaises." },
  { href: "/acces", label: "Comment y accéder", group: "citoyen", description: "Appel, WhatsApp, USSD, SMS, web et guichet assisté." },
  { href: "/urgence", label: "En cas d'urgence", group: "citoyen", description: "Que faire immédiatement devant un signe de danger." },
  { href: "/aide", label: "Questions fréquentes", group: "citoyen", description: "Ce que les citoyens demandent le plus souvent." },
  { href: "/langues-nationales", label: "Nos langues", group: "programme", description: "Couverture par langue, seuils de qualité et correction par des locuteurs natifs." },
  { href: "/gouvernance", label: "Sécurité et gouvernance", group: "institution", description: "Règles déterministes, revue clinique, supervision humaine et audit." },
  { href: "/financement", label: "Financement", group: "institution", description: "Modèle de financement public, coût par interaction et transparence." },
  { href: "/partenaires", label: "Partenaires", group: "institution", description: "Ministères, ONG, opérateurs et intégrateurs techniques." },
  { href: "/confidentialite", label: "Protection des données", group: "legal", description: "Ce qui est collecté, pourquoi, combien de temps et vos droits." },
  { href: "/accessibilite", label: "Accessibilité", group: "legal", description: "Engagement WCAG 2.2 AA et conception vocale pour faible littératie." },
  { href: "/conditions", label: "Conditions d'utilisation", group: "legal", description: "Ce que le service garantit et ce qu'il ne garantit pas." },
  { href: "/contact", label: "Contact et presse", group: "institution", description: "Écrire au programme, demander une présentation, dossier de presse." },
] as const;

export type PublicPage = (typeof PUBLIC_PAGES)[number];
