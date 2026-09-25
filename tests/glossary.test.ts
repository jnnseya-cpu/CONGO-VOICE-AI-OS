import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { activeGlossary, applyGlossary, resetGlossaryCache, type GlossaryTerm } from "@server/ai/language/glossary";
import { GLOSSARY_SEED } from "@server/db/reference/glossary";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { seedReferenceData } from "@server/db/reference";

const DANGER: GlossaryTerm = {
  termFr: "signes de danger",
  translations: { ln: "bilembo ya likama" },
  variants: { ln: ["makambo ya mabe", "bilembo ya mabe"] },
  version: "1.0.0",
};

describe("terminology enforcement (FR-LG-05)", () => {
  it("rewrites a known wrong rendering to the approved one", () => {
    const out = applyGlossary(
      "Surveillez les signes de danger.",
      "Tala makambo ya mabe.",
      "ln",
      [DANGER],
    );
    expect(out.text).toBe("Tala bilembo ya likama.");
    expect(out.corrected).toEqual([{ termFr: "signes de danger", from: "makambo ya mabe", to: "bilembo ya likama" }]);
    expect(out.missing).toEqual([]);
    expect(out.versions).toEqual(["1.0.0"]);
  });

  it("leaves an answer alone when the approved term is already there", () => {
    const rendered = "Tala bilembo ya likama na mwana.";
    const out = applyGlossary("Surveillez les signes de danger.", rendered, "ln", [DANGER]);
    expect(out.text).toBe(rendered);
    expect(out.corrected).toEqual([]);
  });

  it("replaces a French term left untranslated", () => {
    const out = applyGlossary("Surveillez les signes de danger.", "Tala signes de danger.", "ln", [DANGER]);
    expect(out.text).toBe("Tala bilembo ya likama.");
  });

  it("records a term the renderer dropped instead of inventing one", () => {
    const out = applyGlossary("Surveillez les signes de danger.", "Kende na centre.", "ln", [DANGER]);
    expect(out.text).toBe("Kende na centre.");
    expect(out.missing).toEqual(["signes de danger"]);
  });

  it("never inserts vocabulary the answer did not use", () => {
    const out = applyGlossary("Donnez à boire souvent.", "Pesa mai mingi.", "ln", [DANGER]);
    expect(out.text).toBe("Pesa mai mingi.");
    expect(out.corrected).toEqual([]);
    expect(out.missing).toEqual([]);
  });

  it("does nothing for French, which is the language it reasons in", () => {
    const out = applyGlossary("Surveillez les signes de danger.", "Surveillez les signes de danger.", "fr", [DANGER]);
    expect(out.corrected).toEqual([]);
    expect(out.versions).toEqual([]);
  });

  it("matches a term whatever the accents and apostrophes", () => {
    const term: GlossaryTerm = { termFr: "consultation prénatale", translations: { sw: "kliniki ya ujauzito" }, variants: { sw: ["cpn"] }, version: "1.0.0" };
    const out = applyGlossary("Allez à la consultation prenatale.", "Nenda CPN.", "sw", [term]);
    expect(out.text).toBe("Nenda kliniki ya ujauzito.");
  });
});

describe("the seeded glossary", () => {
  beforeAll(async () => {
    resetDbForTests();
    resetGlossaryCache();
    await getDb();
    await seedReferenceData();
  }, 120_000);

  it("loads every seed term and holds them back from enforcement until approved", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.glossaries);
    expect(rows.length).toBe(GLOSSARY_SEED.length);
    // Nothing is enforced on a citizen's answer until a language panel signs it off.
    expect(rows.every((r) => r.status === "review")).toBe(true);
    expect(await activeGlossary("health")).toEqual([]);
  });

  it("enforces a term once it is made active", async () => {
    const db = await getDb();
    await db.update(schema.glossaries).set({ status: "active" }).where(eq(schema.glossaries.termFr, "signes de danger"));
    resetGlossaryCache();
    const terms = await activeGlossary("health");
    expect(terms.map((t) => t.termFr)).toContain("signes de danger");
    const out = applyGlossary("Surveillez les signes de danger.", "Tala makambo ya mabe.", "ln", terms);
    expect(out.text).toContain("bilembo ya likama");
  });

  it("covers every module and gives each term a reason to exist", () => {
    const modules = new Set(GLOSSARY_SEED.map((g) => g.module));
    expect([...modules].sort()).toEqual(["agriculture", "education", "general", "health"]);
    for (const g of GLOSSARY_SEED) {
      expect(g.notes.length, g.termFr).toBeGreaterThan(30);
      expect(Object.keys(g.translations).length, g.termFr).toBeGreaterThan(0);
    }
  });
});
