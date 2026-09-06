import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { answersMatch, canonicalFraction, generateQuiz, masteryFromScore, normaliseAnswer, numericValue, publicQuestions, scoreAnswer, scoreQuiz } from "@server/ai/education/quiz";
import type { QuizQuestion } from "@server/ai/schemas";
import { nextReview, qualityFromScore, reviewLadder, scheduleRevision, plannedRevisions, BASE_INTERVALS, DEFAULT_EASE, MIN_EASE } from "@server/ai/education/spaced-repetition";
import { CURRICULUM, findObjective, levelFromAgeBand, objectivesFor, prerequisiteChain, examObjectives } from "@server/ai/education/curriculum";

const QUESTION: QuizQuestion = {
  id: "q1",
  prompt: "Un pain est coupé en 4 parts égales, tu en prends 1. Quelle fraction as-tu ?",
  expectedAnswer: "1/4",
  acceptableAnswers: ["un quart", "1 sur 4"],
  answerType: "mot",
  rubric: "L'élève dit la fraction avec le bon numérateur et le bon dénominateur.",
  rubricCriteria: ["Numérateur correct", "Dénominateur correct"],
  misconceptions: [{ trigger: "4/1", label: "Inversion du haut et du bas", feedback: "Le chiffre du bas dit en combien de parts on coupe (4), celui du haut combien tu prends (1)." }],
  hint: "Compte d'abord toutes les parts.",
  difficulty: "facile",
};

describe("education · answer normalisation and tolerance", () => {
  it("normalises accents, fillers and number words", () => {
    expect(normaliseAnswer("La réponse est QUATRE")).toBe("4");
    expect(normaliseAnswer("euh... je pense que c'est deux")).toBe("2");
    expect(normaliseAnswer("12,5")).toBe("12.5");
    expect(normaliseAnswer("1 sur 2")).toBe("1/2");
    expect(normaliseAnswer("la moitié")).toBe("1/2");
    expect(normaliseAnswer("un quart")).toBe("1/4");
  });

  it("understands fractions, decimals and percentages", () => {
    expect(canonicalFraction(normaliseAnswer("2/4"))).toBe("1/2");
    expect(numericValue(normaliseAnswer("3/4"))).toBeCloseTo(0.75);
    expect(numericValue(normaliseAnswer("12,5"))).toBeCloseTo(12.5);
    expect(numericValue(normaliseAnswer("50 %"))).toBeCloseTo(0.5);
  });

  it("accepts equivalent spoken forms", () => {
    expect(answersMatch("un quart", "1/4")).toBe(true);
    expect(answersMatch("2/4", "1/2")).toBe(true);
    expect(answersMatch("la moitié", "1/2")).toBe(true);
    expect(answersMatch("c'est quatre", "4")).toBe(true);
    expect(answersMatch("je dirais 4 mangues", "4")).toBe(true);
    expect(answersMatch("8", "4")).toBe(false);
  });
});

describe("education · rubric-based scoring (FR-ED-04)", () => {
  it("accepts a correct answer and names the criterion reached", () => {
    const r = scoreAnswer(QUESTION, "un quart");
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
    expect(r.result).toBe("mastered");
    expect(r.matchedOn).toBe("1/4");
    expect(r.feedback).toContain("Critère atteint");
    expect(r.feedback).toContain(QUESTION.rubric);
  });

  it("never answers a bare 'incorrect': feedback names the misconception and the rubric", () => {
    const r = scoreAnswer(QUESTION, "4/1");
    expect(r.correct).toBe(false);
    expect(r.misconception?.label).toBe("Inversion du haut et du bas");
    expect(r.feedback).toContain("erreur très fréquente");
    expect(r.feedback).toContain("Inversion du haut et du bas");
    expect(r.feedback).toContain("Le chiffre du bas dit en combien de parts");
    expect(r.feedback).toContain(QUESTION.rubric);
    expect(r.feedback.trim()).not.toBe("Incorrect");
  });

  it("gives rubric-linked feedback and a hint even for an unrecognised answer", () => {
    const r = scoreAnswer(QUESTION, "je ne sais pas");
    expect(r.correct).toBe(false);
    expect(r.misconception).toBeNull();
    expect(r.feedback).toContain("ce n'est pas grave");
    expect(r.feedback).toContain(QUESTION.rubric);
    expect(r.feedback).toContain(QUESTION.hint);
  });

  it("scores a whole quiz and derives a mastery signal", () => {
    const questions: QuizQuestion[] = [QUESTION, { ...QUESTION, id: "q2", expectedAnswer: "1/2", acceptableAnswers: ["la moitié"] }];
    const all = scoreQuiz(questions, { q1: "un quart", q2: "la moitié" });
    expect(all.score).toBe(1);
    expect(all.correct).toBe(2);
    expect(all.masterySignal).toBe("maitrise");
    expect(all.summary).toContain("acquise");

    const none = scoreQuiz(questions, { q1: "4/1", q2: "2" });
    expect(none.score).toBe(0);
    expect(none.masterySignal).toBe("a_reprendre");
    expect(none.results.every((r) => r.feedback.length > 20)).toBe(true);

    expect(masteryFromScore(0.9)).toBe("maitrise");
    expect(masteryFromScore(0.6)).toBe("en_cours");
    expect(masteryFromScore(0.2)).toBe("a_reprendre");
  });
});

