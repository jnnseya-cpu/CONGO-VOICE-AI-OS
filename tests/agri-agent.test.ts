import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { AiGateway } from "@/lib/ai/gateway";
import { assessAgriculture, matchNotifiable, notifiableList, detectZoonoticSigns, CANDIDATE_CONFIDENT_THRESHOLD } from "@/lib/ai/agents/agriculture";
import { ensureAgricultureReference } from "@/lib/db/reference/agriculture";
import { searchKnowledge } from "@/lib/ai/knowledge";
import { searchRegistry } from "@/lib/ai/tools/input-registry";

function jpeg(width: number, height: number, bytes: number): Buffer {
  const head: number[] = [0xff, 0xd8];
  head.push(0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03, ...new Array(9).fill(0));
  head.push(0xff, 0xda, 0x00, 0x0c, ...new Array(10).fill(0));
  const filler = Buffer.alloc(Math.max(0, bytes - head.length - 2), 0x7f);
  return Buffer.concat([Buffer.from(head), filler, Buffer.from([0xff, 0xd9])]);
}

const GOOD_PHOTO = { data: jpeg(1600, 1200, Math.round(1600 * 1200 * 0.2)), mimeType: "image/jpeg" };
const BAD_PHOTO = { data: jpeg(1600, 1200, 12000), mimeType: "image/jpeg" };

