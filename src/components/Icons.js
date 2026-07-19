// Ultra-light, precise line icons (strokeWidth 1) — replaces banned FontAwesome/Lucide thick icons.
// Each icon inherits `currentColor` and accepts a `className` for sizing.

const base = (props) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...props,
});

export const IconImage = (p) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
);
export const IconVideo = (p) => (
  <svg {...base(p)}><rect x="2" y="5" width="14" height="14" rx="3" /><path d="M16 10l5-3v10l-5-3" /></svg>
);
export const IconMusic = (p) => (
  <svg {...base(p)}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
);
export const IconCamera = (p) => (
  <svg {...base(p)}><path d="M3 7h3l2-2h8l2 2h3v12H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconFilm = (p) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" /></svg>
);
export const IconCut = (p) => (
  <svg {...base(p)}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 8l12 8M8 16l12-8" /></svg>
);
export const IconMegaphone = (p) => (
  <svg {...base(p)}><path d="M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M18 8a4 4 0 0 1 0 8" /></svg>
);
export const IconMic = (p) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconUsers = (p) => (
  <svg {...base(p)}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 5a3 3 0 0 1 0 6M21 20c0-2-1-3.5-3-4.5" /></svg>
);
export const IconCrown = (p) => (
  <svg {...base(p)}><path d="M3 7l4 5 5-7 5 7 4-5v11H3z" /></svg>
);
export const IconArrowUpRight = (p) => (
  <svg {...base(p)}><path d="M7 17L17 7M9 7h8v8" /></svg>
);
export const IconArrowRight = (p) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconPlay = (p) => (
  <svg {...base(p)}><path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none" /></svg>
);
export const IconPause = (p) => (
  <svg {...base(p)}><rect x="7" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none" /></svg>
);
export const IconCheck = (p) => (
  <svg {...base(p)}><path d="M4 12l5 5L20 6" /></svg>
);
export const IconMenu = (p) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconClose = (p) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconBolt = (p) => (
  <svg {...base(p)}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
);
export const IconMail = (p) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
);
export const IconSparkle = (p) => (
  <svg {...base(p)}><path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" /></svg>
);
export const IconSearch = (p) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></svg>
);
export const IconDownload = (p) => (
  <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
);
export const IconExternal = (p) => (
  <svg {...base(p)}><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" /></svg>
);
export const IconStar = (p) => (
  <svg {...base(p)}><path d="M12 3l2.7 6.3 6.8.7-5 4.8 1.4 6.7L12 18l-6 3.5 1.4-6.7-5-4.8 6.8-.7z" /></svg>
);
export const IconChevron = (p) => (
  <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconEye = (p) => (
  <svg {...base(p)}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconEyeOff = (p) => (
  <svg {...base(p)}><path d="M3 3l18 18M10.5 5.2A9 9 0 0 1 12 5c6 0 10 7 10 7a13 13 0 0 1-2.5 3.2M6 7.5C3.5 9.5 2 12 2 12s4 7 10 7a9 9 0 0 0 4-.9M9.5 9.5a3 3 0 0 0 4 4" /></svg>
);
export const IconGoogle = (p) => (
  <svg width="18" height="18" viewBox="0 0 18 18" {...p}>
    <path fill="#EA4335" d="M9 3.5c1.9 0 3.6.7 4.9 1.8l2.3-2.3C14.3 1.1 11.8 0 9 0 5.5 0 2.4 2 .9 4.9l2.7 2.1C4.3 5 6.5 3.5 9 3.5z"/>
    <path fill="#4285F4" d="M17.6 9.2c0-.7-.1-1.3-.2-2H9v3.8h4.8c-.2 1.1-.8 2-1.8 2.6l2.7 2.1c1.6-1.5 2.9-3.7 2.9-6.5z"/>
    <path fill="#FBBC05" d="M3.6 10.7c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2L.9 4.6C.3 5.8 0 7.1 0 8.7s.3 2.9.9 4.1l2.7-2.1z"/>
    <path fill="#34A853" d="M9 17.5c2.4 0 4.5-.8 6-2.2l-2.7-2.1c-.8.5-1.8.9-3.3.9-2.5 0-4.7-1.5-5.4-3.6L.9 12.6C2.4 15.5 5.5 17.5 9 17.5z"/>
  </svg>
);