import { describe, expect, it } from "vitest";
import { safeNextPath } from "@shared/redirect";

/**
 * `next` comes from a query string, so every one of these is a link an attacker
 * can send. The sign-in page is the worst place to follow one.
 */
describe("safeNextPath", () => {
  it("keeps an ordinary in-application path", () => {
    expect(safeNextPath("/tableau-de-bord")).toBe("/tableau-de-bord");
    expect(safeNextPath("/cas/123?filter=open#notes")).toBe("/cas/123?filter=open#notes");
  });

  it("refuses an absolute URL to another site", () => {
    expect(safeNextPath("https://look-alike.example/")).toBe("/");
    expect(safeNextPath("http://look-alike.example/")).toBe("/");
  });

  it("refuses a protocol-relative URL", () => {
    expect(safeNextPath("//look-alike.example/")).toBe("/");
    expect(safeNextPath("/\\look-alike.example/")).toBe("/");
    expect(safeNextPath("\\\\look-alike.example/")).toBe("/");
  });

  it("refuses a scheme that is not navigation", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("data:text/html,<script>")).toBe("/");
    expect(safeNextPath("mailto:someone@example.org")).toBe("/");
  });

  it("refuses control characters and absurd lengths", () => {
    expect(safeNextPath("/ok\nLocation: https://look-alike.example")).toBe("/");
    expect(safeNextPath("/\u0000")).toBe("/");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/");
  });

  it("falls back for an empty or missing value, and honours a given fallback", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("   ")).toBe("/");
    expect(safeNextPath("https://look-alike.example", "/connexion")).toBe("/connexion");
  });
});
