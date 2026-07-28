// Helmies Studio — Brand Engine
// Spec §8 (Brand Kits): fingerprint extraction + enforcement modes.
// The fingerprint is derived from uploaded logos + reference images using
// Visual Intelligence, then injected into the Prompt Intelligence enricher
// based on the enforcement mode (Off / Suggest / Strong / Locked).

import prisma from "./prisma";
import { analyzeImage } from "./visual-intelligence";

// ── Fingerprint Extraction ──────────────────────────────────
// Spec §8.2-8.3. Analyzes uploaded brand assets to derive a visual fingerprint:
// palette, visual style, typography hints, and avoid-list.
export async function extractBrandFingerprint(brandKitId) {
  const brand = await prisma.brandKit.findUnique({
    where: { id: brandKitId },
    include: { assets: { include: { asset: true } } },
  });
  if (!brand) throw new Error("Brand kit not found");

  const analyses = [];
  for (const ba of brand.assets) {
    const url = ba.asset?.url || ba.asset?.storageKey;
    if (!url) continue;
    try {
      const analysis = await analyzeImage(url);
      if (analysis && analysis.provider !== "unavailable") analyses.push(analysis);
    } catch {}
  }

  // Aggregate palette from all analyses (dedupe + sort by frequency)
  const paletteRaw = [];
  for (const a of analyses) {
    if (Array.isArray(a.palette)) paletteRaw.push(...a.palette);
  }
  const palette = dedupeColors(paletteRaw).slice(0, 8);

  // Aggregate visual style
  const visualStyles = analyses.map((a) => a.style).filter(Boolean);
  const lighting = analyses.map((a) => a.lighting).filter(Boolean);

  const fingerprint = {
    palette: {
      primary: palette.slice(0, 4),
      secondary: palette.slice(4, 8),
    },
    visual: {
      contrast: inferAggregate(visualStyles, "contrast", "high"),
      lighting: inferAggregate(lighting, "quality", "warm directional") ||
        (brand.photographyStyle || "warm directional"),
      composition: inferAggregate(visualStyles, "composition", "minimal centered"),
      texture: inferAggregate(visualStyles, "texture", "premium matte"),
    },
    typography: {
      heading: null,  // populated from OCR textRegions if detected
      body: null,
      case: "mixed",
    },
    avoid: brand.avoid || [],
    derivedFromAssets: analyses.length,
    extractedAt: new Date().toISOString(),
  };

  // Try to infer typography from detected text
  const allText = analyses.flatMap((a) => a.textRegions || []).map((t) => t.text).filter(Boolean);
  if (allText.length > 0) {
    fingerprint.typography.detectedText = allText.slice(0, 10);
  }

  // Persist the fingerprint
  const updated = await prisma.brandKit.update({
    where: { id: brandKitId },
    data: { fingerprint },
  });

  return fingerprint;
}

// ── Enforcement ─────────────────────────────────────────────
// Spec §8.4. Returns brand constraints to inject into the prompt pipeline
// based on the enforcement mode.
export function getBrandConstraints(brandKit) {
  if (!brandKit) return null;

  const mode = brandKit.enforcement || "off";
  if (mode === "off") {
    // Brand info available but not injected into prompts
    return { mode: "off", inject: false, constraints: null };
  }

  const fp = brandKit.fingerprint || {};
  const constraints = {
    palette: fp.palette || { primary: brandKit.primaryColors, secondary: brandKit.secondaryColors },
    photographyStyle: brandKit.photographyStyle,
    toneOfVoice: brandKit.toneOfVoice,
    avoid: brandKit.avoid || fp.avoid || [],
    slogans: brandKit.slogans || [],
    fonts: brandKit.fonts || [],
  };

  return {
    mode,
    inject: mode === "strong" || mode === "locked",
    suggest: mode === "suggest",
    locked: mode === "locked",
    constraints,
  };
}

// ── Build the brand context block for the prompt enricher ──
// This is what Pass 1 (enricher) adds to the prompt context.
export function buildBrandPromptContext(brandKit) {
  const bc = getBrandConstraints(brandKit);
  if (!bc || !bc.inject) return null;

  const c = bc.constraints;
  const bits = [];
  if (c.palette?.primary?.length) bits.push(`brand colors: ${c.palette.primary.join(", ")}`);
  if (c.photographyStyle) bits.push(`photography style: ${c.photographyStyle}`);
  if (c.toneOfVoice) bits.push(`tone: ${c.toneOfVoice}`);
  if (c.avoid?.length) bits.push(`avoid: ${c.avoid.join(", ")}`);
  if (bc.locked) bits.push(`(LOCKED — do not deviate from brand colors, style, or tone)`);

  return bits.length ? bits.join("; ") : null;
}

// ── Check a prompt against brand constraints (for violations) ──
export function checkBrandCompliance(prompt, brandKit) {
  const bc = getBrandConstraints(brandKit);
  if (!bc || !bc.constraints) return { compliant: true, violations: [] };

  const violations = [];
  const lower = (prompt || "").toLowerCase();

  // Check avoid-list
  for (const avoid of bc.constraints.avoid || []) {
    if (lower.includes(avoid.toLowerCase())) {
      violations.push({ type: "avoid_list", term: avoid, severity: bc.locked ? "error" : "warning" });
    }
  }

  // In locked mode, check that brand colors are mentioned if image generation
  if (bc.locked && bc.constraints.palette?.primary?.length) {
    const hasBrandColor = bc.constraints.palette.primary.some((color) =>
      lower.includes(color.toLowerCase().replace("#", "")) || lower.includes(color.toLowerCase())
    );
    if (!hasBrandColor && lower.length > 20) {
      violations.push({ type: "missing_brand_color", severity: "warning", message: "Brand colors not found in prompt (locked mode)" });
    }
  }

  return { compliant: violations.length === 0, violations };
}

// ── Helpers ─────────────────────────────────────────────────
function dedupeColors(colors) {
  // Normalize and dedupe hex colors, preserving order of first appearance
  const seen = new Map();
  for (const c of colors) {
    const normalized = String(c).toLowerCase().trim();
    if (/^#?[0-9a-f]{6}$/.test(normalized)) {
      const hex = normalized.startsWith("#") ? normalized : `#${normalized}`;
      if (!seen.has(hex)) seen.set(hex, 0);
      seen.set(hex, seen.get(hex) + 1);
    }
  }
  return Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);
}

function inferAggregate(objects, key, fallback) {
  const values = objects.map((o) => o?.[key]).filter(Boolean);
  if (values.length === 0) return fallback;
  // pick the most common value
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || fallback;
}