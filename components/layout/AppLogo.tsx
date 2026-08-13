export function AppLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 56"
      width={size}
      height={Math.round(size * 56 / 48)}
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* Clipboard body */}
      <rect x="2" y="8" width="44" height="46" rx="4" fill="#1B3A5C" />

      {/* Clip base plate */}
      <rect x="16" y="4" width="16" height="10" rx="3" fill="#3B82F6" />
      {/* Clip top ring */}
      <rect x="20" y="1.5" width="8" height="5" rx="2" fill="#3B82F6" />
      {/* Clip highlight */}
      <rect x="16" y="8" width="16" height="2" rx="1" fill="#2563EB" />

      {/* Paper */}
      <rect x="7" y="15" width="34" height="34" rx="2" fill="white" />

      {/* Graph axes */}
      <line x1="13" y1="42" x2="13" y2="22" stroke="#1B3A5C" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="42" x2="36" y2="42" stroke="#1B3A5C" strokeWidth="1.5" strokeLinecap="round" />

      {/* Graph line */}
      <polyline
        points="13,38 19,33 25,35 31,27 36,22"
        fill="none"
        stroke="#0EA5E9"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data point dots */}
      <circle cx="13" cy="38" r="1.8" fill="#0EA5E9" />
      <circle cx="19" cy="33" r="1.8" fill="#0EA5E9" />
      <circle cx="25" cy="35" r="1.8" fill="#0EA5E9" />
      <circle cx="31" cy="27" r="1.8" fill="#0EA5E9" />
      <circle cx="36" cy="22" r="1.8" fill="#0EA5E9" />
    </svg>
  );
}
