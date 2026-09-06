/**
 * Photographic hero backdrop. When public/hero/congo-river.jpg exists it is used (drop in a
 * licensed photograph of the Congo river); otherwise a layered vector landscape renders,
 * so the page never shows a broken image.
 */
export function HeroScene({ photo }: { photo: boolean }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/hero/congo-river.jpg" alt="Le fleuve Congo au coucher du soleil" className="absolute inset-0 h-full w-full object-cover object-center" loading="eager" />
    );
  }
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3566" />
          <stop offset="0.35" stopColor="#5a6f9a" />
          <stop offset="0.58" stopColor="#d99a5a" />
          <stop offset="0.75" stopColor="#f6b95e" />
          <stop offset="1" stopColor="#fbd98a" />
        </linearGradient>
        <radialGradient id="sun" cx="0.72" cy="0.5" r="0.35">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="1" />
          <stop offset="0.25" stopColor="#ffd27a" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#f39a3e" stopOpacity="0.25" />
          <stop offset="1" stopColor="#f39a3e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3b96a" />
          <stop offset="0.3" stopColor="#b9885f" />
          <stop offset="0.7" stopColor="#4d5a6b" />
          <stop offset="1" stopColor="#25324a" />
        </linearGradient>
        <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a8aa3" />
          <stop offset="1" stopColor="#465872" />
        </linearGradient>
        <linearGradient id="hillNear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f3a2b" />
          <stop offset="1" stopColor="#0f1d17" />
        </linearGradient>
        <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width="900" height="420" fill="url(#sky)" />
      <circle cx="650" cy="205" r="150" fill="url(#sun)" />
      <circle cx="650" cy="205" r="26" fill="#fff6dc" filter="url(#glow)" />
      <circle cx="650" cy="205" r="20" fill="#fffaf0" />
      {/* distant haze clouds */}
      <g opacity="0.35" filter="url(#soft)">
        <ellipse cx="180" cy="120" rx="140" ry="18" fill="#ffd9a8" />
        <ellipse cx="420" cy="90" rx="110" ry="12" fill="#f6c39a" />
        <ellipse cx="760" cy="140" rx="120" ry="14" fill="#ffe0b8" />
      </g>
      {/* far hills */}
      <path d="M0 250 C120 215 180 240 300 222 C420 205 470 235 560 218 C650 200 720 230 900 205 L900 300 L0 300 Z" fill="url(#hillFar)" opacity="0.9" />
      {/* mid forest ridge */}
      <path d="M0 268 C90 250 150 270 230 258 C310 246 350 268 430 262 C520 255 560 276 640 262 C720 250 790 272 900 250 L900 320 L0 320 Z" fill="#2f5a3d" />
      {/* river */}
      <path d="M0 420 L0 300 C160 292 280 306 420 298 C560 290 700 302 900 292 L900 420 Z" fill="url(#water)" />
      {/* sun reflection */}
      <g opacity="0.75">
        <path d="M600 300 L700 300 L740 420 L560 420 Z" fill="#f2a24a" opacity="0.25" filter="url(#soft)" />
        {Array.from({ length: 14 }).map((_, i) => (
          <rect key={i} x={630 - i * 4} y={306 + i * 8} width={40 + i * 8} height={2.2} fill="#ffd28a" opacity={0.55 - i * 0.03} />
        ))}
      </g>
      {/* near banks with trees */}
      <path d="M0 330 C60 322 110 336 170 326 C230 316 260 334 320 328 L320 420 L0 420 Z" fill="url(#hillNear)" />
      <path d="M900 320 C860 312 820 330 780 322 C740 314 720 332 690 330 L690 420 L900 420 Z" fill="url(#hillNear)" />
      {/* tree silhouettes */}
      {[
        [40, 318, 22], [78, 312, 26], [120, 320, 18], [160, 314, 24], [205, 322, 16], [250, 316, 22], [292, 320, 18],
        [720, 316, 20], [760, 310, 26], [800, 318, 18], [845, 312, 24], [880, 320, 16],
      ].map(([x, y, h], i) => (
        <g key={i} fill="#0b1712">
          <rect x={x - 1.2} y={y} width={2.4} height={h} />
          <ellipse cx={x} cy={y - 2} rx={h * 0.55} ry={h * 0.42} />
          <ellipse cx={x - h * 0.3} cy={y + 4} rx={h * 0.35} ry={h * 0.25} />
          <ellipse cx={x + h * 0.3} cy={y + 3} rx={h * 0.35} ry={h * 0.26} />
        </g>
      ))}
      {/* palm on the near-left bank */}
      <g fill="#0b1712" transform="translate(130 300)">
        <path d="M0 40 C2 20 4 10 8 0 L10 1 C6 12 4 22 3 40 Z" />
        {[-70, -40, -10, 20, 50, 80].map((a) => (
          <path key={a} d="M9 0 C 18 -14 34 -18 46 -10 C 32 -12 20 -6 9 2 Z" transform={`rotate(${a} 9 0)`} />
        ))}
      </g>
      {/* fisherman pirogue */}
      <g transform="translate(470 352)" fill="#0d151c">
        <path d="M0 6 C10 10 50 10 60 6 L54 10 C40 13 20 13 6 10 Z" />
        <rect x="30" y="-10" width="1.6" height="16" />
        <path d="M31 -10 L29 -4 L33 -4 Z" />
      </g>
      {/* vignette */}
      <rect width="900" height="420" fill="url(#vig)" />
      <defs>
        <radialGradient id="vig" cx="0.5" cy="0.5" r="0.8">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
      </defs>
    </svg>
  );
}
