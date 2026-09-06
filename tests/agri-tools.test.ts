import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { checkImageQuality, reviewEvidence } from "@server/ai/tools/image-quality";
import { getPrices, parsePricesCsv, renderPrices, stalenessOf, PRICE_DISCLAIMER } from "@server/ai/tools/market";
import { getWeather, PROVINCE_CENTROIDS } from "@server/ai/tools/weather";
import { guardChemicalAdvice, mentionsChemical, searchRegistry, REFERRAL_TEXT } from "@server/ai/tools/input-registry";
import { calendarAdvice, ensureAgricultureReference, plantingCalendars, PROVINCES, CALENDAR_CROPS, seasonFor, normaliseProvince } from "@server/db/reference/agriculture";

beforeAll(async () => {
  resetDbForTests();
  await getDb();
  await ensureAgricultureReference();
});

/* ---------------------------------------------------------------- image fixtures */

function png(width: number, height: number, bytes: number): Buffer {
  const b = Buffer.alloc(Math.max(bytes, 33), 0x11);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width: number, height: number, bytes: number, exif = false): Buffer {
  const head: number[] = [0xff, 0xd8];
  if (exif) head.push(0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0);
  head.push(0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03, ...new Array(9).fill(0));
  head.push(0xff, 0xda, 0x00, 0x0c, ...new Array(10).fill(0));
  const filler = Buffer.alloc(Math.max(0, bytes - head.length - 2), 0x7f);
  return Buffer.concat([Buffer.from(head), filler, Buffer.from([0xff, 0xd9])]);
}

describe("agriculture · image quality gate (AGR-002)", () => {
  it("reads JPEG dimensions and EXIF presence from the header", () => {
    const r = checkImageQuality(jpeg(1600, 1200, Math.round(1600 * 1200 * 0.2), true), "image/jpeg");
    expect(r.width).toBe(1600);
    expect(r.height).toBe(1200);
    expect(r.usableForVision).toBe(true);
    expect(r.exif.present).toBe(true);
    expect(r.exif.note).toContain("EXIF");
    expect(r.recaptureGuidance).toBeNull();
  });

  it("reads PNG dimensions", () => {
    const r = checkImageQuality(png(1024, 768, Math.round(1024 * 768 * 0.3)), "image/png");
    expect(r.width).toBe(1024);
    expect(r.height).toBe(768);
    expect(r.usableForVision).toBe(true);
  });

  it("flags a tiny photo and returns recapture guidance", () => {
    const r = checkImageQuality(png(120, 90, 400), "image/png");
    expect(r.usableForVision).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("too_small");
    expect(r.recaptureGuidance).toMatch(/lumière du jour/i);
  });

  it("flags a very dark or blurry photo from its information density", () => {
    const r = checkImageQuality(jpeg(1600, 1200, 15000), "image/jpeg");
    expect(r.width).toBe(1600);
    expect(r.usableForVision).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("too_dark_or_blurry");
  });

  it("flags a truncated file", () => {
    const good = jpeg(1600, 1200, Math.round(1600 * 1200 * 0.2));
    const r = checkImageQuality(good.subarray(0, good.length - 4), "image/jpeg");
    expect(r.issues.map((i) => i.code)).toContain("truncated");
    expect(r.usableForVision).toBe(false);
  });

  it("keeps a video as evidence only and never sends it to vision", () => {
    const r = checkImageQuality(Buffer.alloc(5000), "video/mp4");
    expect(r.kind).toBe("video");
    expect(r.usableForVision).toBe(false);
    expect(r.recaptureGuidance).toMatch(/preuve/i);
  });

  it("reviews a whole batch of attachments", () => {
    const review = reviewEvidence([
      { data: jpeg(1600, 1200, Math.round(1600 * 1200 * 0.2)), mimeType: "image/jpeg" },
      { data: png(80, 80, 300), mimeType: "image/png" },
      { data: Buffer.alloc(2000), mimeType: "video/mp4" },
    ]);
    expect(review.usableIndexes).toEqual([0]);
    expect(review.visionWorthwhile).toBe(true);
    expect(review.videoOnly).toBe(false);
  });
});

/* ---------------------------------------------------------------- prices */

