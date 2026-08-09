#!/usr/bin/env node
/* Regenerate src/lib/font-metrics.mjs from the committed TTFs.
 *
 * Run this only when the brand typeface changes. It needs Python with
 * fontTools + brotli, which is why the OUTPUT is committed and this script
 * is not part of the build: a render must never depend on a font toolchain
 * being installed on the box that runs it.
 *
 *   python -m pip install fonttools brotli
 *   node scripts/build-font-metrics.mjs
 *
 * The TTFs themselves come from public/fonts/*.woff2 the same way:
 *   python -c "from fontTools.ttLib import TTFont; \
 *     f=TTFont('public/fonts/nohemi-black.woff2'); f.flavor=None; \
 *     f.save('assets/fonts/Nohemi-Black.ttf')"
 */
import { execFileSync } from "node:child_process";

const PY = `
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
import json, sys
out = {}
for w in ['Black', 'Bold', 'Medium', 'Regular']:
    f = TTFont('assets/fonts/Nohemi-%s.ttf' % w)
    upm = f['head'].unitsPerEm
    cmap = f.getBestCmap(); hmtx = f['hmtx']; gs = f.getGlyphSet()
    adv = {}; top = {}
    for cp in range(32, 127):
        g = cmap.get(cp)
        if not g or g not in hmtx.metrics:
            continue
        ch = chr(cp)
        adv[ch] = round(hmtx[g][0] / upm, 4)
        pen = BoundsPen(gs); gs[g].draw(pen)
        top[ch] = round((pen.bounds[3] if pen.bounds else 0) / upm, 4)
    cap = round(f['OS/2'].sCapHeight / upm, 4) if hasattr(f['OS/2'], 'sCapHeight') else 0.715
    out[w.lower()] = {'adv': adv, 'top': top, 'cap': cap}
sys.stdout.write(json.dumps(out))
`;

const json = execFileSync("python", ["-c", PY], { encoding: "utf8" });
const header = [
  "// GENERATED from assets/fonts/Nohemi-*.ttf - do not hand-edit.",
  "// Regenerate: node scripts/build-font-metrics.mjs",
  "//",
  "// Per weight:",
  "//   adv - advance width of each glyph, in em (hmtx).",
  "//   top - height of each glyph ink ABOVE the baseline, in em (yMax).",
  "//   cap - cap height in em (OS/2 sCapHeight).",
  "//",
  "// Both tables are load-bearing. ffmpeg drawtext anchors text by its INK",
  "// TOP, not by a baseline: measured, an E drawn at y=100 has its ink top at",
  "// 100 and so does a period, which puts the period halfway up the line. So",
  "// a glyph drawn on a shared baseline B needs y = B - top*size, and that",
  "// number has to come from the font. adv places the glyph horizontally.",
  `export const METRICS = ${json};`,
  "",
  "// Kept for callers that only need advances.",
  "export const ADVANCES = Object.fromEntries(Object.entries(METRICS).map(([w, m]) => [w, m.adv]));",
  "",
].join("\n");

const { writeFileSync } = await import("node:fs");
writeFileSync("src/lib/font-metrics.mjs", header);
console.log(`Wrote src/lib/font-metrics.mjs (${header.length} bytes)`);
