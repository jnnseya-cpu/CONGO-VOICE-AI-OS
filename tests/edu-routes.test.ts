/**
 * Education route smoke tests: the real handlers, with real sessions.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { encodeSession } from "@server/core/auth";
import type { Role } from "@server/db/schema";

const BASE = "http://localhost:3000";
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

function req(method: string, path: string, opts: { body?: unknown; as?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.as) headers.set("authorization", `Bearer ${tokens[opts.as]}`);
  return new NextRequest(`${BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
const json = async (res: Response) => (await res.json()) as Record<string, never>;

async function makeUser(role: Role, phone: string) {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ role, phone, languagePreference: "fr", province: "Kinshasa" }).returning();
  tokens[role] = encodeSession({ userId: u.id, role, language: "fr", province: "Kinshasa", anonymous: false });
  ids[role] = u.id;
  return u;
}

describe("education routes", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
    await makeUser("citizen", "+243880000001");
    await makeUser("teacher", "+243880000002");
  });

  it("reads and confirms the learner profile", async () => {
    const { GET, PUT } = await import("@/app/api/v1/education/profile/route");
    expect((await GET(req("GET", "/api/v1/education/profile"))).status).toBe(401);

    const empty = (await json(await GET(req("GET", "/api/v1/education/profile", { as: "citizen" })))) as unknown as { profile: null; confirmationQuestions: string[] };
    expect(empty.profile).toBeNull();
    expect(empty.confirmationQuestions.length).toBeGreaterThan(0);

    const put = await PUT(req("PUT", "/api/v1/education/profile", { body: { ageBand: "9-11", level: "primaire_4", explainLanguage: "ln", examTarget: "tenafep" }, as: "citizen" }));
    expect(put.status).toBe(200);
    const saved = (await json(put)) as unknown as { profile: { level: string; explainLanguage: string; confirmed: boolean } };
    expect(saved.profile.level).toBe("primaire_4");
    expect(saved.profile.explainLanguage).toBe("ln");
    expect(saved.profile.confirmed).toBe(true);

    expect((await PUT(req("PUT", "/api/v1/education/profile", { body: { level: "universite" }, as: "citizen" }))).status).toBe(400);
    const db = await getDb();
    expect((await db.select().from(schema.learnerProfiles)).length).toBe(1);
  });

  it("runs a quiz end to end and never returns the expected answers", async () => {
    const { POST: create } = await import("@/app/api/v1/education/quiz/route");
    const res = await create(req("POST", "/api/v1/education/quiz", { body: { topic: "les fractions" }, as: "citizen" }));
    expect(res.status).toBe(200);
    const quiz = (await json(res)) as unknown as { quizId: string; questions: Array<{ id: string; prompt: string }>; citations: string[] };
    expect(quiz.questions).toHaveLength(5);
    expect(JSON.stringify(quiz)).not.toContain("expectedAnswer");
    expect(quiz.citations[0]).toMatch(/^KB-ED-/);

    const { POST: answer } = await import("@/app/api/v1/education/quiz/[id]/answer/route");
    const wrong = await answer(req("POST", `/api/v1/education/quiz/${quiz.quizId}/answer`, { body: { questionId: "q1", answer: "4/1" }, as: "citizen" }), params({ id: quiz.quizId }));
    const wrongBody = (await json(wrong)) as unknown as { result: { correct: boolean; misconception: { label: string } | null; feedback: string }; completed: boolean };
    expect(wrongBody.result.correct).toBe(false);
    expect(wrongBody.result.misconception?.label).toBeTruthy();
    expect(wrongBody.result.feedback.length).toBeGreaterThan(30);
    expect(wrongBody.completed).toBe(false);

    for (const q of quiz.questions.slice(1)) {
      await answer(req("POST", `/api/v1/education/quiz/${quiz.quizId}/answer`, { body: { questionId: q.id, answer: "je ne sais pas" }, as: "citizen" }), params({ id: quiz.quizId }));
    }
    const last = await answer(req("POST", `/api/v1/education/quiz/${quiz.quizId}/answer`, { body: { questionId: "q1", answer: "un quart" }, as: "citizen" }), params({ id: quiz.quizId }));
    const done = (await json(last)) as unknown as { completed: boolean; score: number; masterySignal: string; nextReview: { intervalDays: number } };
    expect(done.completed).toBe(true);
    expect(done.masterySignal).toBe("a_reprendre");
    expect(done.nextReview.intervalDays).toBe(1); // failed recall goes back to tomorrow

    const db = await getDb();
    const evidence = await db.select().from(schema.learningEvidence);
    expect(evidence.length).toBe(6);
    expect(evidence.every((e) => !e.teacherVerified)).toBe(true);

    expect((await answer(req("POST", "/api/v1/education/quiz/unknown/answer", { body: { questionId: "q1", answer: "1/4" }, as: "citizen" }), params({ id: "unknown" }))).status).toBe(404);
    expect((await answer(req("POST", `/api/v1/education/quiz/${quiz.quizId}/answer`, { body: { questionId: "q99", answer: "1/4" }, as: "citizen" }), params({ id: quiz.quizId }))).status).toBe(400);
  });

  it("serves the read-aloud library filtered by language", async () => {
    const { GET } = await import("@/app/api/v1/education/stories/route");
    const res = await GET(req("GET", "/api/v1/education/stories?language=ln"));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { stories: Array<{ language: string; words: number; comprehensionQuestions: string[]; licence: string }> };
    expect(body.stories.length).toBeGreaterThanOrEqual(2);
    expect(body.stories.every((s) => s.language === "ln")).toBe(true);
    expect(body.stories.every((s) => s.words >= 150 && s.words <= 250)).toBe(true);
    expect(body.stories.every((s) => s.licence === "programme")).toBe(true);
    expect(body.stories[0].comprehensionQuestions.length).toBeGreaterThan(0);
    expect((await GET(req("GET", "/api/v1/education/stories?language=en"))).status).toBe(400);
  });

  it("runs a lesson and keeps homework hint-first", async () => {
    const { POST } = await import("@/app/api/v1/education/lessons/route");
    expect((await POST(req("POST", "/api/v1/education/lessons", { body: { question: "Explique-moi les fractions" } }))).status).toBe(401);
    const res = await POST(req("POST", "/api/v1/education/lessons", { body: { question: "J'ai un devoir noté de division à rendre demain, donne la réponse" }, as: "citizen" }));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { lesson: { homework: { answerWithheld: boolean }; explanation: string }; curriculum: unknown[] };
    expect(body.lesson.homework.answerWithheld).toBe(true);
    expect(body.lesson.explanation).toMatch(/indices/i);
    expect(body.curriculum.length).toBeGreaterThan(0);
  });

  it("returns own evidence to a learner and class gaps to a teacher only", async () => {
    const { GET } = await import("@/app/api/v1/education/evidence/route");
    const own = (await json(await GET(req("GET", "/api/v1/education/evidence", { as: "citizen" })))) as unknown as { scope: string; evidence: unknown[]; disclaimer: string };
    expect(own.scope).toBe("own");
    expect(own.evidence.length).toBeGreaterThan(0);
    expect(own.disclaimer).toMatch(/jamais une étiquette permanente/i);

    expect((await GET(req("GET", "/api/v1/education/evidence?scope=class", { as: "citizen" }))).status).toBe(403);
    const cls = await GET(req("GET", "/api/v1/education/evidence?scope=class", { as: "teacher" }));
    expect(cls.status).toBe(200);
    const clsBody = (await json(cls)) as unknown as { scope: string; minGroupSize: number };
    expect(clsBody.scope).toBe("class");
    expect(clsBody.minGroupSize).toBeGreaterThan(1);
  });

  it("builds a revision plan with the spaced-repetition ladder", async () => {
    const { POST } = await import("@/app/api/v1/education/plan/route");
    const res = await POST(req("POST", "/api/v1/education/plan", { body: { request: "Je prépare le TENAFEP" }, as: "citizen" }));
    expect(res.status).toBe(200);
    const body = (await json(res)) as unknown as { plan: { weeks: unknown[] }; examTarget: string; revisionLadderDays: number[]; priorityObjectives: unknown[]; scheduledNudges: unknown[] };
    expect(body.plan.weeks.length).toBeGreaterThan(0);
    expect(body.examTarget).toBe("tenafep");
    expect(body.revisionLadderDays.slice(0, 3)).toEqual([1, 3, 7]);
    expect(body.priorityObjectives.length).toBeGreaterThan(0);
    expect(body.scheduledNudges.length).toBeGreaterThan(0);
  });
});
