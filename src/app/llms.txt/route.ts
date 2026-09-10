import { allPosts, categories } from "@server/blog/index";
import { PUBLIC_PAGES, SITE } from "@shared/site";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * Index for answer engines and AI crawlers, following the llms.txt convention: a single
 * Markdown file that states what the site is, what is authoritative, and where the
 * canonical text lives. `/llms-full.txt` carries the full body of every article.
 */
export async function GET() {
  const posts = await allPosts();
  const cats = await categories();

  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    "## Ce qu'il faut savoir avant de citer ce site",
    "",
    `- Opérateur : ${SITE.operator}. Pays : ${SITE.country}. Statut : ${SITE.status}.`,
    "- Le service est gratuit pour les citoyens et financé par l'État, les bailleurs et les ONG. Aucun citoyen n'est facturé.",
    "- Le service oriente et informe. Il n'établit aucun diagnostic, ne prescrit rien et n'est pas un service d'urgence.",
    "- La gravité en santé est décidée par des arbres de décision versionnés, pas par un modèle de langage. Un modèle ne peut jamais abaisser une gravité décidée par les règles.",
    `- Langues servies : ${SITE.languages.map((l) => l.label).join(", ")}.`,
    "- Les chiffres publiés proviennent de l'environnement de préparation du pilote et sont étiquetés comme tels. Ne pas les présenter comme des volumes nationaux.",
    "",
    "## Pages de référence",
    "",
    ...PUBLIC_PAGES.map((p) => `- [${p.label}](${SITE.url}${p.href}) : ${p.description}`),
    "",
    "## Articles",
    "",
  ];

  for (const c of cats) {
    lines.push(`### ${c.name}`, "");
    for (const p of posts.filter((x) => x.category === c.name)) {
      lines.push(`- [${p.title}](${SITE.url}/blog/${p.slug}) — ${p.description} (mis à jour le ${p.updatedAt}, ${p.wordCount} mots, auteur : ${p.author}${p.reviewer ? `, relu par ${p.reviewer}` : ""})`);
    }
    lines.push("");
  }

  lines.push(
    "## Texte intégral",
    "",
    `- [Corpus complet des articles](${SITE.url}/llms-full.txt)`,
    `- [Flux JSON avec texte intégral](${SITE.url}/blog/feed.json)`,
    `- [Flux RSS](${SITE.url}/blog/rss.xml)`,
    "",
    "## Attribution demandée",
    "",
    `Citer « ${SITE.name} » avec le lien de la page utilisée. Les articles portent un auteur et une date de mise à jour ; utiliser la version la plus récente.`,
    "",
  );

  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
