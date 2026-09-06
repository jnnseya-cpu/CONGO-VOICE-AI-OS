/**
 * Weather tool (FR-AG-06). Uses Open-Meteo — free, no API key, no account — with a
 * province centroid table maintained here. Every answer is rendered in plain language for
 * a farmer and degrades gracefully to a seasonal answer when the network is unavailable.
 */
import "server-only";
import { normaliseProvince, seasonFor, zoneFor, type AgroZone } from "@/lib/db/reference/agriculture";

export interface Centroid {
  lat: number;
  lon: number;
  capital: string;
}

/** Approximate geographic centre of each of the 26 provinces (decimal degrees). */
export const PROVINCE_CENTROIDS: Record<string, Centroid> = {
  Kinshasa: { lat: -4.33, lon: 15.31, capital: "Kinshasa" },
  "Kongo-Central": { lat: -5.32, lon: 13.95, capital: "Matadi" },
  Kwango: { lat: -6.42, lon: 17.68, capital: "Kenge" },
  Kwilu: { lat: -5.04, lon: 18.81, capital: "Kikwit" },
  "Maï-Ndombe": { lat: -2.52, lon: 18.32, capital: "Inongo" },
  Équateur: { lat: 0.05, lon: 18.26, capital: "Mbandaka" },
  "Sud-Ubangi": { lat: 3.05, lon: 19.19, capital: "Gemena" },
  "Nord-Ubangi": { lat: 3.72, lon: 21.05, capital: "Gbadolite" },
  Mongala: { lat: 2.14, lon: 21.51, capital: "Lisala" },
  Tshuapa: { lat: -0.94, lon: 21.45, capital: "Boende" },
  Tshopo: { lat: 0.52, lon: 25.19, capital: "Kisangani" },
  "Bas-Uélé": { lat: 3.62, lon: 24.51, capital: "Buta" },
  "Haut-Uélé": { lat: 3.19, lon: 28.31, capital: "Isiro" },
  Ituri: { lat: 1.56, lon: 29.87, capital: "Bunia" },
  "Nord-Kivu": { lat: -0.71, lon: 29.22, capital: "Goma" },
  "Sud-Kivu": { lat: -2.99, lon: 28.32, capital: "Bukavu" },
  Maniema: { lat: -2.94, lon: 26.18, capital: "Kindu" },
  Sankuru: { lat: -3.62, lon: 23.6, capital: "Lusambo" },
  "Kasaï": { lat: -5.02, lon: 21.0, capital: "Tshikapa" },
  "Kasaï-Central": { lat: -5.9, lon: 22.42, capital: "Kananga" },
  "Kasaï-Oriental": { lat: -6.14, lon: 23.6, capital: "Mbuji-Mayi" },
  Lomami: { lat: -6.42, lon: 24.63, capital: "Kabinda" },
  "Haut-Lomami": { lat: -8.52, lon: 25.51, capital: "Kamina" },
  Lualaba: { lat: -10.71, lon: 25.47, capital: "Kolwezi" },
  "Haut-Katanga": { lat: -11.66, lon: 27.48, capital: "Lubumbashi" },
  Tanganyika: { lat: -5.92, lon: 29.19, capital: "Kalemie" },
};

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  rainMm: number;
  tMaxC: number | null;
  tMinC: number | null;
  rainProbability: number | null;
}

export interface WeatherAnswer {
  province: string;
  capital: string;
  zone: AgroZone;
  source: "open-meteo" | "saisonnier";
  live: boolean;
  observedAt: string;
  season: { code: string; label: string; advice: string };
  days: DailyForecast[];
  rainNext3DaysMm: number;
  rainNext7DaysMm: number;
  dryDaysNext7: number;
  /** Plain-language rendering, ready to be spoken. */
  text: string;
  fieldAdvice: string[];
  notice: string | null;
}

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 4000;

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
  };
}

export interface WeatherOptions {
  days?: number;
  date?: Date;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Skip the network entirely (offline device, test run). */
  offline?: boolean;
}

function round(n: number, d = 1) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function rainWord(mm: number): string {
  if (mm < 1) return "pas de pluie";
  if (mm < 5) return "une petite pluie";
  if (mm < 20) return "de la pluie";
  if (mm < 50) return "de fortes pluies";
  return "des pluies très fortes";
}