describe("agriculture agent (offline provider)", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    await ensureAgricultureReference();
  });

  it("extracts farm context, season and ranked candidates with evidence for and against", async () => {
    const a = await assessAgriculture(
      "Les feuilles de mon manioc jaunissent et se déforment depuis deux semaines, quelques plants sont touchés",
      { province: "Kwilu", date: new Date("2026-10-10T00:00:00Z"), territory: "Bulungu" },
      [],
    );
    expect(a.farmContext.cropOrAnimal).toBe("manioc");
    expect(a.season).toContain("saison");
    expect(a.seasonCode).toBe("saison_a");
    expect(a.territory).toBe("Bulungu");
    expect(a.candidates.length).toBeGreaterThan(0);
    expect(a.candidates.length).toBeLessThanOrEqual(3);
    expect(a.candidates[0].evidenceFor.length).toBeGreaterThan(0);
    expect(a.candidates[0].evidenceAgainst.length).toBeGreaterThan(0);
    // Ranked, highest first.
    for (let i = 1; i < a.candidates.length; i++) expect(a.candidates[i - 1].probability).toBeGreaterThanOrEqual(a.candidates[i].probability);
    expect(a.topProb).toBe(a.candidates[0].probability);
  });

  it("stays a 'possible match' below the confidence threshold and asks for a second photo", async () => {
    const a = await assessAgriculture("Les feuilles de mon manioc jaunissent", { province: "Kwilu" }, []);
    expect(a.topProb).toBeLessThan(CANDIDATE_CONFIDENT_THRESHOLD);
    expect(a.confident).toBe(false);
    expect(a.candidates[0].wording).toMatch(/correspondance possible/i);
    expect(a.likelyDiagnosis).toMatch(/correspondance possible/i);
    expect(a.secondPhotoRequested).toBe(true);
    expect(a.missingEvidence.join(" ")).toMatch(/photo/i);
    expect(a.recommendation).toMatch(/pas encore une confirmation/i);
  });

  it("tiers the recommendations and lists actions to avoid", async () => {
    const a = await assessAgriculture("Il y a des chenilles dans le cornet de mon maïs, plusieurs plants sont troués", { province: "Kwilu" }, []);
    expect(a.tieredActions.noCost.length).toBeGreaterThan(0);
    expect(a.tieredActions.lowCost.length).toBeGreaterThan(0);
    expect(a.actionsToAvoid.length).toBeGreaterThan(0);
    expect(a.followUpCapture).toBeTruthy();
    expect(a.recommendation).toMatch(/sans dépense/i);
    expect(a.recommendation).toMatch(/Suivi :/);
  });

  it("never fabricates a product: an unverified chemical recommendation becomes a referral (AGR-003)", async () => {
    const a = await assessAgriculture("Il y a des chenilles dans le cornet de mon maïs, plusieurs plants sont troués", { province: "Kwilu" }, []);
    // The offline model proposes buying an insecticide; nothing in the registry matches it.
    expect(a.chemicalGuard.blocked.length).toBeGreaterThan(0);
    // Anything kept must be a real, authorised registry entry — never an invented product.
    const authorised = await searchRegistry({});
    for (const name of a.chemicalGuard.products) expect(authorised.map((r) => r.name)).toContain(name);
    expect(a.chemicalGuard.products).not.toContain("insecticide puissant");
    expect(a.chemicalGuard.referral).toMatch(/registre officiel/i);
    expect(a.tieredActions.purchase.join(" ")).toMatch(/agent agricole|vétérinaire/i);
    expect(a.tieredActions.purchase.join(" ")).not.toMatch(/insecticide homologué adapté/);
    expect(a.extensionReferral.required).toBe(true);
    expect(a.extensionReferral.reasons.join(" ")).toMatch(/homologuée vérifiée/i);
  });

  it("spends no vision call on an unusable photo and answers with recapture guidance (AGR-002)", async () => {
    const spy = vi.spyOn(AiGateway.prototype, "generateJson");
    try {
      const a = await assessAgriculture("Regardez cette feuille de manioc", { province: "Kwilu" }, [BAD_PHOTO]);
      const call = spy.mock.calls.find((c) => c[0].schemaName === "agriculture_field_assessment");
      expect(call).toBeTruthy();
      expect(call?.[0].images ?? []).toHaveLength(0); // no vision call was paid for
      expect(a.evidenceQuality.visionUsed).toBe(false);
      expect(a.evidenceQuality.attachments).toBe(1);
      expect(a.evidenceQuality.usable).toBe(0);
      expect(a.evidenceQuality.recaptureGuidance).toMatch(/lumière du jour/i);
      expect(a.recommendation).toMatch(/lumière du jour/i);
    } finally {
      spy.mockRestore();
    }
  });

  it("sends a usable photo to the vision path", async () => {
    const spy = vi.spyOn(AiGateway.prototype, "generateJson");
    try {
      const a = await assessAgriculture("Regardez cette feuille de manioc jaunie", { province: "Kwilu" }, [GOOD_PHOTO]);
      const call = spy.mock.calls.find((c) => c[0].schemaName === "agriculture_field_assessment");
      expect(call?.[0].images ?? []).toHaveLength(1);
      expect(a.evidenceQuality.visionUsed).toBe(true);
      expect(a.evidenceQuality.exifNotes.join(" ")).toMatch(/EXIF/);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps a video as evidence only", async () => {
    const a = await assessAgriculture("Voici une vidéo de mes poules", { province: "Équateur" }, [{ data: Buffer.alloc(4000), mimeType: "video/mp4" }]);
    expect(a.evidenceQuality.visionUsed).toBe(false);
    expect(a.evidenceQuality.videoOnly).toBe(true);
    expect(a.recommendation).toMatch(/vidéo est conservée comme preuve/i);
  });

  it("flags a notifiable disease, alerts the extension network and records the event", async () => {
    const db = await getDb();
    await db.insert(schema.users).values({ isAnonymous: false, role: "agri_officer", languagePreference: "fr", province: "Équateur", phone: "+243900111222" });
    const a = await assessAgriculture("Mes poules meurent une par une, elles ont le cou tordu, c'est la maladie de Newcastle je crois", { province: "Équateur" }, []);
    expect(a.isNotifiable).toBe(true);
    expect(a.notifiable.map((n) => n.key)).toContain("newcastle");
    expect(a.urgent).toBe(true);
    expect(a.severity === "high" || a.severity === "critical").toBe(true);
    expect(a.extensionReferral.required).toBe(true);
    const notifications = await db.select().from(schema.notifications);
    expect(notifications.some((n) => n.title.includes("Newcastle"))).toBe(true);
    const events = await db.select().from(schema.eventStore);
    expect(events.some((e) => e.eventType === "agri.notifiable.detected" || e.eventType === "agri.zoonotic.flagged")).toBe(true);
  });

  it("escalates a zoonotic red flag from a livestock intake", async () => {
    const a = await assessAgriculture("Mes chèvres meurent brutalement et il y a eu des avortements, nous avons mangé la viande d'une bête morte", { province: "Kasaï" }, []);
    expect(a.zoonotic.flagged).toBe(true);
    expect(a.zoonotic.signs.length).toBeGreaterThan(0);
    expect(a.severity).toBe("critical");
    expect(a.recommendation).toMatch(/peuvent aussi toucher les personnes/i);
  });

  it("cites at least one approved knowledge document in every recommendation (FR-AG-09)", async () => {
    for (const message of [
      "Les feuilles de mon manioc jaunissent et se déforment",
      "Il y a des chenilles dans le cornet de mon maïs",
      "Mes poules meurent une par une avec le cou tordu",
      "Quel est le bon moment pour planter le maïs ?",
      "Comment conserver mon maïs après la récolte ?",
    ]) {
      const a = await assessAgriculture(message, { province: "Kwilu" }, []);
      expect(a.citations.length, message).toBeGreaterThan(0);
      expect(a.citations[0], message).toMatch(/^KB-AG-/);
      expect(a.recommendation).toContain("Sources :");
    }
  });

  it("answers a market price question with dated, sourced quotes", async () => {
    const a = await assessAgriculture("Quel est le prix du maïs au marché en ce moment ?", { province: "Haut-Katanga" }, []);
    expect(a.issueType).toBe("market_price");
    expect(a.prices?.length).toBeGreaterThan(0);
    expect(a.recommendation).toMatch(/n'est pas une offre/i);
  });

  it("answers a planting question with the province calendar and the weather fallback", async () => {
    const a = await assessAgriculture("Quand dois-je planter le maïs cette saison ?", { province: "Kwilu", date: new Date("2026-10-10T00:00:00Z") }, []);
    expect(a.issueType).toBe("planting_calendar");
    expect(a.calendar?.crop).toBe("maïs");
    expect(a.weather).toBeTruthy();
    expect(a.recommendation).toContain("Kwilu");
  });

  it("reads the notifiable list from admin_config when it is configured", async () => {
    const db = await getDb();
    await db.insert(schema.adminConfig).values({
      key: "agri.notifiable",
      value: [{ key: "test_disease", label: "Maladie de test", kind: "crop", keywords: ["maladie de test"] }],
    });
    const list = await notifiableList();
    expect(list).toHaveLength(1);
    expect(matchNotifiable(list, ["nous avons la maladie de test au village"])).toHaveLength(1);
    expect(matchNotifiable(list, ["chenille légionnaire"])).toHaveLength(0);
    await db.delete(schema.adminConfig);
  });

  it("detects zoonotic terms deterministically", () => {
    expect(detectZoonoticSigns("le chien a mordu l'enfant, on parle de rage", [])).toContain("rage");
    expect(detectZoonoticSigns("les feuilles jaunissent", [])).toHaveLength(0);
  });

  it("keeps the agriculture knowledge base complete and approved", async () => {
    const hits = await searchKnowledge("agriculture", "manioc mosaïque striure chenille stockage newcastle", 10);
    expect(hits.length).toBeGreaterThan(0);
    const db = await getDb();
    const docs = await db.select().from(schema.kbDocuments);
    const agri = docs.filter((d) => d.module === "agriculture");
    expect(agri.length).toBeGreaterThanOrEqual(10);
    expect(agri.every((d) => d.status === "approved")).toBe(true);
    expect(agri.every((d) => d.docId.startsWith("KB-AG-"))).toBe(true);
    expect(agri.every((d) => !!d.authority)).toBe(true);
  });
});
