import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession, hashPin, verifyPin } from "@server/core/auth";
import { escalationRoleFor, hasPermission, moduleScopeFor, ROLE_PERMISSIONS } from "@server/core/rbac";
import { checkRateLimit, resetRateLimits } from "@server/core/rate-limit";
import { scoreRisk } from "@server/ai/agents/risk";
import { detectEmergencyTerms, sanitiseHealthGuidance } from "@server/ai/safety";
import { chunkText, parseFrontMatter } from "@server/ai/knowledge";

describe("sessions", () => {
  it("round-trips a signed session and rejects tampering", () => {
    const token = encodeSession({ userId: "u1", role: "chw", language: "ln", anonymous: false });
    const s = decodeSession(token);
    expect(s?.userId).toBe("u1");
    expect(s?.role).toBe("chw");
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), role: "platform_admin" })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toBeNull();
    expect(decodeSession("garbage")).toBeNull();
  });
  it("hashes and verifies PINs with scrypt", () => {
    const h = hashPin("1234");
    expect(verifyPin("1234", h)).toBe(true);
    expect(verifyPin("0000", h)).toBe(false);
    expect(verifyPin("1234", null)).toBe(false);
  });
});

describe("rbac", () => {
  it("scopes field officers to their module and keeps citizens out of dashboards", () => {
    expect(hasPermission("citizen", "interaction:create")).toBe(true);
    expect(hasPermission("citizen", "dashboard:gov")).toBe(false);
    expect(hasPermission("chw", "case:escalate")).toBe(true);
    expect(hasPermission("chw", "dashboard:agri")).toBe(false);
    expect(moduleScopeFor("chw")).toEqual(["health"]);
    expect(moduleScopeFor("gov_admin")).toBeNull();
    expect(escalationRoleFor("agriculture")).toBe("agri_officer");
    expect(hasPermission("platform_admin", "admin:config")).toBe(true);
    for (const perms of Object.values(ROLE_PERMISSIONS)) expect(perms).toContain("interaction:create");
  });
});

describe("rate limiter", () => {
  it("blocks after the window quota and recovers", () => {
    resetRateLimits();
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(checkRateLimit("k", 3, 60, now).allowed).toBe(true);
    expect(checkRateLimit("k", 3, 60, now + 10).allowed).toBe(false);
    expect(checkRateLimit("k", 3, 60, now + 61_000).allowed).toBe(true);
  });
});

describe("risk agent (deterministic)", () => {
  const base = { languageConfidence: 0.9, domainConfidence: 0.8 };
  it("escalates critical health and never below medium when uncertain", () => {
    const r = scoreRisk({ module: "health", ...base, health: { understanding: "", symptoms: [], ageGroup: "child", pregnancyStatus: "unknown", topic: "fever_malaria", emergencyFlags: ["convulsions"], severity: "critical", guidance: "", clinicReferral: "immediately", followUpQuestions: [], confidence: 0.8 } });
    expect(r.level).toBe("critical");
    expect(r.escalationRequired).toBe(true);
    const low = scoreRisk({ module: "health", languageConfidence: 0.3, domainConfidence: 0.4, health: { understanding: "", symptoms: [], ageGroup: "adult", pregnancyStatus: "unknown", topic: "other", emergencyFlags: [], severity: "low", guidance: "", clinicReferral: "none", followUpQuestions: [], confidence: 0.4 } });
    expect(low.lowConfidence).toBe(true);
    expect(low.level).not.toBe("low");
  });
  it("marks urgent agriculture as high risk and education as low", () => {
    const a = scoreRisk({ module: "agriculture", ...base, agriculture: { understanding: "", cropType: "manioc", issueType: "crop_disease", likelyDiagnosis: "", urgent: true, severity: "medium", recommendation: "", lowCostInterventions: [], followUpQuestions: [], confidence: 0.7 } });
    expect(a.level === "high" || a.level === "critical").toBe(true);
    const e = scoreRisk({ module: "education", ...base, education: { understanding: "", learnerAgeGroup: "10-12", subject: "maths", topic: "fractions", difficultyLevel: "beginner", explanation: "", quiz: [], studyAction: "", learningDifficulty: "none", followUpQuestions: [], confidence: 0.8 } });
    expect(e.level).toBe("low");
    expect(e.escalationRequired).toBe(false);
  });
});

describe("safety", () => {
  it("detects danger signs across languages and strips dosing statements", () => {
    expect(detectEmergencyTerms("Mwana azali na convulsions").length).toBeGreaterThan(0);
    expect(detectEmergencyTerms("mtoto hapumui vizuri")).toContain("hapumui");
    const s = sanitiseHealthGuidance("Donnez à boire souvent. Prenez 500 mg de paracétamol toutes les 4 heures. Consultez le centre de santé.");
    expect(s.ok).toBe(false);
    expect(s.sanitised).not.toMatch(/500 mg/);
    expect(s.sanitised).toMatch(/Consultez/);
  });
});

describe("knowledge documents", () => {
  it("parses front matter and chunks text", () => {
    const { meta, body } = parseFrontMatter("---\ndocId: KB-TEST-01\nmodule: health\ntitle: Test\nauthority: Test authority\n---\nParagraphe un.\n\nParagraphe deux.");
    expect(meta.docId).toBe("KB-TEST-01");
    expect(body).toContain("Paragraphe deux");
    expect(chunkText("a\n\nb\n\nc", 3).length).toBeGreaterThan(1);
  });
});
