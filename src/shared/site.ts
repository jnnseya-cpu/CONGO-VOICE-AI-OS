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
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://congovoice.cd",
  operator: "Groupe Nseya Digital / JNN Global Ltd",
  country: "République Démocratique du Congo",
  status: "Pilote — préparation du déploiement national",
  /** Access channels. `pending: true` means the number is being attributed with the operators. */
  channels: {
    voice: { label: "Appel vocal", value: "Numéro court national", pending: true, note: "Gratuit pour l'appelant, en cours de négociation avec les opérateurs" },
    whatsapp: { label: "WhatsApp", value: "Numéro WhatsApp du programme", pending: true, note: "Notes vocales, photos et messages" },
    ussd: { label: "USSD", value: "Code court USSD", pending: true, note: "Menu simple, sans internet, sur tout téléphone" },
    sms: { label: "SMS", value: "Numéro court SMS", pending: true, note: "Réponses et rappels par message" },
    web: { label: "Application web", value: "congovoice.cd", pending: false, note: "Fonctionne hors ligne une fois ouverte" },
  },
  contact: {
    general: "contact@congovoice.cd",
    dataProtection: "donnees@congovoice.cd",
    press: "presse@congovoice.cd",
    partnerships: "partenaires@congovoice.cd",
    safety: "securite@congovoice.cd",
  },
  /**
   * The domain and the e-mail routes below are the programme's planned addresses. They are
   * activated with the hosting and registrar setup; until NEXT_PUBLIC_SITE_URL is configured
   * for a live deployment they are shown as being activated rather than as reachable today.
   */
  contactsActive: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
  contactsNote:
    "Les adresses du programme sont en cours d'activation avec l'hébergement. En attendant, passez par votre relais communautaire, votre agent agricole ou votre enseignant référent.",
  languages: [
    { code: "fr", label: "Français", native: "Français" },
    { code: "ln", label: "Lingala", native: "Lingála" },
    { code: "kg", label: "Kikongo", native: "Kikongo" },
    { code: "sw", label: "Kiswahili", native: "Kiswahili" },
    { code: "lua", label: "Tshiluba", native: "Tshilubà" },
  ],
} as const;

/** Public pages, used by the header, the footer and the sitemap. */
export const PUBLIC_PAGES = [
  { href: "/programme", label: "Le programme", group: "programme", description: "Le problème, la réponse, la couverture et les résultats attendus." },
  { href: "/services", label: "Les services", group: "programme", description: "Santé, agriculture et éducation : ce que le service fait et ne fait pas." },
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
