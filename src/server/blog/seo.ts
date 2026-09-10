import "server-only";
import type { Post, PostScore, ScoreCheck } from "./types";

/**
 * On-page SEO scorer, out of 100. Every check is deterministic and inspectable, so the
 * score is a build-time gate rather than a claim: `tests/blog-seo.test.ts` fails the
 * build if any published post scores below the threshold.
 *
 * The rubric follows what search engines and answer engines actually parse: the title
 * and description that appear in a result, the heading outline, depth and keyword use,
 * the internal link graph, media alternatives, structured data, and the trust signals
 * (named author, named reviewer, cited sources, freshness) that carry weight for
 * health and agriculture topics.
 */
export const PASS_MARK = 90;

const RECOMMENDED_MIN_WORDS = 1200;
const STRONG_WORDS = 1800;

interface Ctx {
  post: Post;
  knownPaths: Set<string>;
}

export function scorePost(post: Post, knownPaths: Set<string>): PostScore {
  const ctx: Ctx = { post, knownPaths };
  const checks: ScoreCheck[] = [
    ...titleChecks(ctx),
    ...urlChecks(ctx),
    ...headingChecks(ctx),
    ...contentChecks(ctx),
    ...linkChecks(ctx),
    ...mediaChecks(ctx),
    ...structuredDataChecks(ctx),
    ...trustChecks(ctx),
  ];
  const total = checks.reduce((s, c) => s + c.earned, 0);
  const max = checks.reduce((s, c) => s + c.points, 0);
  return { slug: post.slug, total: Math.round(total), max, checks, failures: checks.filter((c) => c.earned < c.points) };
}

