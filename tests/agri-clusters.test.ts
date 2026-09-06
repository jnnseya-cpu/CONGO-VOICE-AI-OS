import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { canTransition, clusterConfig, CLUSTER_DEFAULTS, detectClusters, listClusters, publishCluster, validateCluster } from "@server/ai/agents/clusters";

const DAY = 24 * 3600 * 1000;

async function seedReports(count: number, opts: { issue?: string; crop?: string; province?: string; territory?: string | null; daysAgo?: number } = {}) {
  const db = await getDb();
  const [interaction] = await db.insert(schema.interactions).values({ module: "agriculture", channel: "text", status: "completed" }).returning();
  for (let i = 0; i < count; i++) {
    await db.insert(schema.agricultureReports).values({
      interactionId: interaction.id,
      cropType: opts.crop ?? "maïs",
      issueType: "pest",
      province: opts.province ?? "Kwilu",
      territory: opts.territory === undefined ? "Bulungu" : opts.territory,
      candidates: [{ label: opts.issue ?? "Chenille légionnaire d'automne", prob: 0.62 }],
      createdAt: new Date(Date.now() - (opts.daysAgo ?? 1) * DAY),
    });
  }
}

describe("agriculture · cluster detection (FR-AG-08)", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(schema.agriClusters);
    await db.delete(schema.agricultureReports);
    await db.delete(schema.adminConfig);
    await db.delete(schema.notifications);
  });

  it("uses the documented defaults", async () => {
    expect(CLUSTER_DEFAULTS).toEqual({ threshold: 5, windowDays: 14, privacyMin: 5 });
    expect(await clusterConfig()).toEqual({ threshold: 5, windowDays: 14, privacyMin: 5 });
  });

  it("does not open a cluster below the threshold", async () => {
    await seedReports(4);
    const r = await detectClusters();
    expect(r.created).toHaveLength(0);
    const { clusters } = await listClusters();
    expect(clusters).toHaveLength(0);
  });

  it("opens an unverified cluster at the threshold, emits the event and alerts the officers", async () => {
    const db = await getDb();
    await db.insert(schema.users).values({ isAnonymous: false, role: "agri_officer", languagePreference: "fr", province: "Kwilu", phone: "+243900333444" });
    await seedReports(5);
    const r = await detectClusters();
    expect(r.created).toHaveLength(1);
    const cluster = r.created[0];
    expect(cluster.status).toBe("unverified");
    expect(cluster.reportCount).toBe(5);
    expect(cluster.issue).toBe("Chenille légionnaire d'automne");
    expect(cluster.territory).toBe("Bulungu");

    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.eventType, "agri.cluster.detected"));
    expect(events).toHaveLength(1);
    const notifications = await db.select().from(schema.notifications);
    expect(notifications.some((n) => n.title.includes("Signalements groupés"))).toBe(true);
  });

  it("refreshes an existing cluster instead of opening a second one", async () => {
    await seedReports(5);
    await detectClusters();
    await seedReports(2);
    const second = await detectClusters();
    expect(second.created).toHaveLength(0);
    expect(second.updated).toHaveLength(1);
    expect(second.updated[0].reportCount).toBe(7);
  });

  it("ignores reports outside the rolling window", async () => {
    await seedReports(5, { daysAgo: 40 });
    const r = await detectClusters();
    expect(r.created).toHaveLength(0);
  });

  it("groups at province level when no territory is known", async () => {
    await seedReports(5, { territory: null, province: "Kasaï" });
    const r = await detectClusters();
    expect(r.created).toHaveLength(1);
    expect(r.created[0].territory).toBeNull();
    expect(r.created[0].province).toBe("Kasaï");
  });

  it("suppresses the precise location when a cluster is below the privacy threshold", async () => {
    const db = await getDb();
    await db.insert(schema.adminConfig).values({ key: "agri.cluster", value: { threshold: 3, windowDays: 14, privacyMin: 5 } });
    await seedReports(3);
    const r = await detectClusters();
    expect(r.created).toHaveLength(1);
    const { clusters, config } = await listClusters();
    expect(config.threshold).toBe(3);
    expect(clusters[0].suppressed).toBe(true);
    expect(clusters[0].territory).toBeNull();
    expect(clusters[0].reportCount).toBe(5); // never publishes a count below the privacy floor
    expect(clusters[0].note).toMatch(/masqué/i);
  });

  it("publishes the precise location once the privacy threshold is met", async () => {
    await seedReports(6);
    await detectClusters();
    const { clusters } = await listClusters();
    expect(clusters[0].suppressed).toBe(false);
    expect(clusters[0].territory).toBe("Bulungu");
    expect(clusters[0].reportCount).toBe(6);
  });

  it("only allows the documented validation transitions", async () => {
    expect(canTransition("unverified", "under_review")).toBe(true);
    expect(canTransition("unverified", "confirmed")).toBe(false);
    expect(canTransition("under_review", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "closed")).toBe(true);
    expect(canTransition("closed", "under_review")).toBe(false);
  });

  it("walks a cluster through validation and records each step as an event", async () => {
    const db = await getDb();
    const [officer] = await db.insert(schema.users).values({ isAnonymous: false, role: "agri_officer", languagePreference: "fr", province: "Kwilu" }).returning();
    await seedReports(5);
    const created = (await detectClusters()).created[0];
    const actor = { userId: officer.id, role: "agri_officer" };

    const bad = await validateCluster(created.id, "confirmed", actor);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Transition non autorisée/);

    const review = await validateCluster(created.id, "under_review", actor);
    expect(review.ok).toBe(true);
    expect(review.cluster?.status).toBe("under_review");
    expect(review.cluster?.validatedBy).toBe(officer.id);

    const confirmed = await validateCluster(created.id, "confirmed", actor, "Visite de terrain effectuée");
    expect(confirmed.ok).toBe(true);
    const closed = await validateCluster(created.id, "closed", actor);
    expect(closed.ok).toBe(true);
    expect(closed.cluster?.status).toBe("closed");

    const events = await db.select().from(schema.eventStore).where(eq(schema.eventStore.eventType, "agri.cluster.validated"));
    expect(events).toHaveLength(3);

    const missing = await validateCluster("00000000-0000-0000-0000-000000000000", "under_review", actor);
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/introuvable/);
  });

  it("keeps different issues and crops in separate clusters", async () => {
    await seedReports(5, { issue: "Chenille légionnaire d'automne", crop: "maïs" });
    await seedReports(5, { issue: "Mosaïque africaine du manioc", crop: "manioc" });
    const r = await detectClusters();
    expect(r.created).toHaveLength(2);
  });

  it("never publishes a new cluster as a confirmed outbreak", async () => {
    await seedReports(5);
    const r = await detectClusters();
    const published = publishCluster(r.created[0], await clusterConfig());
    expect(published.status).toBe("unverified");
  });
});
