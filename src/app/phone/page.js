"use client";

import "@/styles/phone-studio.css";
import { PhoneShell } from "@/components/phone";

/* ── Inline tool icons ── */
const svg = (d) => (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const TOOLS = [
  { id: "image", label: "Image", Icon: svg("M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z") },
  { id: "video", label: "Video", Icon: svg(["M23 7l-7 5 7 5V7z", "M14 5H3a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2z"]) },
  { id: "canvas", label: "Canvas", Icon: svg(["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"]) },
  { id: "audio", label: "Audio", Icon: svg(["M9 18V5l12-2v13", "M9 9a3 3 0 100 6 3 3 0 000-6z"]) },
  { id: "director", label: "Director", Icon: svg(["M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z", "M12 9a4 4 0 100 8 4 4 0 000-8z"]) },
  { id: "influencer", label: "Avatar", Icon: svg(["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 3a4 4 0 100 8 4 4 0 000-8z"]) },
  { id: "workflows", label: "Workflows", Icon: svg(["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"]) },
  { id: "brands", label: "Brands", Icon: svg(["M12 2L2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"]) },
];

export default function PhonePage() {
  return <PhoneShell tools={TOOLS} initialTool="image" />;
}
