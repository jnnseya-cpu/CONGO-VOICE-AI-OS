import { ImageResponse } from "next/og";
import { SITE } from "@shared/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE.name} — ${SITE.shortDescription}`;

/** Social preview card. Rendered at build/request time; no external assets. */
export default function TwitterImage() {
  const bars = [
    { x: 0, y: 46, h: 38, c: "#f59e0b" },
    { x: 26, y: 22, h: 86, c: "#22c55e" },
    { x: 52, y: 2, h: 126, c: "#3b82f6" },
    { x: 78, y: 30, h: 70, c: "#a855f7" },
    { x: 104, y: 50, h: 30, c: "#ef4444" },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b1220", color: "#fff", padding: "72px 80px", justifyContent: "space-between", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", position: "relative", width: 134, height: 130 }}>
            {bars.map((b) => (
              <div key={b.x} style={{ position: "absolute", left: b.x, top: b.y, width: 18, height: b.h, borderRadius: 9, background: b.c }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: -1.5 }}>CONGO</div>
            <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1.2, opacity: 0.95 }}>VOICE AI OS</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.15, letterSpacing: -1, maxWidth: 900 }}>Parlez. Nous écoutons. Nous comprenons. Nous agissons.</div>
          <div style={{ fontSize: 25, lineHeight: 1.4, color: "rgba(255,255,255,0.72)", maxWidth: 900 }}>
            Santé, agriculture et éducation par la voix — en français, lingala, kikongo, kiswahili et tshiluba. Service public gratuit, République Démocratique du Congo.
          </div>
        </div>
        <div style={{ display: "flex", height: 10, width: "100%" }}>
          <div style={{ flex: 1, background: "#007fff" }} />
          <div style={{ flex: 1, background: "#f7d618" }} />
          <div style={{ flex: 1, background: "#ce1021" }} />
        </div>
      </div>
    ),
    size,
  );
}
