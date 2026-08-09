// Helmies Studio — the `title` step, shared by both executors.
//
// A plan says what the card SAYS and roughly how it should feel; this turns
// that into the line objects title-cards.mjs draws. Kept separate from both
// runners because there are two of them (src/lib/agents.js for the
// synchronous path, src/lib/agent-runner.js for the durable queue) and a
// step that behaves differently depending on which one picked it up is the
// hardest kind of bug to see.
//
// The design rule here: a planner should be able to write
//
//   { "agent": "title", "params": { "headline": "EVEN THIS AD.", "caret": true } }
//
// and get a correctly set card. Everything else — size, tracking, baseline,
// fades, the caret's position — has a considered default, because an LLM
// asked to specify typography specifies it badly and inconsistently.
import { layoutRow, HELMIES_PINK } from "./title-cards.mjs";

/* Type sizes as a share of frame HEIGHT, not absolute pixels: the same card
   has to work at 1080p and in a 9:16 crop, and a headline specified in
   pixels is either tiny or clipped in one of them. */
const SCALE = {
  hero: 0.13,      // EVEN THIS AD. / 09.09.2026 — the frame is the word
  headline: 0.09,  // SHORT FILMS / PRODUCT ADS
  sub: 0.032,      // "From one prompt."
  label: 0.018,    // the discreet model labels at the edges
};

const WEIGHT = { hero: "black", headline: "black", sub: "medium", label: "medium" };
const TRACKING = { hero: 0.1, headline: 0.08, sub: 0.06, label: 0.18 };

export const TITLE_STYLES = Object.keys(SCALE);

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * A card's lines from a plan's params.
 *
 * params: {
 *   headline, style, sub, caret, color, subColor, duration, height,
 *   headlineStart, subStart, tracking
 * }
 */
export function titleLines(params = {}, { height = 1080 } = {}) {
  const style = TITLE_STYLES.includes(params.style) ? params.style : "hero";
  const size = Math.round(num(params.size, SCALE[style] * height));
  const weight = params.weight || WEIGHT[style];
  const tracking = num(params.tracking, TRACKING[style]);
  const duration = Math.max(0.4, num(params.duration, 2.4));
  const color = params.color || "#ffffff";

  const headline = typeof params.headline === "string" ? params.headline : "";
  const sub = typeof params.sub === "string" ? params.sub : "";
  if (!headline && !sub) return [];

  const headStart = Math.max(0, num(params.headlineStart, 0.15));
  const headDuration = Math.max(0.3, num(params.headlineDuration, duration - headStart));

  const lines = [];

  if (headline) {
    /* The headline and its caret are ONE line laid out together, so the
       caret sits flush after the last glyph rather than at a guessed
       offset — see layoutRow. The caret is the same pink the film opened
       on, which is the entire point of "EVEN THIS AD.|": it ties the last
       frame back to the cursor in the first. */
    const row = [{
      text: headline,
      weight, size, color, tracking,
      start: headStart,
      duration: headDuration,
      fadeIn: num(params.fadeIn, 0.3),
      fadeOut: num(params.fadeOut, 0.45),
    }];
    if (params.caret) {
      row.push({
        text: "|",
        weight, size,
        color: params.caretColor || HELMIES_PINK,
        start: num(params.caretStart, headStart + 0.6),
        duration: num(params.caretDuration, Math.max(0.4, headDuration - 0.6)),
        cursor: true,
      });
    }
    // A card with a subtitle lifts its headline so the PAIR is centred;
    // otherwise the headline sits dead centre and the subtitle hangs off
    // the bottom of the optical centre like an afterthought.
    const lift = sub ? Math.round(height * 0.045) : 0;
    const baseline = `(h+${(size * 0.715).toFixed(1)})/2-${lift}`;
    lines.push(...layoutRow(row, { gap: Math.round(size * 0.14) }).map((l) => ({ ...l, baseline })));
  }

  if (sub) {
    const subSize = Math.round(num(params.subSize, SCALE.sub * height));
    const subStart = num(params.subStart, headStart + 0.45);
    lines.push({
      text: sub,
      weight: "medium",
      size: subSize,
      // ffmpeg's alpha is a suffix, not a fourth channel — "rgba(...)" would
      // tear the filter chain at its commas. normalizeColor converts what a
      // planner writes; this default is already in the right dialect.
      color: params.subColor || "#ffffff@0.72",
      tracking: TRACKING.sub,
      start: subStart,
      duration: Math.max(0.3, num(params.subDuration, duration - subStart)),
      fadeIn: 0.3,
      fadeOut: 0.4,
      baseline: `(h+${(subSize * 0.715).toFixed(1)})/2+${Math.round(height * 0.075)}`,
    });
  }

  return lines;
}

/** How long the clip has to be to contain everything on it. */
export function titleDuration(params = {}, lines = []) {
  const declared = Number(params.duration);
  const needed = lines.reduce((max, l) => Math.max(max, (Number(l.start) || 0) + (Number(l.duration) || 0)), 0);
  // The declared duration wins when it is long enough; a card that cuts its
  // own last word off is worse than one that holds a beat too long.
  return Math.max(Number.isFinite(declared) && declared > 0 ? declared : 0, needed + 0.15, 0.5);
}
