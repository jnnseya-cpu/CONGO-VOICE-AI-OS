import "server-only";
import type { PostFrontMatter } from "./types";

export interface LinkTarget {
  href: string;
  /** Lower-case term that should become a link when it appears in body text. */
  term: string;
  title: string;
  kind: "post" | "page" | "service";
}

/**
 * Terms that always point at the public programme pages. They are checked before post
 * terms so a citizen-facing safety page always wins over an article on the same subject.
 */
const PAGE_TERMS: LinkTarget[] = [
  { term: "signes de danger", href: "/urgence", title: "Signes de danger et conduite à tenir", kind: "page" },
  { term: "signe de danger", href: "/urgence", title: "Signes de danger et conduite à tenir", kind: "page" },
  { term: "conduite à tenir", href: "/urgence", title: "En cas d'urgence", kind: "page" },
  { term: "protection des données", href: "/confidentialite", title: "Protection des données", kind: "page" },
  { term: "données personnelles", href: "/confidentialite", title: "Protection des données", kind: "page" },
  { term: "consentement", href: "/confidentialite", title: "Consentement et finalités", kind: "page" },
  { term: "gouvernance clinique", href: "/gouvernance", title: "Sécurité et gouvernance", kind: "page" },
  { term: "comité de revue clinique", href: "/gouvernance", title: "Sécurité et gouvernance", kind: "page" },
  { term: "supervision humaine", href: "/gouvernance", title: "Supervision humaine", kind: "page" },
  { term: "garde-fous déterministes", href: "/gouvernance", title: "Garde-fous déterministes", kind: "page" },
  { term: "seuils de qualité", href: "/langues-nationales", title: "Seuils de qualité par langue", kind: "page" },
  { term: "locuteurs natifs", href: "/langues-nationales", title: "Relecture par des locuteurs natifs", kind: "page" },
  { term: "corpus", href: "/langues-nationales", title: "Corpus et apprentissage des langues", kind: "page" },
  { term: "accessibilité", href: "/accessibilite", title: "Déclaration d'accessibilité", kind: "page" },
  { term: "financement", href: "/financement", title: "Financement et transparence", kind: "page" },
  { term: "partenaires", href: "/partenaires", title: "Partenaires et intégration", kind: "page" },
  { term: "questions fréquentes", href: "/aide", title: "Questions fréquentes", kind: "page" },
  { term: "USSD", href: "/acces", title: "Accéder par USSD", kind: "page" },
  { term: "WhatsApp", href: "/acces", title: "Accéder par WhatsApp", kind: "page" },
  { term: "appel vocal", href: "/acces", title: "Accéder par appel vocal", kind: "page" },
  { term: "sans smartphone", href: "/acces", title: "Utiliser le service sans smartphone", kind: "page" },
];

const SERVICE_TERMS: LinkTarget[] = [
  { term: "santé communautaire", href: "/services#sante", title: "Le service santé", kind: "service" },
  { term: "triage", href: "/services#sante", title: "Triage et orientation santé", kind: "service" },
  { term: "relais communautaire", href: "/services#sante", title: "Relais communautaires", kind: "service" },
  { term: "agent de santé communautaire", href: "/services#sante", title: "Relais communautaires", kind: "service" },
  { term: "agent agricole", href: "/services#agriculture", title: "Agents agricoles", kind: "service" },
  { term: "maladie des cultures", href: "/services#agriculture", title: "Le service agriculture", kind: "service" },
  { term: "registre des intrants", href: "/services#agriculture", title: "Registre des intrants autorisés", kind: "service" },
  { term: "calendrier cultural", href: "/services#agriculture", title: "Calendriers culturaux", kind: "service" },
  { term: "TENAFEP", href: "/services#education", title: "Préparation au TENAFEP", kind: "service" },
  { term: "Examen d'État", href: "/services#education", title: "Préparation à l'Examen d'État", kind: "service" },
  { term: "appui scolaire", href: "/services#education", title: "Le service éducation", kind: "service" },
  { term: "le programme", href: "/programme", title: "Le programme", kind: "service" },
];

