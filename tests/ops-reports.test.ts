import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import {
  REPORT_CATALOGUE,
  REPORT_TYPES,
  SUPPRESSION_THRESHOLD,
  buildReport,
  createReportJob,
  expireReports,
  generateReport,
  getReportFile,
  isDefinitionDue,
  periodFor,
  runDueReportDefinitions,
  runReportJob,
  suppress,
} from "@server/reports";

describe("report engine", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ role: "gov_admin", name: "Direction", phone: "+243830000001", province: "Kinshasa" }).returning();
    // A little data so the reports are not empty.
    for (let i = 0; i < 6; i++) {
      const [interaction] = await db
        .insert(schema.interactions)
        .values({ userId: user.id, module: i % 2 ? "health" : "agriculture", channel: i % 3 ? "text" : "voice", language: "fr", province: "Kinshasa", status: "completed", confidence: 0.8, latencyMs: 900 })
        .returning();
      if (i % 2) {
        await db.insert(schema.healthTriageRecords).values({ interactionId: interaction.id, topic: "fever_malaria", province: "Kinshasa", riskBand: "urgent", referralStatus: "referred" });
      } else {
        await db.insert(schema.agricultureReports).values({ interactionId: interaction.id, cropType: "manioc", issueType: "crop_disease", province: "Kinshasa", urgent: i === 0 });
      }
    }
    await db.insert(schema.acuLedger).values({ task: "llm", providerKey: "mock", units: 1000, acu: 1, module: "health", language: "fr" });
  });

  it("suppresses small numbers before publication", () => {
    expect(suppress(0)).toBe(0);
    expect(suppress(SUPPRESSION_THRESHOLD - 1)).toBe(`<${SUPPRESSION_THRESHOLD}`);
    expect(suppress(SUPPRESSION_THRESHOLD)).toBe(SUPPRESSION_THRESHOLD);
    expect(suppress(null)).toBe("—");
  });

  it("builds every catalogued report with definitions, denominators and freshness", async () => {
    for (const type of REPORT_TYPES) {
      const doc = await buildReport(type, { period: periodFor(type), scope: {} });
      expect(doc.title).toBe(REPORT_CATALOGUE[type].name);
      expect(doc.programme).toBe("CONGO VOICE AI OS");
      expect(doc.definitions.length).toBeGreaterThan(0);
      expect(doc.denominators.length).toBeGreaterThan(0);
      expect(doc.suppressionNote).toContain("suppression");
      expect(doc.sections.length).toBeGreaterThan(0);
      expect(doc.summary.length).toBeGreaterThan(0);
    }
  });

  it("produces a PDF with the branded template", async () => {
    const job = await generateReport({ type: "weekly_health_trends", format: "pdf", purpose: "test" });
    expect(job?.status).toBe("ready");
    const { file } = await getReportFile(job!.id);
    expect(file).not.toBeNull();
    expect(file!.mimeType).toBe("application/pdf");
    expect(file!.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(file!.sizeBytes).toBeGreaterThan(1000);
    expect(file!.filename).toMatch(/\.pdf$/);
    const text = file!.buffer.toString("latin1");
    expect(text).toContain("/Title");
  });

  it("produces an XLSX workbook", async () => {
    const job = await generateReport({ type: "monthly_regional_activity", format: "xlsx", purpose: "test" });
    expect(job?.status).toBe("ready");
    const { file } = await getReportFile(job!.id);
    expect(file!.mimeType).toContain("spreadsheetml");
    // Every OOXML package is a ZIP archive: "PK\x03\x04".
    expect(file!.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(file!.filename).toMatch(/\.xlsx$/);
  });

  it("produces a CSV that opens in Excel and carries the governance header", async () => {
    const job = await generateReport({ type: "daily_usage", format: "csv", purpose: "test" });
    const { file } = await getReportFile(job!.id);
    const text = file!.buffer.toString("utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff); // byte-order mark
    expect(text).toContain("CONGO VOICE AI OS");
    expect(text).toContain("Fraîcheur des données");
    expect(text).toContain("Définitions");
    expect(text).toContain("Dénominateurs");
  });

  it("queues a job, runs it once, and stamps a seven-day expiry", async () => {
    const db = await getDb();
    const job = await createReportJob({ type: "monthly_cost_usage", format: "csv", purpose: "test" });
    expect(job.status).toBe("queued");
    const ready = await runReportJob(job.id);
    expect(ready?.status).toBe("ready");
    const days = ((ready!.expiresAt as Date).getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    // Running again is a no-op, not a second file.
    const again = await runReportJob(job.id);
    expect(again?.storageKey).toBe(ready?.storageKey);

    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, job.id));
    expect(audits.map((a) => a.action)).toContain("report.requested");
    expect(audits.map((a) => a.action)).toContain("report.generated");
    expect(audits.find((a) => a.action === "report.requested")?.purpose).toBe("test");
  });

  it("refuses an expired download and cleans up the stored file", async () => {
    const db = await getDb();
    const job = await generateReport({ type: "daily_usage", format: "csv", purpose: "test" });
    await db.update(schema.reports).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.reports.id, job!.id));
    const { file, reason } = await getReportFile(job!.id);
    expect(file).toBeNull();
    expect(reason).toBe("expired");
    expect(await expireReports()).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(schema.reports).where(eq(schema.reports.id, job!.id));
    expect(after.storageKey).toBeNull();
    expect(after.error).toBe("expired");
  });

  it("runs a scheduled definition and notifies its recipients", async () => {
    const db = await getDb();
    const [recipient] = await db.select().from(schema.users).where(eq(schema.users.role, "gov_admin"));
    const [def] = await db
      .insert(schema.reportDefinitions)
      .values({ name: "Tendances santé hebdomadaires — Kinshasa", type: "weekly_health_trends", format: "csv", cadence: "weekly", scope: { province: "Kinshasa" }, recipients: [recipient.id], createdBy: recipient.id })
      .returning();

    expect(isDefinitionDue("weekly", null)).toBe(true);
    expect(isDefinitionDue("weekly", new Date())).toBe(false);

    const produced = await runDueReportDefinitions();
    expect(produced.some((p) => p?.definitionId === def.id)).toBe(true);
    const [refreshed] = await db.select().from(schema.reportDefinitions).where(eq(schema.reportDefinitions.id, def.id));
    expect(refreshed.lastRunAt).not.toBeNull();

    const notifications = await db.select().from(schema.notifications).where(eq(schema.notifications.templateKey, "report.ready"));
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    // Not due again straight away.
    const second = await runDueReportDefinitions();
    expect(second.some((p) => p?.definitionId === def.id)).toBe(false);
  });

  it("records a failure instead of throwing when a job cannot be built", async () => {
    const db = await getDb();
    const [broken] = await db.insert(schema.reports).values({ type: "unknown_report", format: "csv", status: "queued", scope: {} }).returning();
    const result = await runReportJob(broken.id);
    expect(result?.status).toBe("failed");
    expect(result?.error).toBeTruthy();
  });
});
