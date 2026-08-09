// Helmies Studio — typography that says what it was told to say.
//
// Everything else in this studio is generated: a model is asked for a thing
// and returns its impression of that thing. That is exactly what you must
// not do with words. A video model asked for "09.09.2026" returns 09.09.2026
// most of the time and 09.09.2028, 09.O9.2026 or a smeared approximation the
// rest of it — and the one frame the whole advertisement exists to deliver
// is the one nobody can proofread until it has been paid for.
//
// So title cards are RENDERED, not generated. ffmpeg's drawtext with the
// brand's own typeface: the glyphs are the glyphs, the timing is the timing,
// the colour is the hex the brand kit says, and the same input produces the
// same frame every time. No credits, no provider, nothing to proofread.
//
// This module is the pure half — layout, measurement and the escaping rules,
// unit-tested without touching a disk. src/lib/title-render.js runs them.
import { METRICS } from "./font-metrics.mjs";

/* Type in the brand's own font. Committed as TTF (assets/fonts) rather than
   converted at runtime from the woff2 the browser gets: a render must not
   depend on a font conversion tool being installed on the box. */
export const FONT_WEIGHTS = {
  black: "Nohemi-Black.ttf",
  bold: "Nohemi-Bold.ttf",
  medium: "Nohemi-Medium.ttf",
  regular: "Nohemi-Regular.ttf",
};

export const HELMIES_PINK = "#ff2d8f";

/* drawtext's text is read by ffmpeg's expression parser before it is drawn,
   so a colon or a backslash in the copy changes the FILTER rather than the
   words. "09.09.2026" is safe; "COMING: 09.09.2026" silently truncates. */
export function escapeDrawtext(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, "\\n");
}

/* ── Tracking, which drawtext has no parameter for ────────────────────────
   Wide letter-spacing is most of what makes a title card read as designed
   rather than as a default, and drawtext offers no control over it at all.

   The obvious dodge — putting spaces between the letters — was measured and
   fails twice. It quantises tracking to whole space-widths (0.245em in this
   face, far too coarse to be a design choice), and ffmpeg COLLAPSES runs of
   spaces, so the wider word gaps that stop a headline reading as one
   undifferentiated run silently render as single gaps. Measured, at 200px:
   "EVEN THIS AD." spaced that way should have been 2609px wide and drew
   1816.

   So each glyph is drawn as its own drawtext at a computed x. The advances
   come from the font's own hmtx table and were checked against real renders
   (agreeing within 1%), which makes tracking a continuous value in EM — 0.12
   being the familiar "120 units" of a type spec — and makes the width of a
   line an exact number rather than an estimate. Exact width is what lets a
   caret sit flush after a headline, which drawtext cannot otherwise express:
   a layer can only ask how wide its OWN text is. */

const faceOf = (weight) => METRICS[weight] || METRICS.black;
const advanceOf = (face, ch) => face.adv[ch] ?? face.adv["?"] ?? 0.5;
const inkTopOf = (face, ch) => face.top[ch] ?? face.cap;

/** Width of a line in pixels, tracking included. */
export function trackedWidth(text, { weight = "black", size = 96, tracking = 0 } = {}) {
  const face = faceOf(weight);
  const chars = [...String(text ?? "")];
  if (!chars.length) return 0;
  const em = chars.reduce((sum, ch) => sum + advanceOf(face, ch), 0);
  const gaps = Math.max(0, chars.length - 1) * (Number(tracking) || 0);
  return (em + gaps) * (Number(size) || 96);
}

/** Cap height in pixels — what a line of uppercase is actually as tall as. */
export function capHeight({ weight = "black", size = 96 } = {}) {
  return faceOf(weight).cap * (Number(size) || 96);
}

/** Reads better at call sites that are asking a question about text. */
export const measureText = trackedWidth;

/**
 * One line broken into positioned glyphs.
 *
 * Returns [{ char, dx }] where dx is the offset from the line's left edge.
 * Whitespace is kept in the advance but never drawn — a space has no ink,
 * and emitting a drawtext for it is a filter node that renders nothing.
 */
