/**
 * Reference geography of the Democratic Republic of the Congo: the 26 provinces of the
 * 2015 découpage with their capitals, and their territories, cities and (for Kinshasa)
 * communes.
 *
 * ⚠ REFERENCE DATA TO VALIDATE — this list is the operational starting point for routing
 * and reporting. It must be checked against the official INS / Ministry of the Interior
 * nomenclature before national rollout; territory lists in particular evolve. Every entry
 * carries a `type` so a validation pass can be scoped (territoire | ville | commune).
 */

export interface ProvinceRef {
  code: string;
  name: string;
  capital: string;
  /** Pilot provinces receive the full service directory and staffing first. */
  pilot?: boolean;
  territories: Array<{ name: string; type: "territoire" | "ville" | "commune" }>;
}

const T = (...names: string[]) => names.map((name) => ({ name, type: "territoire" as const }));
const V = (...names: string[]) => names.map((name) => ({ name, type: "ville" as const }));
const C = (...names: string[]) => names.map((name) => ({ name, type: "commune" as const }));

export const PROVINCES: ProvinceRef[] = [
  {
    code: "KIN",
    name: "Kinshasa",
    capital: "Kinshasa",
    pilot: true,
    territories: [
      ...V("Kinshasa"),
      ...C(
        "Bandalungwa",
        "Barumbu",
        "Bumbu",
        "Gombe",
        "Kalamu",
        "Kasa-Vubu",
        "Kimbanseke",
        "Kinshasa",
        "Kintambo",
        "Kisenso",
        "Lemba",
        "Limete",
        "Lingwala",
        "Makala",
        "Maluku",
        "Masina",
        "Matete",
        "Mont-Ngafula",
        "Ndjili",
        "Ngaba",
        "Ngaliema",
        "Ngiri-Ngiri",
        "Nsele",
        "Selembao",
      ),
    ],
  },
  {
    code: "KCE",
    name: "Kongo-Central",
    capital: "Matadi",
    pilot: true,
    territories: [
      ...V("Matadi", "Boma"),
      ...T("Kasangulu", "Kimvula", "Luozi", "Lukula", "Madimba", "Mbanza-Ngungu", "Moanda", "Seke-Banza", "Songololo", "Tshela"),
    ],
  },
  { code: "KWG", name: "Kwango", capital: "Kenge", territories: [...V("Kenge"), ...T("Feshi", "Kahemba", "Kasongo-Lunda", "Kenge", "Popokabaka")] },
  { code: "KWL", name: "Kwilu", capital: "Bandundu", territories: [...V("Bandundu", "Kikwit"), ...T("Bagata", "Bulungu", "Gungu", "Idiofa", "Masi-Manimba")] },
  { code: "MAN", name: "Maï-Ndombe", capital: "Inongo", territories: [...V("Inongo"), ...T("Bolobo", "Inongo", "Kiri", "Kutu", "Kwamouth", "Mushie", "Oshwe", "Yumbi")] },
  { code: "KAS", name: "Kasaï", capital: "Tshikapa", territories: [...V("Tshikapa"), ...T("Dekese", "Ilebo", "Luebo", "Mweka", "Tshikapa")] },
  { code: "KCT", name: "Kasaï-Central", capital: "Kananga", territories: [...V("Kananga"), ...T("Demba", "Dibaya", "Dimbelenge", "Kazumba", "Luiza")] },
  {
    code: "KOR",
    name: "Kasaï-Oriental",
    capital: "Mbuji-Mayi",
    pilot: true,
    territories: [...V("Mbuji-Mayi"), ...T("Kabeya-Kamwanga", "Katanda", "Lupatapata", "Miabi", "Tshilenge")],
  },
  { code: "LOM", name: "Lomami", capital: "Kabinda", territories: [...V("Kabinda", "Mwene-Ditu"), ...T("Kabinda", "Kamiji", "Lubao", "Luilu", "Ngandajika")] },
  { code: "SAN", name: "Sankuru", capital: "Lusambo", territories: [...V("Lusambo"), ...T("Katako-Kombe", "Kole", "Lodja", "Lomela", "Lubefu", "Lusambo")] },
  { code: "MAI", name: "Maniema", capital: "Kindu", territories: [...V("Kindu"), ...T("Kabambare", "Kailo", "Kasongo", "Kibombo", "Lubutu", "Pangi", "Punia")] },
  { code: "SKV", name: "Sud-Kivu", capital: "Bukavu", territories: [...V("Bukavu", "Uvira"), ...T("Fizi", "Idjwi", "Kabare", "Kalehe", "Mwenga", "Shabunda", "Uvira", "Walungu")] },
  {
    code: "NKV",
    name: "Nord-Kivu",
    capital: "Goma",
    pilot: true,
    territories: [...V("Goma", "Butembo", "Beni"), ...T("Beni", "Lubero", "Masisi", "Nyiragongo", "Rutshuru", "Walikale")],
  },
  { code: "ITU", name: "Ituri", capital: "Bunia", territories: [...V("Bunia"), ...T("Aru", "Djugu", "Irumu", "Mahagi", "Mambasa")] },
  { code: "HUE", name: "Haut-Uélé", capital: "Isiro", territories: [...V("Isiro"), ...T("Dungu", "Faradje", "Niangara", "Rungu", "Wamba", "Watsa")] },
  {
    code: "TSO",
    name: "Tshopo",
    capital: "Kisangani",
    pilot: true,
    territories: [...V("Kisangani"), ...T("Bafwasende", "Banalia", "Basoko", "Isangi", "Opala", "Ubundu", "Yahuma")],
  },
  { code: "BUE", name: "Bas-Uélé", capital: "Buta", territories: [...V("Buta"), ...T("Aketi", "Ango", "Bambesa", "Bondo", "Buta", "Poko")] },
  { code: "NUB", name: "Nord-Ubangi", capital: "Gbadolite", territories: [...V("Gbadolite"), ...T("Bosobolo", "Businga", "Mobayi-Mbongo", "Yakoma")] },
  { code: "MON", name: "Mongala", capital: "Lisala", territories: [...V("Lisala"), ...T("Bongandanga", "Bumba", "Lisala")] },
  { code: "SUB", name: "Sud-Ubangi", capital: "Gemena", territories: [...V("Gemena", "Zongo"), ...T("Budjala", "Gemena", "Kungu", "Libenge")] },
  { code: "EQU", name: "Équateur", capital: "Mbandaka", territories: [...V("Mbandaka"), ...T("Basankusu", "Bikoro", "Bolomba", "Bomongo", "Ingende", "Lukolela", "Makanza")] },
  { code: "TSU", name: "Tshuapa", capital: "Boende", territories: [...V("Boende"), ...T("Befale", "Boende", "Bokungu", "Djolu", "Ikela", "Monkoto")] },
  { code: "TAN", name: "Tanganyika", capital: "Kalemie", territories: [...V("Kalemie"), ...T("Kabalo", "Kalemie", "Kongolo", "Manono", "Moba", "Nyunzu")] },
  { code: "HLO", name: "Haut-Lomami", capital: "Kamina", territories: [...V("Kamina"), ...T("Bukama", "Kabongo", "Kamina", "Kaniama", "Malemba-Nkulu")] },
  { code: "LUA", name: "Lualaba", capital: "Kolwezi", territories: [...V("Kolwezi"), ...T("Dilolo", "Kapanga", "Lubudi", "Mutshatsha", "Sandoa")] },
  {
    code: "HKA",
    name: "Haut-Katanga",
    capital: "Lubumbashi",
    pilot: true,
    territories: [...V("Lubumbashi", "Likasi", "Kipushi"), ...T("Kambove", "Kasenga", "Kipushi", "Mitwaba", "Pweto", "Sakania")],
  },
];

export const PILOT_PROVINCES = PROVINCES.filter((p) => p.pilot).map((p) => p.name);

export function provinceByName(name: string): ProvinceRef | undefined {
  return PROVINCES.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

export function territoriesOf(provinceName: string): string[] {
  return provinceByName(provinceName)?.territories.map((t) => t.name) ?? [];
}

/** Sanity figures used by the seed log and by the reference-data validation task. */
export const GEOGRAPHY_STATS = {
  provinces: PROVINCES.length,
  entries: PROVINCES.reduce((s, p) => s + p.territories.length, 0),
  status: "reference_data_to_validate" as const,
};
