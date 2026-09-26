/**
 * A trend over time, as an inline SVG.
 *
 * No chart library: the platform is used on feature phones over slow links, and
 * a charting bundle costs more to download than every dashboard on this service
 * puts together. An SVG the server already rendered costs nothing extra.
 *
 * Accessibility is the harder half and the reason this is a component rather
 * than markup copied per page. A line on its own is invisible to a screen
 * reader and to anybody who cannot distinguish the colour, so every chart here
 * carries a text summary naming the direction and the extremes, and a table
 * that holds the same numbers.
 */

export interface TrendPoint {
  label: string;
  value: number;
}

function path(points: TrendPoint[], width: number, height: number, pad: number) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const coords = points.map((p, i) => ({ x: pad + i * step, y: y(p.value) }));
  return {
    line: coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" "),
    area: `${coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ")} L${(pad + (points.length - 1) * step).toFixed(1)} ${height - pad} L${pad} ${height - pad} Z`,
    coords,
    max,
  };
}

const TONES = {
  brand: "var(--brand)",
  health: "var(--health)",
  agri: "var(--agri)",
  danger: "var(--danger)",
  warn: "var(--warn)",
} as const;

export function Trend({
  points,
  tone = "brand",
  unit = "",
  caption,
}: {
  points: TrendPoint[];
  tone?: keyof typeof TONES;
  /** Appended to every number in the text summary: "cas", "%", "min". */
  unit?: string;
  caption: string;
}) {
  if (points.length < 2) {
    return <p className="px-5 py-6 text-[13px] text-muted">Pas encore assez de mesures pour tracer une tendance.</p>;
  }

  const width = 560;
  const height = 120;
  const pad = 8;
  const { line, area, coords, max } = path(points, width, height, pad);
  const colour = TONES[tone];

  const first = points[0];
  const last = points[points.length - 1];
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const change = last.value - first.value;
  const direction = change > 0 ? "en hausse" : change < 0 ? "en baisse" : "stable";

  // The sentence a screen reader hears, and the one a sighted reader can check
  // the line against. Both need the same facts.
  const summary = `${caption} : ${direction}, de ${first.value}${unit} le ${first.label} à ${last.value}${unit} le ${last.label}. Maximum ${peak.value}${unit} le ${peak.label}.`;

  return (
    <figure className="px-5 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[120px] w-full"
        role="img"
        aria-label={summary}
        preserveAspectRatio="none"
      >
        <path d={area} fill={colour} opacity="0.1" />
        <path d={line} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* The last point is marked because "where are we now" is the question. */}
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3.5" fill={colour} />
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-[12.5px] text-muted">
        <span>
          {first.label} → {last.label}
        </span>
        <span>
          Maximum {peak.value}
          {unit}
        </span>
      </figcaption>

      {/* The same numbers, reachable without seeing the line. Collapsed so it
          does not crowd the page, but present rather than optional. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[12.5px] text-muted">Voir les valeurs</summary>
        <table className="mt-2 w-full text-[12.5px]">
          <caption className="sr-only">{summary}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line py-1 text-left font-semibold text-ink-2">Période</th>
              <th scope="col" className="border-b border-line py-1 text-right font-semibold text-ink-2">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <td className="border-b border-line py-1 text-ink-2">{p.label}</td>
                <td className="border-b border-line py-1 text-right text-ink-2">
                  {p.value}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="sr-only">Échelle maximale {max}{unit}.</p>
    </figure>
  );
}
