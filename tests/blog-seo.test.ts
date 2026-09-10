import { describe, expect, it } from "vitest";
import { allPosts, categories, slugifyTerm, tags } from "@server/blog/index";
import { knownPathSet, PASS_MARK, scorePost } from "@server/blog/seo";
import { PUBLIC_PAGES } from "@shared/site";

/**
 * The SEO score is a build gate, not a claim: a published article that scores below the
 * pass mark fails the test suite, with the failing checks named.
 */
describe("blog SEO", () => {
  it("publishes at least one article", async () => {
    expect((await allPosts()).length).toBeGreaterThan(0);
  });

  it("scores every article at or above the pass mark", async () => {
    const posts = await allPosts();
    const known = knownPathSet(
      posts.map((p) => p.slug),
      (await categories()).map((c) => c.slug),
      (await tags()).map((t) => t.slug),
      PUBLIC_PAGES.map((p) => p.href),
    );
    const report = posts.map((p) => scorePost(p, known));
    const failing = report.filter((r) => r.total < PASS_MARK);
    const detail = failing.map((r) => `${r.slug} = ${r.total}/100 → ${r.failures.map((f) => `${f.id} (${f.earned}/${f.points}: ${f.detail})`).join("; ")}`).join("\n");
    expect(detail === "" ? "" : detail).toBe("");
    for (const r of report) expect(r.total).toBeGreaterThanOrEqual(PASS_MARK);
  });

  it("keeps slugs, categories and tags unique and well formed", async () => {
    const posts = await allPosts();
    const slugs = posts.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of posts) {
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(slugifyTerm(p.category).length).toBeGreaterThan(1);
      expect(p.keywords.length).toBeGreaterThanOrEqual(3);
      expect(p.entities.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("injects contextual internal links into every article", async () => {
    for (const p of await allPosts()) {
      const internal = p.links.filter((l) => !l.external);
      expect(internal.length, `${p.slug} internal links`).toBeGreaterThanOrEqual(5);
      expect(internal.some((l) => l.href.startsWith("/blog/") || l.href.startsWith("/")), `${p.slug} has programme links`).toBe(true);
      expect(p.links.every((l) => l.text.trim().length > 0), `${p.slug} anchor text`).toBe(true);
      expect(p.html.includes(`href="/blog/${p.slug}"`), `${p.slug} must not link to itself`).toBe(false);
    }
  });

  it("never leaves an internal link pointing at a page that does not exist", async () => {
    const posts = await allPosts();
    const known = knownPathSet(
      posts.map((p) => p.slug),
      (await categories()).map((c) => c.slug),
      (await tags()).map((t) => t.slug),
      PUBLIC_PAGES.map((p) => p.href),
    );
    for (const p of posts) {
      for (const l of p.links.filter((x) => !x.external && x.href.startsWith("/"))) {
        expect(known.has(l.href.split("#")[0]), `${p.slug} → ${l.href}`).toBe(true);
      }
    }
  });
});
