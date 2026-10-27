import { useState } from "react";

// Coach portrait: a photo from public/coaches/<id>.jpg (or .png) when present, else a flat illustrated bust.
const missing = new Set();
export default function Avatar({ coach, size = 120, talking = false }) {
  const [, redraw] = useState(0);
  const src = ["jpg", "png"].map((ext) => `coaches/${coach.id}.${ext}`).find((u) => !missing.has(u));
  if (src) return (
    <img className={`avatar photo ${talking ? "talking" : ""}`} src={src} width={size} height={size} alt={`${coach.name}, ${coach.role}`}
      style={{ "--cc": coach.color }} onError={() => { missing.add(src); redraw((n) => n + 1); }} />
  );
  return <Drawn coach={coach} size={size} talking={talking} />;
}

function Drawn({ coach, size, talking }) {
  const { skin, hair, hairStyle, shirt, prop } = coach.look;
  const hairPath = {
    buzz: "M62 52 Q100 22 138 52 Q136 40 100 34 Q64 40 62 52Z",
    bob: "M58 70 Q56 30 100 28 Q144 30 142 70 L142 96 Q136 84 134 64 Q100 50 66 64 Q64 84 58 96Z",
    swept: "M60 58 Q66 26 108 28 Q142 32 140 60 Q120 44 92 46 Q72 48 60 58Z",
    pony: "M60 64 Q60 28 100 28 Q140 28 140 64 Q126 46 100 46 Q74 46 60 64Z M136 56 Q160 70 150 104 Q146 82 132 72Z",
  }[hairStyle];
  return (
    <svg className={`avatar ${talking ? "talking" : ""}`} viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`${coach.name}, ${coach.role}`}>
      <circle cx="100" cy="100" r="98" fill="#111A20" />
      <circle cx="100" cy="100" r="98" fill="none" stroke={coach.color} strokeWidth="4" opacity=".8" />
      <clipPath id={`clip-${coach.id}`}><circle cx="100" cy="100" r="96" /></clipPath>
      <g clipPath={`url(#clip-${coach.id})`}>
        <path d="M30 200 Q34 146 100 140 Q166 146 170 200Z" fill={shirt} />
        <rect x="88" y="116" width="24" height="30" rx="10" fill={skin} />
        <ellipse cx="100" cy="78" rx="38" ry="44" fill={skin} />
        <path d={hairPath} fill={hair} />
        <circle cx="86" cy="80" r="4" fill="#1A1412" />
        <circle cx="114" cy="80" r="4" fill="#1A1412" />
        <path className="mouth" d="M88 100 Q100 110 112 100" fill="none" stroke="#5A2E24" strokeWidth="4" strokeLinecap="round" />
        {prop === "glasses" && <g fill="none" stroke="#EEF1F2" strokeWidth="3"><circle cx="86" cy="80" r="11" /><circle cx="114" cy="80" r="11" /><path d="M97 80h6" /></g>}
        {prop === "band" && <path d="M62 56 Q100 42 138 56 L138 64 Q100 50 62 64Z" fill="#F2E6C9" />}
        {prop === "whistle" && <g><path d="M78 140 L100 168 L122 140" fill="none" stroke="#F2E6C9" strokeWidth="3" /><rect x="94" y="164" width="16" height="10" rx="4" fill="#F2D46B" /></g>}
        {prop === "racket" && <g transform="translate(148 132) rotate(25)"><ellipse cx="0" cy="-30" rx="18" ry="24" fill="none" stroke="#EEF1F2" strokeWidth="4" /><rect x="-3" y="-6" width="6" height="40" rx="3" fill="#EEF1F2" /></g>}
      </g>
    </svg>
  );
}