/** Seven-day forecast for a province, in plain language. Never throws. */
export async function getWeather(provinceInput: string | null | undefined, opts: WeatherOptions = {}): Promise<WeatherAnswer> {
  const province = normaliseProvince(provinceInput) ?? "Kinshasa";
  const centroid = PROVINCE_CENTROIDS[province] ?? PROVINCE_CENTROIDS.Kinshasa;
  const zone = zoneFor(province);
  const date = opts.date ?? new Date();
  const season = seasonFor(province, date);
  const days = Math.min(10, Math.max(1, opts.days ?? 7));

  let daily: DailyForecast[] = [];
  let live = false;
  let notice: string | null = null;

  if (!opts.offline) {
    try {
      const url = `${ENDPOINT}?latitude=${centroid.lat}&longitude=${centroid.lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Africa%2FKinshasa&forecast_days=${days}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const doFetch = opts.fetchImpl ?? fetch;
      const res = await doFetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`open-meteo ${res.status}`);
      const json = (await res.json()) as OpenMeteoDaily;
      const t = json.daily?.time ?? [];
      daily = t.map((d, i) => ({
        date: d,
        rainMm: Number(json.daily?.precipitation_sum?.[i] ?? 0) || 0,
        tMaxC: json.daily?.temperature_2m_max?.[i] ?? null,
        tMinC: json.daily?.temperature_2m_min?.[i] ?? null,
        rainProbability: json.daily?.precipitation_probability_max?.[i] ?? null,
      }));
      live = daily.length > 0;
    } catch (err) {
      notice = "Prévision météo indisponible hors connexion : réponse basée sur le calendrier saisonnier.";
      console.warn("[weather] falling back to seasonal advice:", err instanceof Error ? err.message : err);
    }
  } else {
    notice = "Mode hors ligne : réponse basée sur le calendrier saisonnier de la province.";
  }

  const rainNext3DaysMm = round(daily.slice(0, 3).reduce((s, d) => s + d.rainMm, 0));
  const rainNext7DaysMm = round(daily.slice(0, 7).reduce((s, d) => s + d.rainMm, 0));
  const dryDaysNext7 = daily.slice(0, 7).filter((d) => d.rainMm < 1).length;

  const fieldAdvice = live ? advice(rainNext3DaysMm, rainNext7DaysMm, dryDaysNext7, season.code) : [season.advice];
  const text = live
    ? `À ${province} (${centroid.capital}), pour les 3 prochains jours : ${rainWord(rainNext3DaysMm)}, environ ${rainNext3DaysMm} mm. Sur 7 jours : environ ${rainNext7DaysMm} mm, dont ${dryDaysNext7} jour(s) sans pluie. Nous sommes en ${season.label}.`
    : `Prévision détaillée indisponible pour ${province}. Nous sommes en ${season.label} : ${season.advice}`;

  return {
    province,
    capital: centroid.capital,
    zone,
    source: live ? "open-meteo" : "saisonnier",
    live,
    observedAt: date.toISOString(),
    season: { code: season.code, label: season.label, advice: season.advice },
    days: daily,
    rainNext3DaysMm,
    rainNext7DaysMm,
    dryDaysNext7,
    text,
    fieldAdvice,
    notice,
  };
}

function advice(rain3: number, rain7: number, dryDays: number, seasonCode: string): string[] {
  const out: string[] = [];
  if (rain3 < 2) out.push("Peu de pluie attendue : bon moment pour sarcler, sécher la récolte ou traiter les cultures.");
  if (rain3 >= 2 && rain3 < 20) out.push("Pluies modérées : bon moment pour semer si le sol est déjà préparé.");
  if (rain3 >= 20) out.push("Pluies importantes : évitez de traiter ou d'épandre de l'engrais, la pluie lessiverait le produit.");
  if (rain7 >= 60) out.push("Beaucoup d'eau cette semaine : ouvrez les rigoles de drainage et surveillez les maladies des feuilles.");
  if (dryDays >= 5) out.push("Semaine plutôt sèche : paillez les planches et arrosez les pépinières matin et soir.");
  if (seasonCode === "saison_seche") out.push("Saison sèche : privilégiez le stockage, les bas-fonds et la préparation des champs.");
  return out.length ? out : ["Surveillez le champ chaque jour et adaptez les travaux à la pluie observée."];
}
