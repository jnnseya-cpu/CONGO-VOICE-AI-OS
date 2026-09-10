import { describe, expect, it } from "vitest";

import { allPosts } from "@/server/blog";
import { buildLinkIndex, injectLinks } from "@/server/blog/links";
import { decodeEntities, stripTags } from "@/server/blog/parse";

describe("blog markdown parsing", () => {
  it("decodes the entities marked emits, so escaped apostrophes stay measurable", () => {
    expect(decodeEntities("l&#39;IA vocale")).toBe("l'IA vocale");
    expect(decodeEntities("l&#x27;IA &amp; la voix")).toBe("l'IA & la voix");
    expect(stripTags("<p>l&#39;IA <b>vocale</b></p>")).toBe("l'IA vocale");
  });

  it("keeps front matter answers written as indented continuation lines", async () => {
    const posts = await allPosts();
    for (const post of posts) {
      for (const entry of post.faq) {
        expect(entry.q.length, `${post.slug} question`).toBeGreaterThan(0);
        expect(entry.a?.length ?? 0, `${post.slug} réponse à « ${entry.q} »`).toBeGreaterThan(0);
      }
      for (const source of post.sources) {
        expect(source.url, `${post.slug} source « ${source.label} »`).toMatch(/^https?:\/\//);
      }
    }
  });
});

describe("internal link injection", () => {
  const index = buildLinkIndex([]);

  it("never injects a link inside an attribute of a link it just wrote", () => {
    const html = "<p>Les signes de danger et la protection des données sont des signes de danger.</p>";
    const { html: out } = injectLinks(html, index, { selfHref: "/blog/x" });
    expect(out).not.toMatch(/title="[^"]*&lt;a /);
    expect(out).not.toMatch(/<a\s[^>]*<a\s/);
  });

  it("leaves headings, code and existing links untouched", () => {
    const html = '<h2>Les signes de danger</h2><pre><code>signes de danger</code></pre><p><a href="/x">signes de danger</a></p>';
    const { html: out, injected } = injectLinks(html, index, { selfHref: "/blog/x" });
    expect(injected).toBe(0);
    expect(out).toBe(html);
  });

  it("produces well formed markup across the published corpus", async () => {
    const posts = await allPosts();
    for (const post of posts) {
      expect(post.html.match(/<a\s/g)?.length ?? 0, post.slug).toBe(post.html.match(/<\/a>/g)?.length ?? 0);
      expect(post.html, post.slug).not.toMatch(/title="[^"]*&lt;a /);
    }
  });
});
