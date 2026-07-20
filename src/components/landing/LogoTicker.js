"use client";

const LOGOS = [
  { name: "Flux", color: "#A78BFA" },
  { name: "Midjourney", color: "#FF1B6B" },
  { name: "Sora", color: "#00E5FF" },
  { name: "Kling", color: "#FF6B35" },
  { name: "Veo", color: "#34D399" },
  { name: "Runway", color: "#F59E0B" },
  { name: "GPT-4o", color: "#10B981" },
  { name: "Seedream", color: "#EC4899" },
  { name: "LTX", color: "#8B5CF6" },
  { name: "Wan", color: "#F97316" },
  { name: "LatentSync", color: "#06B6D4" },
  { name: "Bark", color: "#EF4444" },
  { name: "MusicGen", color: "#8B5CF6" },
  { name: "Ideogram", color: "#6366F1" },
  { name: "Recraft", color: "#14B8A6" },
  { name: "Imagen", color: "#3B82F6" },
  { name: "Luma", color: "#F472B6" },
  { name: "MiniMax", color: "#A3E635" },
];

function LogoTrack({ logos }) {
  return (
    <div className="logo-ticker__track">
      {logos.map((logo) => (
        <span key={logo.name} className="logo-ticker__item" style={{ color: logo.color }}>
          <span className="logo-ticker__dot" style={{ background: logo.color }} />
          {logo.name}
        </span>
      ))}
    </div>
  );
}

export default function LogoTicker() {
  return (
    <div className="logo-ticker">
      <LogoTrack logos={LOGOS} />
      <LogoTrack logos={LOGOS} />
    </div>
  );
}
