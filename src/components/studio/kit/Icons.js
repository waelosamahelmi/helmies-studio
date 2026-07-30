/* ══════════════════════════════════════════════════════════════════════════
   STUDIO ICON SET
   One grid (24), one stroke (1.6), round caps. Icons are drawn, not shaded —
   they sit next to mono readouts so they must feel machined, not friendly.
   ══════════════════════════════════════════════════════════════════════════ */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const make = (path, extra) => {
  const C = ({ className = "hs-icon", ...rest }) => (
    <svg {...base} {...extra} className={className} aria-hidden="true" {...rest}>
      {path}
    </svg>
  );
  return C;
};

/* ── Instruments ────────────────────────────────────────────────────────── */
export const IcImage = make(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>);
export const IcVideo = make(<><rect x="2" y="5" width="14" height="14" rx="2" /><path d="M16 10l6-3v10l-6-3z" /></>);
export const IcFilm = make(<><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" /></>);
export const IcCamera = make(<><path d="M3 9a2 2 0 012-2h2l1.5-2h7L17 7h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="3.5" /></>);
export const IcMusic = make(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>);
export const IcMic = make(<><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8" /></>);
export const IcScissors = make(<><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" /></>);
export const IcMegaphone = make(<><path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" /><path d="M15 8.5a4 4 0 010 7M18 6a7.5 7.5 0 010 12" /></>);
export const IcPersona = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" /></>);
export const IcSwap = make(<><path d="M4 8h13l-3-3M20 16H7l3 3" /></>);
export const IcLayers = make(<><path d="M12 2l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></>);
export const IcFlow = make(<><rect x="3" y="3" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /><path d="M6.5 9v4a2 2 0 002 2h9" /></>);
export const IcPalette = make(<><path d="M12 3a9 9 0 100 18 2 2 0 001.6-3.2 2 2 0 011.6-3.2H18a3 3 0 003-3 9 9 0 00-9-8.6z" /><circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" /></>);
export const IcArchive = make(<><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M10 13h4" /></>);
export const IcSpark = make(<><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.4L12 3z" /><path d="M18.5 3.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z" /></>);
export const IcBrain = make(<><path d="M9.5 4a2.5 2.5 0 00-2.5 2.5A2.5 2.5 0 004.5 9v1.5A2.5 2.5 0 007 13v2a2.5 2.5 0 002.5 2.5H12V4H9.5z" /><path d="M14.5 4a2.5 2.5 0 012.5 2.5A2.5 2.5 0 0119.5 9v1.5A2.5 2.5 0 0117 13v2a2.5 2.5 0 01-2.5 2.5H12V4h2.5z" /><path d="M12 17.5V21" /></>);
export const IcGrid = make(<><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>);

/* ── Actions ────────────────────────────────────────────────────────────── */
export const IcBolt = make(<><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></>);
export const IcDownload = make(<><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></>);
export const IcUpload = make(<><path d="M12 16V4M7.5 8.5L12 4l4.5 4.5" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></>);
export const IcRefresh = make(<><path d="M20 11a8 8 0 10-1.6 5.4" /><path d="M20 4v6h-6" /></>);
export const IcClose = make(<><path d="M18 6L6 18M6 6l12 12" /></>);
export const IcPlus = make(<><path d="M12 5v14M5 12h14" /></>);
export const IcMinus = make(<><path d="M5 12h14" /></>);
export const IcCheck = make(<><path d="M20 6L9 17l-5-5" /></>);
export const IcSearch = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>);
export const IcSettings = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 004.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" /></>);
export const IcMenu = make(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const IcChevron = make(<><path d="M6 9l6 6 6-6" /></>);
export const IcChevronLeft = make(<><path d="M15 18l-6-6 6-6" /></>);
export const IcChevronRight = make(<><path d="M9 6l6 6-6 6" /></>);
export const IcExternal = make(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></>);
export const IcTrash = make(<><path d="M4 7h16M10 4h4M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M10 11v6M14 11v6" /></>);
export const IcCopy = make(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" /></>);
export const IcEye = make(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>);
export const IcEyeOff = make(<><path d="M10.6 6.2A9.9 9.9 0 0112 6c6.5 0 10 6 10 6a17.6 17.6 0 01-3.2 4M6.6 6.6A17.7 17.7 0 002 12s3.5 6 10 6a9.8 9.8 0 004.3-.9" /><path d="M3 3l18 18M9.9 9.9a3 3 0 004.2 4.2" /></>);
export const IcLock = make(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>);
export const IcShield = make(<><path d="M12 3l8 3v6c0 5-3.4 8.5-8 9.6C7.4 20.5 4 17 4 12V6l8-3z" /></>);
export const IcClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 1.9" /></>);
export const IcInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const IcAlert = make(<><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4M12 17h.01" /></>);
export const IcHistory = make(<><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" /><path d="M3 3v5h5M12 7v5l3.5 2" /></>);

/* ── Transport ──────────────────────────────────────────────────────────── */
export const IcPlay = make(<><path d="M7 4.5l12 7.5-12 7.5z" /></>);
export const IcPause = make(<><path d="M9 4v16M15 4v16" /></>);
export const IcStop = make(<><rect x="6" y="6" width="12" height="12" rx="1.5" /></>);
export const IcSkipBack = make(<><path d="M18 5v14L7 12l11-7z" /><path d="M5 4v16" /></>);
export const IcSkipFwd = make(<><path d="M6 5v14l11-7L6 5z" /><path d="M19 4v16" /></>);
export const IcVolume = make(<><path d="M11 5L6.5 9H3v6h3.5L11 19V5z" /><path d="M15.5 9.5a3.5 3.5 0 010 5M18.5 7a7 7 0 010 10" /></>);

/* ── Canvas tools ───────────────────────────────────────────────────────── */
export const IcCursor = make(<><path d="M5 3l14 8-6 1.6L10.6 19 5 3z" /></>);
export const IcHand = make(<><path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-.8a5 5 0 01-3.6-1.6L5 17.6a1.6 1.6 0 012.3-2.2L8 16" /></>);
export const IcBrush = make(<><path d="M14 3.5l6.5 6.5-8 8a3 3 0 01-1.4.8L5 20l1.2-6.1a3 3 0 01.8-1.4l7-9z" /><path d="M12.5 5L19 11.5" /></>);
export const IcEraser = make(<><path d="M16 3l5 5-9 9H7l-4-4 13-10z" /><path d="M9 21h12M8 8l7 7" /></>);
export const IcCrop = make(<><path d="M6 2v14a2 2 0 002 2h14" /><path d="M2 6h14a2 2 0 012 2v14" /></>);
export const IcText = make(<><path d="M5 6V4h14v2M12 4v16M9 20h6" /></>);
export const IcShape = make(<><rect x="3" y="3" width="9" height="9" rx="1.5" /><circle cx="16.5" cy="16.5" r="4.5" /></>);
export const IcMask = make(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" /><circle cx="8.5" cy="7.5" r="1.5" /></>);
export const IcZoomIn = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6M11 8.5v5M8.5 11h5" /></>);
export const IcZoomOut = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6M8.5 11h5" /></>);
export const IcFit = make(<><path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" /></>);
export const IcUndo = make(<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-4" /></>);
export const IcRedo = make(<><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h4" /></>);
export const IcLink = make(<><path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1.2 1.1" /><path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1.2-1.1" /></>);

export const StudioIcons = {
  image: IcImage, video: IcVideo, film: IcFilm, camera: IcCamera, music: IcMusic,
  mic: IcMic, scissors: IcScissors, megaphone: IcMegaphone, persona: IcPersona,
  swap: IcSwap, layers: IcLayers, flow: IcFlow, palette: IcPalette, archive: IcArchive,
  spark: IcSpark, brain: IcBrain, grid: IcGrid,
};