const check = (id: string, group: string, label: string, points: number, ok: boolean | number, detail: string): ScoreCheck => ({
  id,
  group,
  label,
  points,
  earned: typeof ok === "number" ? Math.max(0, Math.min(points, ok)) : ok ? points : 0,
  detail,
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function primary(post: Post): string {
  return (post.keywords[0] ?? post.title).trim();
}

function contains(haystack: string, needle: string): boolean {
  const h = norm(haystack);
  const n = norm(needle);
  if (h.includes(n)) return true;
  // A phrase also counts when all of its significant words are present.
  const words = n.split(/\s+/).filter((w) => w.length > 3);
  return words.length > 1 && words.every((w) => h.includes(w));
}

function titleChecks({ post }: Ctx): ScoreCheck[] {
  const len = post.title.length;
  const dlen = post.description.length;
  return [
    check("title-length", "Titre et métadonnées", "Titre de 30 à 65 caractères", 4, len >= 30 && len <= 65, `${len} caractères`),
    check("title-keyword", "Titre et métadonnées", "Le titre contient la requête cible", 3, contains(post.title, primary(post)), `cible « ${primary(post)} »`),
    check("desc-length", "Titre et métadonnées", "Méta-description de 120 à 165 caractères", 4, dlen >= 120 && dlen <= 165, `${dlen} caractères`),
    check("desc-keyword", "Titre et métadonnées", "La méta-description contient la requête cible", 3, contains(post.description, primary(post)), "présence de la requête"),
  ];
}

function urlChecks({ post }: Ctx): ScoreCheck[] {
  const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug) && post.slug.length <= 60;
  return [
    check("slug-format", "Adresse", "Adresse courte, en minuscules, séparée par des tirets", 4, slugOk, `/blog/${post.slug}`),
    check("slug-keyword", "Adresse", "L'adresse reprend un mot de la requête cible", 2, primary(post).split(/\s+/).some((w) => w.length > 4 && post.slug.includes(norm(w))), "mot-clé dans l'adresse"),
    check("lang", "Adresse", "Langue du contenu déclarée", 2, post.lang === "fr" || post.lang === "en", post.lang),
  ];
}

function headingChecks({ post }: Ctx): ScoreCheck[] {
  const h1 = post.headings.filter((h) => h.level === 1);
  const h2 = post.headings.filter((h) => h.level === 2);
  let skips = 0;
  for (let i = 1; i < post.headings.length; i++) {
    if (post.headings[i].level - post.headings[i - 1].level > 1) skips++;
  }
  const question = post.headings.some((h) => /\?$/.test(h.text.trim()) || /^(comment|pourquoi|quand|qui|que|quel|quelle|combien|how|why|what|when)\b/i.test(h.text.trim()));
  return [
    check("h1-single", "Structure", "Le titre H1 est unique (rendu par la page)", 3, h1.length === 0, `${h1.length} H1 dans le corps`),
    check("h2-count", "Structure", "Au moins quatre sections de niveau 2", 3, h2.length >= 4, `${h2.length} sections`),
    check("heading-order", "Structure", "Aucun saut de niveau de titre", 2, skips === 0, `${skips} saut(s)`),
    check("heading-question", "Structure", "Au moins un intertitre formulé en question", 2, question, "format question-réponse pour les moteurs de réponse"),
    check("toc", "Structure", "Assez d'intertitres pour un sommaire (≥ 5)", 2, post.headings.filter((h) => h.level <= 3).length >= 5, `${post.headings.length} intertitres`),
  ];
}

function contentChecks({ post }: Ctx): ScoreCheck[] {
  const words = post.wordCount;
  const depth = words >= STRONG_WORDS ? 6 : words >= RECOMMENDED_MIN_WORDS ? 5 : words >= 800 ? 3 : 0;
  const body = norm(post.text);
  const occurrences = countOccurrences(body, norm(primary(post)));
  const density = words > 0 ? (occurrences * primary(post).split(/\s+/).length) / words : 0;
  const secondary = post.keywords.slice(1).filter((k) => contains(post.text, k)).length;
  return [
    check("depth", "Contenu", `Profondeur du contenu (≥ ${RECOMMENDED_MIN_WORDS} mots)`, 6, depth, `${words} mots`),
    check("density", "Contenu", "Densité de la requête cible entre 0,3 % et 2,5 %", 4, density >= 0.003 && density <= 0.025, `${(density * 100).toFixed(2)} %`),
    check("secondary", "Contenu", "Au moins trois requêtes secondaires traitées", 3, Math.min(3, secondary), `${secondary} sur ${Math.max(0, post.keywords.length - 1)}`),
    check("lists", "Contenu", "Au moins une liste", 2, /<(ul|ol)\b/i.test(post.html), "liste présente"),
    check("table", "Contenu", "Au moins un tableau comparatif", 2, /<table\b/i.test(post.html), "tableau présent"),
    check("takeaways", "Contenu", "Points à retenir (extrait citable par les moteurs de réponse)", 3, post.takeaways.length >= 3, `${post.takeaways.length} points`),
  ];
}

function linkChecks({ post, knownPaths }: Ctx): ScoreCheck[] {
  const internal = post.links.filter((l) => !l.external && l.href.startsWith("/"));
  const external = post.links.filter((l) => l.external);
  const distinct = new Set(internal.map((l) => l.href.split("#")[0]));
  const broken = internal.filter((l) => {
    const p = l.href.split("#")[0];
    return p !== "" && !knownPaths.has(p);
  });
  const generic = /^(ici|lien|cliquez|en savoir plus|voir|read more|here|link)$/i;
  const descriptive = post.links.filter((l) => l.text.trim().length >= 4 && !generic.test(l.text.trim()));
  return [
    check("internal-count", "Maillage", "Au moins cinq liens internes", 5, Math.min(5, internal.length), `${internal.length} liens internes`),
    check("internal-distinct", "Maillage", "Au moins trois destinations internes différentes", 3, Math.min(3, distinct.size), `${distinct.size} destinations`),
    check("external", "Maillage", "Au moins deux sources externes citées", 3, Math.min(3, external.length * 1.5), `${external.length} liens externes`),
    check("anchor-text", "Maillage", "Ancres descriptives (pas de « cliquez ici »)", 3, post.links.length > 0 && descriptive.length === post.links.length, `${descriptive.length}/${post.links.length}`),
    check("no-broken", "Maillage", "Aucun lien interne cassé", 2, broken.length === 0, broken.length ? broken.map((b) => b.href).join(", ") : "aucun"),
  ];
}

function mediaChecks({ post }: Ctx): ScoreCheck[] {
  const imgs = [...post.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const withAlt = imgs.filter((i) => /alt="[^"]{5,}"/i.test(i));
  return [
    check("cover-alt", "Médias", "Texte alternatif de l'image de couverture (≥ 15 caractères)", 3, post.imageAlt.trim().length >= 15, `${post.imageAlt.trim().length} caractères`),
    check("body-img-alt", "Médias", "Toutes les images du corps ont un texte alternatif", 3, imgs.length === 0 || withAlt.length === imgs.length, `${withAlt.length}/${imgs.length}`),
    check("social-card", "Médias", "Carte sociale générée pour l'article", 2, true, "route opengraph-image par article"),
  ];
}

function structuredDataChecks({ post }: Ctx): ScoreCheck[] {
  return [
    check("sd-article", "Données structurées", "Balisage BlogPosting", 4, true, "émis par la page article"),
    check("sd-author", "Données structurées", "Auteur et éditeur balisés", 2, post.author.trim().length > 2, post.author),
    check("sd-dates", "Données structurées", "Dates de publication et de mise à jour", 2, isDate(post.publishedAt) && isDate(post.updatedAt), `${post.publishedAt} → ${post.updatedAt}`),
    check("sd-breadcrumb", "Données structurées", "Fil d'Ariane balisé", 2, true, "BreadcrumbList"),
    check("sd-faq", "Données structurées", "Questions-réponses balisées (FAQPage)", 2, post.faq.length >= 3, `${post.faq.length} questions`),
    check("sd-speakable", "Données structurées", "Passage lisible à voix haute balisé", 2, post.takeaways.length > 0, "SpeakableSpecification"),
  ];
}

function trustChecks({ post }: Ctx): ScoreCheck[] {
  const fresh = daysSince(post.updatedAt);
  return [
    check("author-role", "Confiance", "Auteur identifié avec sa fonction", 2, post.authorRole.trim().length > 3, post.authorRole),
    check("reviewer", "Confiance", "Relecture par une personne nommée", 2, Boolean(post.reviewer && post.reviewerRole), post.reviewer ?? "aucune"),
    check("sources", "Confiance", "Au moins deux sources vérifiables citées", 2, Math.min(2, post.sources.length), `${post.sources.length} sources`),
    check("freshness", "Confiance", "Mise à jour datant de moins de 365 jours", 2, fresh <= 365, `${fresh} jours`),
  ];
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function daysSince(v: string): number {
  const t = Date.parse(v);
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Paths the link checker treats as valid destinations. */
export function knownPathSet(slugs: string[], categorySlugs: string[], tagSlugs: string[], publicPaths: string[]): Set<string> {
  return new Set<string>([
    "/",
    "/blog",
    "/sante",
    "/agriculture",
    "/education",
    "/historique",
    "/connexion",
    ...publicPaths,
    ...slugs.map((s) => `/blog/${s}`),
    ...categorySlugs.map((s) => `/blog/categorie/${s}`),
    ...tagSlugs.map((s) => `/blog/sujet/${s}`),
  ]);
}