export function glyphPositions(text, { weight = "black", size = 96, tracking = 0 } = {}) {
  const face = faceOf(weight);
  const px = Number(size) || 96;
  const track = (Number(tracking) || 0) * px;
  const out = [];
  let dx = 0;
  for (const ch of [...String(text ?? "")]) {
    // `dy` is how far this glyph's ink sits below a shared baseline's origin.
    // drawtext anchors ink-top, so this is what a glyph must be pushed down
    // by for its baseline to match its neighbours' — see METRICS.
    if (ch.trim()) out.push({ char: ch, dx, dy: inkTopOf(face, ch) * px });
    dx += advanceOf(face, ch) * px + track;
  }
  return out;
}

/* Fade in, hold, fade out — as an alpha expression over the clip's own
   timeline. Written as one nested if() rather than enable= windows because
   enable toggles hard: text would pop on and off, and a title that pops is
   the difference between a launch film and a slide deck. */
export function alphaExpr({ start = 0, duration = 2, fadeIn = 0.4, fadeOut = 0.4 } = {}) {
  const s = Number(start) || 0;
  const d = Math.max(0.05, Number(duration) || 0);
  const fi = Math.max(0, Math.min(Number(fadeIn) || 0, d / 2));
  const fo = Math.max(0, Math.min(Number(fadeOut) || 0, d / 2));
  const end = s + d;
  const n = (v) => Number(v.toFixed(3));
  const parts = [];
  parts.push(`if(lt(t,${n(s)}),0,`);
  parts.push(fi > 0 ? `if(lt(t,${n(s + fi)}),(t-${n(s)})/${n(fi)},` : "if(0,0,");
  parts.push(fo > 0 ? `if(lt(t,${n(end - fo)}),1,` : "if(1,1,");
  parts.push(fo > 0 ? `if(lt(t,${n(end)}),(${n(end)}-t)/${n(fo)},0)` : "0");
  return `${parts.join("")})))`;
}

/* The blinking cursor after "EVEN THIS AD." — the same pink caret the film
   opened on, which is the whole point of that shot. A square wave on t, not
   a fade: a cursor that fades is a glow, and reads as an effect rather than
   as the interface the ad has been showing for twenty seconds. */
export function cursorAlphaExpr({ start = 0, duration = 2, period = 1.06 } = {}) {
  const s = Number(start) || 0;
  const end = s + Math.max(0.05, Number(duration) || 0);
  const p = Math.max(0.2, Number(period) || 1.06);
  const n = (v) => Number(v.toFixed(3));
  return `if(lt(t,${n(s)}),0,if(gt(t,${n(end)}),0,lt(mod(t-${n(s)},${n(p)}),${n(p / 2)})))`;
}

/* Vertical placement, and the one trap in drawing a line glyph by glyph.
   ────────────────────────────────────────────────────────────────────────
   The obvious way to centre text is y=(h-text_h)/2. Per glyph that is
   wrong, and visibly so: text_h is THAT glyph's height, so a full-cap E
   centres on the cap height and a period centres on its own few pixels —
   the period floats to the middle of the line and the headline reads as
   "AD·" rather than "AD.". It renders as a typo.

   Nor does max_glyph_h or ascent fix it — measured, all three resolve
   per-text, so every glyph still lands on its own box and the period still
   floats. There is no in-filter expression for "the baseline of the line
   this glyph belongs to", because drawtext has no concept of a line that
   spans several drawtext nodes.

   So the baseline is computed HERE. Each glyph knows how far its ink rises
   above the baseline (METRICS.top), and is drawn at baseline - that. The
   result is a genuine shared baseline, and it handles descenders as
   naturally as capitals: a "g" simply has a smaller top and hangs below.

   The baseline for a vertically centred line puts the cap-height block in
   the middle of the frame, which is what "centred" looks like to the eye —
   centring the em box instead leaves uppercase sitting visibly high. */
const resolveY = (y) => (typeof y === "number" ? String(Math.round(y)) : y);

/** Baseline expression for a line centred in the frame. */
export function centeredBaseline({ weight = "black", size = 96 } = {}) {
  return `(h+${capHeight({ weight, size }).toFixed(1)})/2`;
}

/**
 * A line as drawtext filters — one per glyph, or one for the whole line when
 * there is no tracking and nothing needs measuring.
 *
 * `x` may be given explicitly (an expression or a number). Left out, the
 * line centres itself using its measured width, which is what makes a
 * centred headline and the caret after it agree about where the line ends.
 */
