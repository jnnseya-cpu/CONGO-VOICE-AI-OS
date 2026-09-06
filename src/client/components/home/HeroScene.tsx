/**
 * Photographic hero backdrop. When public/hero/congo-river.jpg exists it is used (drop in a
 * licensed photograph of the Congo river at sunset); otherwise a layered, textured vector
 * landscape renders so the page never shows a broken image.
 */
export function HeroScene({ photo }: { photo: boolean }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/hero/congo-river.jpg" alt="Le fleuve Congo au coucher du soleil" className="absolute inset-0 h-full w-full object-cover object-center" loading="eager" />
    );
  }
  const trees: Array<[number, number, number]> = [
    [30, 322, 24], [62, 314, 30], [98, 324, 20], [135, 316, 26], [172, 326, 18], [210, 318, 24], [246, 324, 20], [282, 320, 16],
    [700, 320, 18], [735, 312, 26], [772, 322, 20], [810, 314, 28], [850, 320, 20], [885, 326, 16],
  ];
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173263" />
          <stop offset="0.32" stopColor="#4b628f" />
          <stop offset="0.52" stopColor="#b98a67" />
          <stop offset="0.66" stopColor="#e9a85b" />
          <stop offset="0.78" stopColor="#f7c56d" />
          <stop offset="1" stopColor="#fbe0a0" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="0.72" cy="0.49" r="0.42">
          <stop offset="0" stopColor="#fff7e0" stopOpacity="1" />
          <stop offset="0.18" stopColor="#ffd98a" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#f6a54a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f6a54a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0b76b" />
          <stop offset="0.22" stopColor="#c8956a" />
          <stop offset="0.55" stopColor="#6f7a8c" />
          <stop offset="1" stopColor="#2b3950" />
        </linearGradient>
        <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b9bb5" />
          <stop offset="1" stopColor="#5b6d8a" />
        </linearGradient>
        <linearGradient id="hillMid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f6f57" />
          <stop offset="1" stopColor="#2c4636" />
        </linearGradient>
        <linearGradient id="bank" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3627" />
          <stop offset="1" stopColor="#0d1a13" />
        </linearGradient>
        <filter id="clouds" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.035" numOctaves="4" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 0.86  0 0 0 0 0.66  0 0 0 1.6 -0.75" />
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <filter id="ripple" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.02 0.2" numOctaves="2" seed="3" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="haze" x="0" y="0" width="100%" height="100%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <radialGradient id="vig" cx="0.5" cy="0.5" r="0.8">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </radialGradient>
      </defs>

      <rect width="900" height="420" fill="url(#sky)" />
      {/* cloud texture, denser near the horizon */}
      <rect width="900" height="300" filter="url(#clouds)" opacity="0.55" />
      <rect y="150" width="900" height="130" filter="url(#clouds)" opacity="0.35" />
      {/* sun */}
      <circle cx="650" cy="205" r="170" fill="url(#sunGlow)" />
      <circle cx="650" cy="205" r="30" fill="#fff3cf" filter="url(#glow)" />
      <circle cx="650" cy="205" r="21" fill="#fffaf0" />
      {/* atmospheric hills */}
      <path d="M0 250 C120 216 180 242 300 224 C420 206 470 236 560 220 C650 202 720 232 900 206 L900 300 L0 300 Z" fill="url(#hillFar)" opacity="0.85" filter="url(#haze)" />
      <path d="M0 268 C90 250 150 270 230 258 C310 246 350 268 430 262 C520 255 560 276 640 262 C720 250 790 272 900 250 L900 320 L0 320 Z" fill="url(#hillMid)" />
      {/* river */}
      <g>
        <path d="M0 420 L0 300 C160 292 280 306 420 298 C560 290 700 302 900 292 L900 420 Z" fill="url(#water)" />
        <g filter="url(#ripple)" opacity="0.85">
          <path d="M560 300 L740 300 L800 420 L500 420 Z" fill="#f4b464" opacity="0.28" filter="url(#soft)" />
          {Array.from({ length: 18 }).map((_, i) => (
            <rect key={i} x={640 - i * 5 - Math.sin(i) * 6} y={304 + i * 6.3} width={30 + i * 9} height={1.8} fill="#ffdc9a" opacity={0.6 - i * 0.028} />
          ))}
        </g>
        {/* hill reflections */}
        <path d="M0 300 C160 292 280 306 420 298 C560 290 700 302 900 292 L900 330 C700 336 560 326 420 332 C280 340 160 328 0 336 Z" fill="#2f4b3a" opacity="0.28" filter="url(#soft)" />
      </g>
      {/* near banks */}
      <path d="M0 332 C60 324 110 338 170 328 C230 318 260 336 320 330 L320 420 L0 420 Z" fill="url(#bank)" />
      <path d="M900 322 C860 314 820 332 780 324 C740 316 720 334 690 332 L690 420 L900 420 Z" fill="url(#bank)" />
      {/* trees */}
      {trees.map(([x, y, h], i) => (
        <g key={i} fill="#0b1712">
          <rect x={x - 1.3} y={y} width={2.6} height={h} />
          <ellipse cx={x} cy={y - 2} rx={h * 0.55} ry={h * 0.42} />
          <ellipse cx={x - h * 0.32} cy={y + 4} rx={h * 0.36} ry={h * 0.25} />
          <ellipse cx={x + h * 0.3} cy={y + 3} rx={h * 0.36} ry={h * 0.26} />
        </g>
      ))}
      {/* palms */}
      {[[120, 296, 1], [800, 292, 0.9]].map(([x, y, s], i) => (
        <g key={i} fill="#0b1712" transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M0 42 C2 22 4 10 8 0 L10 1 C6 12 4 22 3 42 Z" />
          {[-75, -45, -15, 15, 45, 75].map((a) => (
            <path key={a} d="M9 0 C 18 -14 34 -18 48 -10 C 32 -12 20 -6 9 2 Z" transform={`rotate(${a} 9 0)`} />
          ))}
        </g>
      ))}
      {/* pirogue */}
      <g transform="translate(468 352)" fill="#0d151c">
        <path d="M0 6 C10 10 50 10 60 6 L54 10 C40 13 20 13 6 10 Z" />
        <rect x="30" y="-10" width="1.6" height="16" />
        <path d="M31 -10 L29 -4 L33 -4 Z" />
        <path d="M2 12 C12 15 48 15 58 12" stroke="#f4c27a" strokeWidth="0.8" opacity="0.5" fill="none" />
      </g>
      <rect width="900" height="420" fill="url(#vig)" />
    </svg>
  );
}