/** Builds the term → destination table from the corpus itself, so it grows with the blog. */
export function buildLinkIndex(posts: PostFrontMatter[]): LinkTarget[] {
  const targets: LinkTarget[] = [];
  for (const p of posts) {
    const href = `/blog/${p.slug}`;
    const terms = new Set<string>([p.title, ...p.entities, ...p.keywords.slice(0, 3)]);
    for (const t of terms) {
      const term = t.trim();
      if (term.length < 6 || term.length > 70) continue;
      targets.push({ term, href, title: p.title, kind: "post" });
    }
  }
  const all = [...PAGE_TERMS, ...SERVICE_TERMS, ...targets];
  // Longest term first so "maladie des cultures" wins over "cultures".
  return all.sort((a, b) => b.term.length - a.term.length);
}

const SKIP_OPEN = /^<(a|h[1-6]|code|pre|script|style|figure)\b/i;
const SKIP_CLOSE = /^<\/(a|h[1-6]|code|pre|script|style|figure)>/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface LinkOptions {
  /** Never link to this path (a post must not link to itself). */
  selfHref: string;
  /** Maximum links injected per document. */
  max?: number;
  /** Maximum times the same destination is linked. */
  maxPerTarget?: number;
}

/**
 * Injects contextual internal links into rendered HTML. Text inside links, headings,
 * code and figures is left untouched, so the document keeps one link per idea and
 * headings stay clean for search engines and screen readers.
 */
interface Chunk {
  text: string;
  frozen: boolean;
}

export function injectLinks(html: string, index: LinkTarget[], opts: LinkOptions): { html: string; injected: number } {
  const max = opts.max ?? 24;
  const maxPerTarget = opts.maxPerTarget ?? 2;
  const usedTerm = new Set<string>();
  const perTarget = new Map<string, number>();
  let injected = 0;

  const parts = html.split(/(<[^>]+>)/g);
  let depth = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("<")) {
      if (SKIP_OPEN.test(part) && !part.endsWith("/>")) depth++;
      else if (SKIP_CLOSE.test(part)) depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0 || !part.trim()) continue;

    // Anchors already injected in this segment become frozen chunks: a later term
    // must never match inside an href or a title attribute we just wrote.
    let chunks: Chunk[] = [{ text: part, frozen: false }];
    for (const target of index) {
      if (injected >= max) break;
      if (target.href === opts.selfHref) continue;
      const termKey = target.term.toLowerCase();
      if (usedTerm.has(termKey)) continue;
      if ((perTarget.get(target.href) ?? 0) >= maxPerTarget) continue;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}-])(${escapeRe(target.term)})(?=[^\\p{L}\\p{N}-]|$)`, "iu");
      const next: Chunk[] = [];
      let done = false;
      for (const chunk of chunks) {
        if (done || chunk.frozen) {
          next.push(chunk);
          continue;
        }
        const m = re.exec(chunk.text);
        if (!m) {
          next.push(chunk);
          continue;
        }
        const start = m.index + m[1].length;
        const end = start + m[2].length;
        const anchor = `<a href="${target.href}" title="${escapeAttr(target.title)}">${chunk.text.slice(start, end)}</a>`;
        next.push({ text: chunk.text.slice(0, start), frozen: false });
        next.push({ text: anchor, frozen: true });
        next.push({ text: chunk.text.slice(end), frozen: false });
        done = true;
      }
      if (!done) continue;
      chunks = next;
      usedTerm.add(termKey);
      perTarget.set(target.href, (perTarget.get(target.href) ?? 0) + 1);
      injected++;
    }
    parts[i] = chunks.map((c) => c.text).join("");
  }
  return { html: parts.join(""), injected };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