export function lineFilters(line, { fontDir = "" } = {}) {
  const {
    text, weight = "black", size = 96, color = "#ffffff",
    x = null, y = null, baseline = null, tracking = 0,
    start = 0, duration = 2, fadeIn = 0.4, fadeOut = 0.4,
    cursor = false,
  } = line || {};

  if (typeof text !== "string" || !text.length) return [];

  const file = FONT_WEIGHTS[weight] || FONT_WEIGHTS.black;
  const fontPath = escapeDrawtext(`${fontDir}${fontDir && !fontDir.endsWith("/") ? "/" : ""}${file}`);
  const alpha = cursor ? cursorAlphaExpr(line) : alphaExpr({ start, duration, fadeIn, fadeOut });
  const fontsize = Math.max(8, Math.round(Number(size) || 96));
  const width = trackedWidth(text, { weight, size, tracking });
  const originExpr = x == null
    ? `(w-${width.toFixed(1)})/2`
    : (typeof x === "number" ? String(Math.round(x)) : x);
  const baseExpr = resolveY(baseline) || centeredBaseline({ weight, size });

  const draw = (body, xExpr, yExpr) => [
    `drawtext=fontfile='${fontPath}'`,
    `text='${escapeDrawtext(body)}'`,
    `fontsize=${fontsize}`,
    `fontcolor=${color}`,
    `x=${xExpr}`,
    `y=${yExpr}`,
    `alpha='${alpha}'`,
  ].join(":");

  // An explicit `y` is taken literally — the caller wants drawtext's own
  // ink-top anchoring and is responsible for what that means.
  const explicitY = resolveY(y);

  return glyphPositions(text, { weight, size, tracking })
    .map(({ char, dx, dy }) => draw(
      char,
      `${originExpr}+${dx.toFixed(1)}`,
      explicitY || `${baseExpr}-${dy.toFixed(1)}`,
    ));
}

/**
 * Lay several lines out side by side as one centred unit.
 *
 * A headline and the caret that follows it are two layers that must read as
 * one line. This fills in each one's `x` so the GROUP is centred and each
 * piece sits flush after the last. A line that already carries an explicit
 * `x` is left exactly as it is.
 */
export function layoutRow(lines = [], { gap = 0 } = {}) {
  const row = (Array.isArray(lines) ? lines : []).filter((l) => l && typeof l.text === "string");
  const widths = row.map((l) => trackedWidth(l.text, l));
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, row.length - 1);
  let offset = 0;
  return row.map((line, i) => {
    const x = line.x ?? `(w-${total.toFixed(1)})/2+${offset.toFixed(1)}`;
    offset += widths[i] + gap;
    return { ...line, x };
  });
}

/** The whole card as one filter chain over whatever source the caller has. */
export function buildCardFilters(lines = [], { fontDir = "" } = {}) {
  return (Array.isArray(lines) ? lines : [])
    .flatMap((line) => lineFilters(line, { fontDir }))
    .join(",");
}

/**
 * Where a card's cuts should land.
 *
 * A launch film's titles hit ON the beat or they look late — the eye is
 * unforgiving about this in a way it is not about a frame of colour. Given a
 * tempo and the first downbeat, this returns the beat times inside a window,
 * so a caller can quantise a card's `start` to the nearest one instead of
 * guessing at round numbers that drift out of sync by the third title.
 */
export function beatGrid({ bpm = 120, offset = 0, from = 0, to = 30 } = {}) {
  const tempo = Number(bpm);
  if (!Number.isFinite(tempo) || tempo <= 0) return [];
  const step = 60 / tempo;
  const out = [];
  let t = Number(offset) || 0;
  while (t < from) t += step;
  // A 25-second film at 200bpm is 83 beats; the cap is a runaway guard, not
  // a musical judgement.
  while (t <= to && out.length < 2048) {
    out.push(Number(t.toFixed(4)));
    t += step;
  }
  return out;
}

/** The beat nearest `time` — what a title's start is snapped to. */
export function snapToBeat(time, grid = []) {
  if (!Array.isArray(grid) || !grid.length) return Number(time) || 0;
  const t = Number(time) || 0;
  let best = grid[0];
  for (const b of grid) {
    if (Math.abs(b - t) < Math.abs(best - t)) best = b;
  }
  return best;
}