describe("agriculture · market prices (FR-AG-07)", () => {
  it("returns source, market, unit, grade, timestamp and staleness on every quote", async () => {
    const { prices, disclaimer } = await getPrices({ commodity: "maïs" });
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) {
      expect(p.market).toBeTruthy();
      expect(p.commodity).toContain("maïs");
      expect(p.unit).toBeTruthy();
      expect(p.grade).toBeTruthy();
      expect(p.source).toBeTruthy();
      expect(new Date(p.observedAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(p.ageDays).toBeGreaterThanOrEqual(0);
      expect(["fresh", "recent", "stale", "very_stale"]).toContain(p.staleness);
      expect(p.stalenessLabel).toBeTruthy();
      expect(p.disclaimer).toBe(PRICE_DISCLAIMER);
    }
    expect(disclaimer).toMatch(/n'est pas une offre/i);
  });

  it("never presents a price as a live offer", async () => {
    const { prices } = await getPrices({ commodity: "manioc" });
    const spoken = renderPrices(prices, "manioc");
    expect(spoken).toContain("Source :");
    expect(spoken).toMatch(/n'est pas une offre/i);
    expect(spoken.toLowerCase()).not.toContain("offre du jour");
  });

  it("classifies staleness by age", () => {
    expect(stalenessOf(0).staleness).toBe("fresh");
    expect(stalenessOf(3).staleness).toBe("fresh");
    expect(stalenessOf(10).staleness).toBe("recent");
    expect(stalenessOf(30).staleness).toBe("stale");
    expect(stalenessOf(120).staleness).toBe("very_stale");
  });

  it("filters by province through the known markets", async () => {
    const { prices } = await getPrices({ province: "Haut-Katanga" });
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.every((p) => p.province === "Haut-Katanga")).toBe(true);
  });

  it("parses an administrative CSV upload with French headers", () => {
    const csv = ["marche;produit;unite;prix;qualite;date", "Kolwezi — Marché central;maïs grain;sac de 50 kg;140000;courant;01/03/2026", "Kolwezi — Marché central;;kg;900;;"].join("\n");
    const parsed = parsePricesCsv(csv, "Test");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].priceCdf).toBe(140000);
    expect(parsed.rows[0].observedAt.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(parsed.errors).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------- weather & calendars */

describe("agriculture · weather and planting calendars", () => {
  it("has a centroid for every province", () => {
    for (const p of PROVINCES) expect(PROVINCE_CENTROIDS[p], p).toBeTruthy();
  });

  it("falls back to seasonal advice when offline", async () => {
    const w = await getWeather("Kwilu", { offline: true, date: new Date("2026-10-15T00:00:00Z") });
    expect(w.live).toBe(false);
    expect(w.source).toBe("saisonnier");
    expect(w.season.label).toContain("saison");
    expect(w.text).toContain("Kwilu");
    expect(w.notice).toBeTruthy();
  });

  it("renders a live forecast in plain language", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({
        daily: {
          time: ["2026-10-15", "2026-10-16", "2026-10-17"],
          precipitation_sum: [12, 0.2, 4],
          temperature_2m_max: [31, 32, 30],
          temperature_2m_min: [21, 21, 20],
          precipitation_probability_max: [80, 10, 40],
        },
      }),
    })) as unknown as typeof fetch;
    const w = await getWeather("Kongo-Central", { fetchImpl, date: new Date("2026-10-15T00:00:00Z") });
    expect(w.live).toBe(true);
    expect(w.rainNext3DaysMm).toBeCloseTo(16.2, 1);
    expect(w.dryDaysNext7).toBe(1);
    expect(w.text).toMatch(/Kongo-Central/);
    expect(w.fieldAdvice.length).toBeGreaterThan(0);
  });

  it("covers every province and crop in the planting calendar", () => {
    const rows = plantingCalendars();
    expect(rows).toHaveLength(PROVINCES.length * CALENDAR_CROPS.length);
    expect(rows.every((r) => r.sowWindows.length > 0)).toBe(true);
  });

  it("says whether the sowing window is open right now", () => {
    const advice = calendarAdvice("Kwilu", "maïs", new Date("2026-10-10T00:00:00Z"));
    expect(advice.openNow).toBe(true);
    expect(advice.text).toContain("Kwilu");
    const closed = calendarAdvice("Kwilu", "maïs", new Date("2026-07-10T00:00:00Z"));
    expect(closed.openNow).toBe(false);
  });

  it("derives the season deterministically from the date and the province", () => {
    expect(seasonFor("Haut-Katanga", new Date("2026-07-15T00:00:00Z")).code).toBe("saison_seche");
    expect(seasonFor("Haut-Katanga", new Date("2026-10-15T00:00:00Z")).code).toBe("saison_a");
    expect(seasonFor("Ituri", new Date("2026-01-15T00:00:00Z")).code).toBe("saison_seche");
    expect(normaliseProvince("kasai oriental")).toBe("Kasaï-Oriental");
  });
});

/* ---------------------------------------------------------------- chemical guard */

describe("agriculture · chemical guard (AGR-003)", () => {
  it("detects that a piece of advice is recommending a product", () => {
    expect(mentionsChemical("Ramassez les chenilles à la main.")).toHaveLength(0);
    expect(mentionsChemical("Achetez un insecticide au marché.").length).toBeGreaterThan(0);
    expect(mentionsChemical("Donnez un antibiotique aux chèvres.").length).toBeGreaterThan(0);
  });

  it("never fabricates a product: an unmatched recommendation is removed and replaced by a referral", async () => {
    const r = await guardChemicalAdvice(["Achetez un insecticide puissant au marché et traitez tout le champ.", "Ramassez les chenilles tôt le matin."], { crop: "maïs", issue: "chenille légionnaire d'automne" });
    expect(r.anyBlocked).toBe(true);
    expect(r.blocked[0].reason).toMatch(/registre|homologu/i);
    expect(r.referral).toBe(REFERRAL_TEXT);
    const kept = r.actions.map((a) => a.text).join(" ");
    expect(kept).toContain("Ramassez les chenilles");
    expect(kept).not.toContain("insecticide puissant");
    expect(r.actions.every((a) => !a.product)).toBe(true);
    expect(r.avoid.join(" ")).toMatch(/n'achetez aucun produit/i);
  });

  it("keeps an authorised product and attaches its label, PPE and pre-harvest interval", async () => {
    const r = await guardChemicalAdvice(["Pulvérisez de l'huile de neem en fin de journée sur les jeunes chenilles."], { crop: "maïs", issue: "chenille légionnaire d'automne" });
    expect(r.anyBlocked).toBe(false);
    const action = r.actions[0];
    expect(action.product?.name).toMatch(/neem/i);
    expect(action.text).toMatch(/Mode d'emploi homologué/);
    expect(action.text).toMatch(/Protection obligatoire/);
    expect(action.text).toMatch(/Délai avant récolte/);
  });

  it("blocks a banned product and warns explicitly", async () => {
    const r = await guardChemicalAdvice(["Utilisez de l'endosulfan sur le champ."], {});
    expect(r.anyBlocked).toBe(true);
    expect(r.blocked[0].reason).toMatch(/interdit/i);
    expect(r.avoid.join(" ")).toMatch(/interdit/i);
  });

  it("blocks a restricted veterinary product and sends it to a professional", async () => {
    const r = await guardChemicalAdvice(["Injectez de l'oxytétracycline à la vache."], { crop: "vache" });
    expect(r.anyBlocked).toBe(true);
    expect(r.blocked[0].reason).toMatch(/réservé/i);
    expect(r.avoid.join(" ")).toMatch(/vétérinaire/i);
  });

  it("only ever returns authorised entries from the registry search", async () => {
    const rows = await searchRegistry({});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.authorisationStatus === "authorised")).toBe(true);
    const all = await searchRegistry({ includeUnauthorised: true });
    expect(all.some((r) => r.authorisationStatus === "banned")).toBe(true);
  });

  it("seeds the reference tables only once", async () => {
    const db = await getDb();
    const before = await db.select().from(schema.inputRegistry);
    await ensureAgricultureReference();
    const after = await db.select().from(schema.inputRegistry);
    expect(after).toHaveLength(before.length);
  });
});
