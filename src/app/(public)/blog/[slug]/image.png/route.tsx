import { ImageResponse } from "next/og";
import { allPosts, getPost } from "@server/blog/index";
import { SITE } from "@shared/site";

const size = { width: 1200, height: 630 };

export async function generateStaticParams() {
  return (await allPosts()).map((p) => ({ slug: p.slug }));
}

/**
 * Per-article social card at a stable, shareable address, so the same image can be used by
 * the social tags, the structured data and the press kit.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  const title = post?.title ?? SITE.name;
  const category = post?.category ?? "Blog";
  const author = post ? `${post.author} · ${post.readingMinutes} min` : SITE.operator;
  const fontSize = title.length > 90 ? 44 : title.length > 60 ? 52 : 60;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b1220", color: "#fff", padding: "64px 72px", justifyContent: "space-between", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", position: "relative", width: 84, height: 78 }}>
            {[
              { x: 0, y: 28, h: 22, c: "#f59e0b" },
              { x: 17, y: 14, h: 50, c: "#22c55e" },
              { x: 34, y: 2, h: 74, c: "#3b82f6" },
              { x: 51, y: 18, h: 42, c: "#a855f7" },
              { x: 68, y: 30, h: 18, c: "#ef4444" },
            ].map((b) => (
              <div key={b.x} style={{ position: "absolute", left: b.x, top: b.y, width: 11, height: b.h, borderRadius: 6, background: b.c }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>CONGO VOICE AI OS</div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>{category}</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize, fontWeight: 600, lineHeight: 1.16, letterSpacing: -1.4, maxWidth: 1010 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 22, color: "rgba(255,255,255,0.68)" }}>
          <div style={{ display: "flex" }}>{author}</div>
          <div style={{ display: "flex" }}>congovoice.cd/blog</div>
        </div>
        <div style={{ display: "flex", height: 9, width: "100%" }}>
          <div style={{ flex: 1, background: "#007fff" }} />
          <div style={{ flex: 1, background: "#f7d618" }} />
          <div style={{ flex: 1, background: "#ce1021" }} />
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
