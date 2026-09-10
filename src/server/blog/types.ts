import type { LanguageCode } from "@server/db/schema";

/** A frequently asked question rendered on the page and emitted as FAQPage structured data. */
export interface PostFaq {
  q: string;
  a: string;
}

export interface PostSource {
  label: string;
  url: string;
}

/** Front matter contract for `content/blog/*.md`. Every field drives SEO output. */
export interface PostFrontMatter {
  slug: string;
  title: string;
  description: string;
  lang: "fr" | "en";
  category: string;
  /** Topic cluster identifier; a pillar and its spokes share one cluster. */
  cluster: string;
  pillar: boolean;
  publishedAt: string;
  updatedAt: string;
  author: string;
  authorRole: string;
  reviewer?: string;
  reviewerRole?: string;
  /** First keyword is the primary target query. */
  keywords: string[];
  /** Named entities the post is about; used by the internal link graph. */
  entities: string[];
  tags: string[];
  imageAlt: string;
  takeaways: string[];
  faq: PostFaq[];
  sources: PostSource[];
  /** Slugs of posts to link explicitly, in addition to the computed ones. */
  related: string[];
  /** Optional language of the service this post is about, for hreflang-style hints. */
  serviceLanguage?: LanguageCode;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface PostLinkRef {
  href: string;
  text: string;
  external: boolean;
}

export interface Post extends PostFrontMatter {
  /** Rendered HTML, after dynamic internal links have been injected. */
  html: string;
  /** Plain text of the body, used for scoring and for the AI-readable feed. */
  text: string;
  markdown: string;
  headings: Heading[];
  links: PostLinkRef[];
  wordCount: number;
  readingMinutes: number;
  checksum: string;
}

export interface ScoreCheck {
  id: string;
  group: string;
  label: string;
  points: number;
  earned: number;
  detail: string;
}

export interface PostScore {
  slug: string;
  total: number;
  max: number;
  checks: ScoreCheck[];
  failures: ScoreCheck[];
}
