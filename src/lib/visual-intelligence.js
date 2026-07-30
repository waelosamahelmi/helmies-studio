import prisma from "@/lib/prisma";

// Helmies Vision — Visual Intelligence Service (spec §11)
// Provider-agnostic image analysis. Uses a multimodal LLM via KIE's
// OpenAI-compatible chat completions endpoint.

const VISION_MODEL = process.env.VISION_MODEL || "deepseek/deepseek-v4-flash";

export async function analyzeImage(imageUrl, options = {}) {
  if (!imageUrl) throw new Error("Image URL required");

  const userId = options.userId || null;

  // Check cache first (spec §11.3). Scoped to the requesting user so one
  // user's analysis is never served to (or read by) another.
  const cached = await prisma.visualAnalysis.findFirst({
    where: { assetUrl: imageUrl, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (cached && !options.force) return cached;

  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    return {
      id: null,
      assetUrl: imageUrl,
      caption: null,
      background: null,
      palette: null,
      regions: null,
      textRegions: null,
      lighting: null,
      style: null,
      provider: "unavailable",
      createdAt: new Date(),
    };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
        "X-Title": "Helmies Studio",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a visual analysis expert. Analyze the image and return a JSON object with: caption (detailed description), background (description of background/setting), palette (array of 5 dominant hex colors), regions (array of detected objects with {label, bbox: [x,y,w,h]}), textRegions (array of detected text with {text, bbox}), lighting ({direction, quality, contrast, temperature}), style ({contrast, lighting, composition, texture}).",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this image in detail. Return only valid JSON." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) throw new Error(`Vision API error: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No analysis returned");

    const analysis = JSON.parse(content);

    const record = await prisma.visualAnalysis.create({
      data: {
        userId,
        assetUrl: imageUrl,
        caption: analysis.caption || null,
        background: analysis.background || null,
        palette: analysis.palette || null,
        regions: analysis.regions || null,
        textRegions: analysis.textRegions || null,
        lighting: analysis.lighting || null,
        style: analysis.style || null,
        provider: "kie-vision",
      },
    });

    return record;
  } catch (e) {
    console.error("Visual analysis failed:", e.message);
    return {
      id: null,
      assetUrl: imageUrl,
      caption: null,
      background: null,
      palette: null,
      regions: null,
      textRegions: null,
      lighting: null,
      style: null,
      provider: "error",
      createdAt: new Date(),
    };
  }
}

export async function compareImages(urlA, urlB) {
  const [a, b] = await Promise.all([analyzeImage(urlA), analyzeImage(urlB)]);

  if (!a.palette || !b.palette) return { similarity: null, details: "Analysis unavailable" };

  const paletteA = a.palette.slice(0, 5);
  const paletteB = b.palette.slice(0, 5);

  let colorScore = 0;
  for (const ca of paletteA) {
    let bestMatch = 0;
    for (const cb of paletteB) {
      const sim = colorSimilarity(ca, cb);
      if (sim > bestMatch) bestMatch = sim;
    }
    colorScore += bestMatch;
  }
  colorScore /= paletteA.length;

  return {
    similarity: Math.round(colorScore * 100) / 100,
    paletteA,
    paletteB,
    captionA: a.caption,
    captionB: b.caption,
  };
}

function colorSimilarity(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 0;
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
  return Math.max(0, 1 - distance / 441.67);
}

function hexToRgb(hex) {
  if (!hex) return null;
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
