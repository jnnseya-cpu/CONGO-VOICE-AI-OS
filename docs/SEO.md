# Search, answer engines and distribution

This document states what the repository implements, how the SEO score is computed, what it does and does not guarantee, and what has to happen off-site for the programme to rank.

## 1. What is guaranteed, and what is not

**Guaranteed by this repository.** Every published article is scored by `src/server/blog/seo.ts` against a 100-point on-page rubric, and `tests/blog-seo.test.ts` fails the build if any article falls below 90. Run `npm run seo:report` to see each article's score and the exact checks that lost points. That number is an on-page audit — the same class of measurement that tools such as Yoast, RankMath or Lighthouse SEO report — computed on the real rendered article rather than asserted.

**Not guaranteed by anyone.** A position in the top five results, or in an AI assistant's answer, cannot be promised. Ranking depends on factors no codebase controls: the age and authority of the domain, who links to it, what competitors publish, how each engine weights freshness and intent, and algorithm changes. Any supplier who promises a fixed position is selling something they cannot deliver. What can be promised is that nothing on the page holds the content back, that the machinery search and answer engines read is complete and correct, and that the content is genuinely worth citing.

**Where this programme can realistically win quickly.** The queries where it holds unusual authority are narrow and under-served: voice AI in Lingala, Kikongo, Kiswahili and Tshiluba; community-health triage by voice in the DRC; low-resource-language corpora; agricultural advisory by voice for Congolese crops. These have low competition and high intent. Broad heads such as "AI" or "digital inclusion" are not winnable and are not targeted.

## 2. On-page machinery implemented

| Element | Where |
|---|---|
| Canonical URL on every page | `alternates.canonical` in each page's `metadata` |
| Open Graph and Twitter cards | root `metadata`, plus per-article overrides |
| Social card image, stable URL | `src/app/opengraph-image.tsx`, `src/app/(public)/blog/[slug]/image.png/route.tsx` |
| `robots.txt` allowing the public site, blocking every route that can show citizen data | `src/app/robots.ts` |
| `sitemap.xml` built from the same arrays as the navigation | `src/app/sitemap.ts` |
| RSS, Atom and JSON Feed (JSON Feed carries full text) | `src/app/(public)/blog/{rss.xml,atom.xml,feed.json}` |
| `llms.txt` and `llms-full.txt` for answer engines | `src/app/llms.txt`, `src/app/llms-full.txt` |
| BlogPosting, BreadcrumbList, FAQPage, SpeakableSpecification, ImageObject, citation, about | `src/app/(public)/blog/[slug]/page.tsx` |
| GovernmentService, WebSite with SearchAction | `src/app/(public)/layout.tsx` |
| Blog, ItemList of posts | `src/app/(public)/blog/page.tsx` |
| Server-rendered HTML — no JavaScript needed to read any article | App Router server components |
| Dynamic internal link graph | `src/server/blog/links.ts` |

## 3. The dynamic link graph

"Many dynamic hyperlinks" is implemented as a graph, not as manual linking. `src/server/blog/links.ts` builds a term table from three sources: a curated map of programme terms to public pages (for example *signes de danger* to `/urgence`), the service vocabulary (*relais communautaire*, *registre des intrants*, *TENAFEP*), and every article's own title, entities and keywords. The renderer then injects contextual links into the article body, with rules that keep the result readable and crawlable:

- text inside links, headings, code, figures and pre-formatted blocks is never touched;
- the longest matching term wins, so *maladie des cultures* is not swallowed by *cultures*;
- each term is linked once per article, each destination at most twice, at most twenty-four links per article;
- an article never links to itself.

On top of that, every article page renders breadcrumbs, a table of contents, previous and next within its topic cluster, and computed related articles scored on shared cluster, entities, keywords, tags and language. Category and tag pages give every term its own indexable hub. The result is that adding one article creates links from and to the rest of the corpus automatically.

## 4. Answer engines and AI assistants

Answer engines reward different things from classic search: content they can parse without executing JavaScript, facts they can attribute, and pages that state clearly what is true and what is uncertain. The implementation targets that directly.

- `/llms.txt` states what the site is, what is authoritative, what must not be misquoted (the pilot figures), and lists every reference page and article with its author, update date and length.
- `/llms-full.txt` carries the full text of every article in one document.
- `/blog/feed.json` carries full text plus the cluster, entities and takeaways as structured fields.
- Every article opens with a *Ce qu'il faut retenir* block, marked `data-speakable` and declared as `SpeakableSpecification`, which is the passage an assistant is most likely to quote.
- Every article carries a named author, a named reviewer, an update date and cited sources — the trust signals that decide whether a model will attribute a claim to you.
- At least one heading per article is phrased as a question, and every article ships a `FAQPage` block, so question-shaped queries match a question-shaped answer.

## 5. What must happen off-site

None of the following can be done from inside the repository, and all of it matters more than any further on-page work.

1. **Own the domain and set `NEXT_PUBLIC_SITE_URL`.** Canonical links, the sitemap and the social cards are only correct once the real origin is configured.
2. **Submit the sitemap** to Google Search Console and Bing Webmaster Tools, and use Bing's IndexNow to push new articles.
3. **Earn links from institutions**: ministries, universities, NGO partners, the open-source and language-technology communities. One link from a ministry or a university outranks a hundred blog comments.
4. **Publish the corpus and the evaluation sets** when the programme decides to. A dataset that researchers cite is the strongest ranking asset this programme can create.
5. **Post on the platforms themselves.** Social search ranks what is published natively on each platform. The repository generates the assets — per-article social cards, takeaway blocks that work as captions, full-text feeds — but a page cannot rank inside TikTok, Instagram or LinkedIn search unless someone posts there.
6. **Keep articles updated.** Freshness is a scored check here and a ranking factor everywhere; the `updatedAt` field is what search engines read.

## 6. Adding an article

Create `content/blog/<slug>.md` with the front matter contract in `src/server/blog/types.ts`, then run `npm run seo:report`. The report names every check that lost a point and why. The suite refuses anything below 90, so an article cannot be published in a state that would hold the site back.
