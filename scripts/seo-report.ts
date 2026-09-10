/**
 * Prints the on-page SEO score of every published article, with the checks that lost points.
 *   npm run seo:report
 */
import { allPosts, categories, tags } from "@server/blog/index";
import { knownPathSet, PASS_MARK, scorePost } from "@server/blog/seo";
import { PUBLIC_PAGES } from "@shared/site";

async function main() {
  const posts = await allPosts();
  if (!posts.length) {
    console.log("Aucun article publié.");
    return;
  }
  const known = knownPathSet(
    posts.map((p) => p.slug),
    (await categories()).map((c) => c.slug),
    (await tags()).map((t) => t.slug),
    PUBLIC_PAGES.map((p) => p.href),
  );
  let worst = 100;
  for (const post of posts) {
    const s = scorePost(post, known);
    worst = Math.min(worst, s.total);
    const flag = s.total >= PASS_MARK ? "OK " : "ÉCHEC";
    console.log(`\n${flag} ${String(s.total).padStart(3)}/100  ${post.slug}`);
    console.log(`        ${post.wordCount} mots · ${post.links.filter((l) => !l.external).length} liens internes · ${post.links.filter((l) => l.external).length} externes · ${post.headings.length} intertitres`);
    for (const f of s.failures) console.log(`        − ${f.points - f.earned} pt  ${f.id} : ${f.label} (${f.detail})`);
  }
  console.log(`\nSeuil : ${PASS_MARK}/100 · Article le plus faible : ${worst}/100 · ${posts.length} articles`);
  if (worst < PASS_MARK) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