describe("education · quiz generation (offline provider)", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("produces five rubric-bearing questions and never leaks the answers", async () => {
    const quiz = await generateQuiz({ topic: "les fractions", level: "primaire_4" });
    expect(quiz.questions).toHaveLength(5);
    for (const q of quiz.questions) {
      expect(q.rubric.length).toBeGreaterThan(10);
      expect(q.expectedAnswer).toBeTruthy();
      expect(q.hint).toBeTruthy();
      expect(q.misconceptions.length).toBeGreaterThan(0);
    }
    const asked = publicQuestions(quiz.questions);
    const serialised = JSON.stringify(asked);
    expect(serialised).not.toContain("expectedAnswer");
    expect(serialised).not.toContain("acceptableAnswers");
    expect(quiz.citations.length).toBeGreaterThan(0);
    expect(quiz.citations[0]).toMatch(/^KB-ED-/);
  });
});

describe("education · spaced repetition (FR-ED-07)", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("walks the fixed early ladder on successful recalls", () => {
    const ladder = reviewLadder(5);
    expect(ladder.slice(0, 3)).toEqual([...BASE_INTERVALS]);
    expect(ladder[3]).toBeGreaterThan(ladder[2]);
    expect(ladder[4]).toBeGreaterThan(ladder[3]);
  });

  it("resets to one day when recall fails", () => {
    const r = nextReview({ repetition: 3, easeFactor: DEFAULT_EASE, intervalDays: 16 }, 1);
    expect(r.reset).toBe(true);
    expect(r.intervalDays).toBe(1);
    expect(r.repetition).toBe(0);
    expect(r.easeFactor).toBeLessThan(DEFAULT_EASE);
    expect(r.easeFactor).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it("clamps the ease factor", () => {
    let state = { repetition: 0, easeFactor: DEFAULT_EASE, intervalDays: 0 };
    for (let i = 0; i < 12; i++) {
      const r = nextReview(state, 0);
      state = { repetition: r.repetition, easeFactor: r.easeFactor, intervalDays: r.intervalDays };
    }
    expect(state.easeFactor).toBe(MIN_EASE);
  });

  it("maps a quiz score to a recall quality, penalising assistance", () => {
    expect(qualityFromScore(1)).toBe(5);
    expect(qualityFromScore(1, true)).toBe(4);
    expect(qualityFromScore(0.5)).toBe(2);
    expect(qualityFromScore(0)).toBe(0);
  });

  it("schedules the nudge and replaces the previous one for the same topic", async () => {
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ isAnonymous: true, role: "citizen", languagePreference: "fr" }).returning();

    const first = await scheduleRevision({ userId: user.id, subject: "maths", topic: "les fractions", quality: 5 });
    expect(first.outcome.intervalDays).toBe(1);
    expect(first.schedule.kind).toBe("revision");

    const second = await scheduleRevision({ userId: user.id, subject: "maths", topic: "les fractions", quality: 5 });
    expect(second.outcome.repetition).toBe(2);
    expect(second.outcome.intervalDays).toBe(3);

    const pending = await plannedRevisions(user.id, new Date(0));
    expect(pending).toHaveLength(1);
    expect((pending[0].payload as { topic: string }).topic).toBe("les fractions");
  });
});

describe("education · DRC curriculum map (FR-ED-09)", () => {
  it("covers primary and secondary with unique codes", () => {
    expect(CURRICULUM.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CURRICULUM.map((o) => o.code)).size).toBe(CURRICULUM.length);
    expect(CURRICULUM.some((o) => o.level.startsWith("primaire"))).toBe(true);
    expect(CURRICULUM.some((o) => o.level.startsWith("secondaire"))).toBe(true);
    expect(objectivesFor("primaire_4").length).toBeGreaterThan(0);
  });

  it("attaches a spoken question to the closest objective", () => {
    expect(findObjective("je ne comprends pas les fractions", "primaire_4")?.code).toBe("MATH-P4-02");
    expect(findObjective("comment conjuguer au passé composé", "primaire_5")?.subject).toBe("french");
    expect(findObjective("pourquoi les plantes ont besoin du soleil", "primaire_3")?.code).toBe("SCI-P3-01");
  });

  it("exposes prerequisites and exam-weighted objectives", () => {
    expect(prerequisiteChain("MATH-P4-02").map((o) => o.code)).toContain("MATH-P4-01");
    expect(examObjectives("tenafep").length).toBeGreaterThan(5);
    expect(examObjectives("examen_etat").length).toBeGreaterThan(5);
    expect(levelFromAgeBand("9-11")).toBe("primaire_4");
  });
});
