/**
 * What a visitor with no account is allowed to see.
 *
 * The home page's activity feed was built from each interaction's
 * `understanding`, and rendered for everyone. An anonymous request to the front
 * page of the deployed site returned, in full:
 *
 *   "Cas escaladé : Mon enfant de 3 ans a de la fièvre depuis deux jours et il
 *    ne veut…"
 *
 * That is a caregiver's account of their sick child, published to anybody who
 * loaded the page, by a service whose entire proposition is that it is safe to
 * tell it something private.
 *
 * These tests hold the boundary at the data layer, which is where it can be held
 * without depending on a rendered page: the public row carries a category and a
 * time, and the institutional row carries the text, and the two are different
 * functions rather than the same function with a flag.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { publicActivityRow, publicHomeSnapshot, recentActivity } from "@server/ai/agents/reporting";

const COMPLAINT = "Mon enfant de 3 ans a de la fièvre depuis deux jours et il ne veut pas boire";

describe("the public activity feed", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    await db.insert(schema.interactions).values({
      module: "health",
      status: "completed",
      channel: "pwa",
      province: "Kinshasa",
      originalInput: COMPLAINT,
      transcript: COMPLAINT,
      understanding: `La personne signale : ${COMPLAINT}`,
      summary: `[santé] fièvre — risque critique. ${COMPLAINT}`,
      intent: "health_fever",
      escalationRequired: true,
      severity: "critical",
    });
  });

  it("carries none of the citizen's words", async () => {
    const rows = await recentActivity(5);
    expect(rows).toHaveLength(1);
    const publicRow = publicActivityRow(rows[0]);
    const serialised = JSON.stringify(publicRow);
    expect(serialised).not.toContain("fièvre");
    expect(serialised).not.toContain("enfant");
    expect(serialised).not.toContain("boire");
    expect(serialised).not.toContain("La personne signale");
  });

  it("still tells a visitor the service is being used", async () => {
    const rows = await recentActivity(5);
    const publicRow = publicActivityRow(rows[0]);
    expect(publicRow.title).toBe("Consultation santé — orientée vers un agent");
    expect(publicRow.module).toBe("health");
    expect(publicRow.province).toBe("Kinshasa");
    expect(publicRow.createdAt).toBeInstanceOf(Date);
  });

  it("labels an ordinary turn by category alone", async () => {
    const row = publicActivityRow({ id: "x", module: "agriculture", channel: "pwa", province: "Kasaï", escalated: false, createdAt: new Date() });
    expect(row.title).toBe("Question agricole");
  });

  it("keeps the institutional view intact, because a worker needs the text", async () => {
    const rows = await recentActivity(5);
    // The same query a case worker's dashboard uses still returns the words.
    expect(rows[0].understanding).toContain("fièvre");
  });

  it("exposes nothing personal through the cached public snapshot", async () => {
    const snapshot = await publicHomeSnapshot();
    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain("fièvre");
    expect(serialised).not.toContain("La personne signale");
    // The aggregate counts a visitor legitimately sees are still there.
    expect(snapshot.stats).not.toBeNull();
    expect(snapshot.rows.length).toBeGreaterThan(0);
  });
});

describe("the snapshot is computed once, not per visitor", () => {
  it("returns the same object within its window", async () => {
    const a = await publicHomeSnapshot();
    const b = await publicHomeSnapshot();
    // Identity, not equality: a second visitor must not cost a second set of
    // database aggregates.
    expect(b).toBe(a);
  });
});
