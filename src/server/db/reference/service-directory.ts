/**
 * Referral directory for the pilot provinces: health centres, general referral hospitals,
 * veterinary posts, agricultural extension offices and the national call centre.
 *
 * ⚠ REFERENCE DATA TO VALIDATE — names, health zones and telephone numbers are programme
 * placeholders and must be confirmed with the provincial health divisions and the
 * agricultural inspectorates before a citizen is ever sent to one of these addresses.
 * `phone: null` means "no verified number": the platform then gives directions only.
 */

export type ServiceType = "cs" | "hgr" | "veterinary" | "extension_office" | "school" | "call_centre";

export interface ServiceEntry {
  type: ServiceType;
  name: string;
  province: string;
  territory?: string;
  healthZone?: string;
  phone?: string | null;
  notes?: string;
}

export const SERVICE_DIRECTORY: ServiceEntry[] = [
  // ── Kinshasa ───────────────────────────────────────────────────────────────────────────
  { type: "hgr", name: "Hôpital Général de Référence de Kinshasa", province: "Kinshasa", territory: "Gombe", healthZone: "Gombe", phone: null, notes: "Référence provinciale, urgences 24 h/24." },
  { type: "hgr", name: "HGR de Kimbanseke", province: "Kinshasa", territory: "Kimbanseke", healthZone: "Kimbanseke", phone: null, notes: "Référence pour les cas pédiatriques graves de la zone." },
  { type: "cs", name: "Centre de santé Mokali", province: "Kinshasa", territory: "Kimbanseke", healthZone: "Kimbanseke", phone: null, notes: "CPN, vaccination PEV, prise en charge du paludisme simple." },
  { type: "cs", name: "Centre de santé Masina I", province: "Kinshasa", territory: "Masina", healthZone: "Masina I", phone: null, notes: "Vaccination et consultations préscolaires." },
  { type: "cs", name: "Centre de santé Selembao", province: "Kinshasa", territory: "Selembao", healthZone: "Selembao", phone: null },
  { type: "extension_office", name: "Inspection provinciale de l'agriculture — Kinshasa", province: "Kinshasa", territory: "Gombe", phone: null, notes: "Appui maraîchage périurbain, N'sele et Maluku." },
  { type: "veterinary", name: "Poste vétérinaire de Maluku", province: "Kinshasa", territory: "Maluku", phone: null, notes: "Volaille, petits ruminants, déclaration des maladies du bétail." },
  { type: "call_centre", name: "Centre d'appel national CONGO VOICE AI OS", province: "Kinshasa", territory: "Gombe", phone: null, notes: "Assistance vocale multilingue, escalade humaine." },

  // ── Nord-Kivu ──────────────────────────────────────────────────────────────────────────
  { type: "hgr", name: "HGR de Goma", province: "Nord-Kivu", territory: "Goma", healthZone: "Goma", phone: null, notes: "Urgences, maternité de référence." },
  { type: "cs", name: "Centre de santé Ndosho", province: "Nord-Kivu", territory: "Goma", healthZone: "Karisimbi", phone: null },
  { type: "cs", name: "Centre de santé de Kibumba", province: "Nord-Kivu", territory: "Nyiragongo", healthZone: "Nyiragongo", phone: null },
  { type: "hgr", name: "HGR de Rutshuru", province: "Nord-Kivu", territory: "Rutshuru", healthZone: "Rutshuru", phone: null },
  { type: "extension_office", name: "Inspection agricole de Rutshuru", province: "Nord-Kivu", territory: "Rutshuru", phone: null, notes: "Pomme de terre, haricot, maïs ; suivi des foyers de mildiou." },
  { type: "veterinary", name: "Poste vétérinaire de Masisi", province: "Nord-Kivu", territory: "Masisi", phone: null, notes: "Bovins, fièvre aphteuse, déclaration obligatoire." },

  // ── Kongo-Central ──────────────────────────────────────────────────────────────────────
  { type: "hgr", name: "HGR de Matadi (Kinkanda)", province: "Kongo-Central", territory: "Matadi", healthZone: "Matadi", phone: null },
  { type: "cs", name: "Centre de santé de Mbanza-Ngungu", province: "Kongo-Central", territory: "Mbanza-Ngungu", healthZone: "Mbanza-Ngungu", phone: null },
  { type: "cs", name: "Centre de santé de Kasangulu", province: "Kongo-Central", territory: "Kasangulu", healthZone: "Kasangulu", phone: null },
  { type: "extension_office", name: "Inspection agricole du Kongo-Central", province: "Kongo-Central", territory: "Matadi", phone: null, notes: "Manioc, arachide, banane ; calendrier cultural provincial." },
  { type: "veterinary", name: "Poste vétérinaire de Songololo", province: "Kongo-Central", territory: "Songololo", phone: null },

  // ── Kasaï-Oriental ─────────────────────────────────────────────────────────────────────
  { type: "hgr", name: "HGR Dipumba — Mbuji-Mayi", province: "Kasaï-Oriental", territory: "Mbuji-Mayi", healthZone: "Dibindi", phone: null },
  { type: "cs", name: "Centre de santé Dibindi", province: "Kasaï-Oriental", territory: "Mbuji-Mayi", healthZone: "Dibindi", phone: null, notes: "Vaccination PEV, CPN." },
  { type: "cs", name: "Centre de santé de Tshilenge", province: "Kasaï-Oriental", territory: "Tshilenge", healthZone: "Tshilenge", phone: null },
  { type: "extension_office", name: "Inspection agricole du Kasaï-Oriental", province: "Kasaï-Oriental", territory: "Mbuji-Mayi", phone: null, notes: "Manioc, maïs ; surveillance de la mosaïque du manioc." },
  { type: "school", name: "École primaire Dibindi", province: "Kasaï-Oriental", territory: "Mbuji-Mayi", phone: null, notes: "Établissement pilote du module éducation." },

  // ── Tshopo ─────────────────────────────────────────────────────────────────────────────
  { type: "hgr", name: "HGR de Kisangani (Makiso)", province: "Tshopo", territory: "Kisangani", healthZone: "Makiso-Kisangani", phone: null },
  { type: "cs", name: "Centre de santé Kabondo", province: "Tshopo", territory: "Kisangani", healthZone: "Kabondo", phone: null },
  { type: "cs", name: "Centre de santé d'Isangi", province: "Tshopo", territory: "Isangi", healthZone: "Isangi", phone: null },
  { type: "extension_office", name: "Inspection agricole de la Tshopo", province: "Tshopo", territory: "Kisangani", phone: null, notes: "Riz, manioc, palmier à huile." },
  { type: "veterinary", name: "Poste vétérinaire de Banalia", province: "Tshopo", territory: "Banalia", phone: null },

  // ── Haut-Katanga ───────────────────────────────────────────────────────────────────────
  { type: "hgr", name: "HGR Jason Sendwe — Lubumbashi", province: "Haut-Katanga", territory: "Lubumbashi", healthZone: "Lubumbashi", phone: null },
  { type: "cs", name: "Centre de santé Kenya", province: "Haut-Katanga", territory: "Lubumbashi", healthZone: "Kenya", phone: null },
  { type: "cs", name: "Centre de santé de Kipushi", province: "Haut-Katanga", territory: "Kipushi", healthZone: "Kipushi", phone: null },
  { type: "extension_office", name: "Inspection agricole du Haut-Katanga", province: "Haut-Katanga", territory: "Lubumbashi", phone: null, notes: "Maïs, soja ; alerte chenille légionnaire d'automne." },
  { type: "veterinary", name: "Poste vétérinaire de Kasenga", province: "Haut-Katanga", territory: "Kasenga", phone: null, notes: "Bovins et volaille ; maladie de Newcastle." },
];

export const SERVICE_DIRECTORY_STATUS = "reference_data_to_validate" as const;
