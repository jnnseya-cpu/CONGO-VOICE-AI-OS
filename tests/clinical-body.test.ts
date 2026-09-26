/**
 * The reference library is authored as Markdown and was rendered as plain text.
 * A health worker opening the immunisation schedule saw "## Calendrier de
 * l'enfant" as a line of text and the whole table flattened into one unreadable
 * run — "| Âge | Vaccins | |---|---| | Naissance | BCG ..." — because a Markdown
 * table's rows are separated by single newlines and the renderer split on blank
 * ones. The age at which a measles dose is due was in there somewhere.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClinicalBody } from "@client/components/ClinicalBody";

// createElement rather than JSX: vitest only collects tests/**/*.test.ts, and
// widening that glob for one file is a worse trade than one unfamiliar line.
const render = (body: string) => renderToStaticMarkup(createElement(ClinicalBody, { body }));

describe("structure survives", () => {
  it("turns a heading into a heading, not into text", () => {
    const html = render("## Choléra\n\nDiarrhée aqueuse abondante.");
    expect(html).toContain("Choléra</h3>");
    expect(html).not.toContain("## Choléra");
  });

  it("renders the vaccination calendar as a table", () => {
    const html = render(
      "| Âge | Vaccins |\n|---|---|\n| Naissance | BCG ; VPO-0 |\n| 9 mois | VAR-1 (rougeole) |",
    );
    expect(html).toContain("<table");
    // The header row is the one above the rule, and the rule itself is not data.
    expect(html).toContain("<th");
    expect(html).toContain("Âge");
    expect(html).not.toContain("---");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // header + two rows
    expect(html).toContain("9 mois");
    expect(html).toContain("VAR-1 (rougeole)");
  });

  it("keeps a wide table scrollable rather than clipping the last column", () => {
    // A clipped calendar silently hides a vaccine.
    expect(render("| a | b |\n|---|---|\n| 1 | 2 |")).toContain("overflow-x-auto");
  });

  it("renders a bullet list as list items", () => {
    const html = render("- La vaccination est gratuite.\n- Un retard se rattrape.");
    expect((html.match(/<li>/g) ?? []).length).toBe(2);
    expect(html).toContain("<ul");
    expect(html).not.toContain("- La vaccination");
  });

  it("does not merge a list into the paragraph above it", () => {
    const html = render("Ce qu'il faut savoir :\n- Gratuite.\n- Rattrapable.");
    expect(html).toContain("<p");
    expect((html.match(/<li>/g) ?? []).length).toBe(2);
  });

  it("emphasises what a protocol marks as urgent", () => {
    const html = render("**Signaler et partir immédiatement** dès qu'une personne vomit.");
    expect(html).toContain("<strong");
    expect(html).toContain("Signaler et partir immédiatement");
    expect(html).not.toContain("**");
  });

  it("joins a paragraph wrapped across source lines into one", () => {
    const html = render("Le choléra provoque une diarrhée\naqueuse très abondante.");
    expect((html.match(/<p /g) ?? []).length).toBe(1);
    expect(html).toContain("diarrhée aqueuse");
  });

  it("separates paragraphs split by a blank line", () => {
    expect((render("Premier.\n\nSecond.").match(/<p /g) ?? []).length).toBe(2);
  });
});

describe("it cannot inject markup, whatever the text says", () => {
  // The body reaches the page from the database, where an administrator edits
  // it. dangerouslySetInnerHTML on an editable field is a stored XSS hole.
  it("escapes a script tag rather than executing it", () => {
    const html = render("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes markup inside a table cell", () => {
    const html = render("| x |\n|---|\n| <img onerror=alert(1)> |");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("it never renders nothing", () => {
  it("shows an unsupported construct as its own text rather than dropping it", () => {
    // Wrong but legible beats a blank protocol.
    expect(render("> une citation")).toContain("une citation");
  });

  it("survives an empty body", () => {
    expect(() => render("")).not.toThrow();
  });

  it("survives a table with no rule line", () => {
    const html = render("| a | b |");
    expect(html).toContain("<table");
    expect(html).toContain("a");
  });
});
