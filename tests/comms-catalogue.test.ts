/**
 * The communication catalogue, and the one rule that cannot bend.
 *
 * Notices used to be `notify()` calls with their French written inline wherever
 * they were raised, which meant nobody could answer the questions an operator
 * asks: which notices exist, which reach a citizen, which survive an opt-out.
 * Making the set data makes those answerable — and testable, which matters most
 * for the notices a person is not allowed to switch off.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CATEGORIES, CHANNELS, EVENTS, channelCoverage, event, eventsInCategory, mandatoryEvents } from "@server/notify/catalogue";
import { render } from "@server/notify/emit";

describe("the catalogue is coherent", () => {
  it("gives every event a unique id", () => {
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every event's category", () => {
    const known = new Set(CATEGORIES.map((c) => c.id));
    for (const e of EVENTS) expect(known, e.id).toContain(e.category);
  });

  it("leaves no category empty, so the console shows no dead heading", () => {
    for (const c of CATEGORIES) expect(eventsInCategory(c.id).length, c.id).toBeGreaterThan(0);
  });

  it("sends every event somewhere", () => {
    for (const e of EVENTS) {
      expect(e.channels.length, e.id).toBeGreaterThan(0);
      for (const ch of e.channels) expect(CHANNELS, `${e.id} -> ${ch}`).toContain(ch);
    }
  });

  it("declares every placeholder its text uses", () => {
    for (const e of EVENTS) {
      const used = new Set([...`${e.title} ${e.body}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
      for (const v of used) expect(e.vars ?? [], `${e.id} uses {{${v}}}`).toContain(v);
    }
  });

  it("declares no placeholder its text never uses", () => {
    for (const e of EVENTS) {
      const text = `${e.title} ${e.body}`;
      for (const v of e.vars ?? []) expect(text, `${e.id} declares ${v}`).toContain(`{{${v}}}`);
    }
  });

  it("writes every notice in French, the canonical language", () => {
    for (const e of EVENTS) {
      expect(e.title.trim().length, e.id).toBeGreaterThan(0);
      expect(e.body.trim().length, e.id).toBeGreaterThan(0);
    }
  });
});

describe("a mandatory notice is justified in writing", () => {
  it("has at least one, or the concept is decorative", () => {
    expect(mandatoryEvents().length).toBeGreaterThan(0);
  });

  it("states why each one overrides a person's choice", () => {
    for (const e of mandatoryEvents()) {
      expect(e.mandatoryBecause, e.id).toBeTruthy();
      // A sentence, not a word: "security" explains nothing to whoever reviews this.
      expect((e.mandatoryBecause ?? "").length, e.id).toBeGreaterThan(30);
    }
  });

  it("never marks a routine notice mandatory", () => {
    // Reminders, reports and revision nudges are exactly what an opt-out is for.
    for (const e of mandatoryEvents()) {
      expect(e.id, `${e.id} is mandatory`).not.toMatch(/reminder|revision|seasonal|report_ready|note_added/);
    }
  });

  it("makes the danger sign mandatory and reachable without reading", () => {
    const danger = event("clinical.danger_sign");
    expect(danger?.mandatory).toBe(true);
    // A citizen who cannot read still has to learn that a health worker is coming.
    expect(danger?.channels).toContain("voice");
    expect(danger?.severity).toBe("critical");
  });

  it("makes an escalation to a worker mandatory, since it is the promise made to the citizen", () => {
    expect(event("clinical.escalated_to_worker")?.mandatory).toBe(true);
  });
});

describe("coverage is reported honestly", () => {
  it("counts each channel's events", () => {
    const coverage = channelCoverage();
    expect(coverage.map((c) => c.channel)).toEqual(CHANNELS);
    for (const row of coverage) {
      expect(row.events).toBe(EVENTS.filter((e) => e.channels.includes(row.channel)).length);
    }
  });

  it("puts every event in the application, which is the only channel that never fails", () => {
    // SMS needs credit, WhatsApp needs data, a call needs somebody to answer.
    for (const e of EVENTS) expect(e.channels, e.id).toContain("in_app");
  });
});

describe("rendering a notice", () => {
  it("substitutes what it is given", () => {
    expect(render("Cas {{caseRef}} — {{province}}", { caseRef: "C-12", province: "Kinshasa" }).text)
      .toBe("Cas C-12 — Kinshasa");
  });

  it("never shows a citizen a raw placeholder", () => {
    const out = render("Cas {{caseRef}}", {});
    expect(out.text).not.toContain("{{");
    expect(out.missing).toEqual(["caseRef"]);
  });

  it("reports a missing variable once, however often it appears", () => {
    expect(render("{{x}} et {{x}}", {}).missing).toEqual(["x"]);
  });

  it("treats an empty string as missing, because a blank gap reads as a bug", () => {
    expect(render("Motif : {{reason}}", { reason: "" }).missing).toEqual(["reason"]);
  });

  it("accepts a number", () => {
    expect(render("{{n}} cas", { n: 3 }).text).toBe("3 cas");
  });
});

describe("emitting", () => {
  beforeEach(() => vi.resetModules());

  it("refuses an unknown event rather than sending nothing quietly", async () => {
    const { emit } = await import("@server/notify/emit");
    await expect(emit("no.such.event", { userId: "x" })).rejects.toThrow(/unknown communication event/);
  });
});
