import { allPosts } from "@server/blog/index";
import { SITE } from "@shared/site";

export const dynamic = "force-static";
export const revalidate = 3600;

/** Full, plain-text corpus of every article, for answer engines that ingest one document. */
export async function GET() {
  const posts = await allPosts();
  const parts: string[] = [
    `# ${SITE.name} — corpus complet du blog`,
    "",
    `Source : ${SITE.url}/blog. Généré le ${new Date().toISOString().slice(0, 10)}.`,
    `Opérateur : ${SITE.operator}. Le service oriente et informe ; il n'établit aucun diagnostic et n'est pas un service d'urgence.`,
    "",
    "---",
    "",
  ];
  for (const p of posts) {
    parts.push(
      `## ${p.title}`,
      "",
      `URL : ${SITE.url}/blog/${p.slug}`,
      `Catégorie : ${p.category} · Dossier : ${p.cluster} · Langue : ${p.lang}`,
      `Auteur : ${p.author} (${p.authorRole})${p.reviewer ? ` · Relu par : ${p.reviewer} (${p.reviewerRole})` : ""}`,
      `Publié : ${p.publishedAt} · Mis à jour : ${p.updatedAt} · ${p.wordCount} mots`,
      "",
      `Résumé : ${p.description}`,
      "",
      "Ce qu'il faut retenir :",
      ...p.takeaways.map((t) => `- ${t}`),
      "",
      p.markdown,
      "",
      ...(p.faq.length ? ["Questions fréquentes :", "", ...p.faq.flatMap((f) => [`Q : ${f.q}`, `R : ${f.a}`, ""])] : []),
      ...(p.sources.length ? ["Sources :", ...p.sources.map((s) => `- ${s.label} — ${s.url}`), ""] : []),
      "---",
      "",
    );
  }
  return new Response(parts.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
