import { describe, expect, it } from "vitest";
import { jsonLdScript } from "@shared/jsonld";

/**
 * The element boundary, not the JSON, is what has to be safe: HTML ends a
 * `<script>` at the first `</script`, whatever the JSON grammar says.
 */
describe("jsonLdScript", () => {
  it("still produces JSON a parser reads back identically", () => {
    const value = { name: "Service <national> & vocal", list: [1, 2] };
    expect(JSON.parse(jsonLdScript(value))).toEqual(value);
  });

  it("leaves no sequence that can close the script element", () => {
    const out = jsonLdScript({ title: "</script><img src=x onerror=alert(1)>" });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out).title).toBe("</script><img src=x onerror=alert(1)>");
  });

  it("escapes the line separators that break a script body", () => {
    const out = jsonLdScript({ t: "a b c" });
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out).t).toBe("a b c");
  });
});
