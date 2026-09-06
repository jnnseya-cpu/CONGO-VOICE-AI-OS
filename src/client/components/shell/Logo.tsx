/** Wordmark: sound-bar mark + name + DRC flag, as in the product design. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true">
        <rect x="0" y="12" width="4" height="10" rx="2" fill="#f59e0b" />
        <rect x="6.5" y="6" width="4" height="22" rx="2" fill="#22c55e" />
        <rect x="13" y="1" width="4" height="32" rx="2" fill="#3b82f6" />
        <rect x="19.5" y="8" width="4" height="18" rx="2" fill="#a855f7" />
        <rect x="26" y="13" width="4" height="8" rx="2" fill="#ef4444" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[1.05rem] font-extrabold tracking-tight text-white">CONGO</div>
          <div className="text-[0.95rem] font-bold tracking-tight text-white/95">VOICE AI OS</div>
        </div>
      )}
      {!compact && <DrcFlag />}
    </div>
  );
}

export function DrcFlag({ size = 34 }: { size?: number }) {
  // Flag of the Democratic Republic of the Congo (sky blue, diagonal red band with yellow fimbriation, yellow star).
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-label="Drapeau de la RDC" style={{ transform: "rotate(-8deg)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" }}>
      <defs>
        <clipPath id="flagClip">
          <path d="M3 0h35a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a3 3 0 0 1 3-4Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#flagClip)">
        <rect width="40" height="30" fill="#007fff" />
        <polygon points="0,30 0,22 40,0 40,8" fill="#f7d618" />
        <polygon points="0,30 0,24.5 40,2.5 40,8" fill="#ce1021" />
        <polygon points="0,30 40,8 40,10 0,32" fill="#f7d618" />
        <polygon points="7,3.5 8.9,8.5 14.2,8.5 10,11.6 11.6,16.6 7,13.6 2.4,16.6 4,11.6 -0.2,8.5 5.1,8.5" fill="#f7d618" />
      </g>
    </svg>
  );
}
