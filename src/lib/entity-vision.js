// Read a character's observable traits off their own photographs.
//
// The Cast editor used to ask somebody to type nineteen fields describing a
// person whose photograph they had just uploaded. That is both tedious and
// actively harmful: a hand-typed "hair: dark, cropped" that disagrees with
// the picture gives the renderer two conflicting instructions, and the text
// tends to win in models that weight the prompt head.
//
// So the photograph answers for itself. What comes back is a SUGGESTION —
// the caller shows it, the user edits or discards it, and nothing is saved
// until they accept. We never silently rewrite somebody's character.
import { OBSERVABLE_ATTRIBUTES } from "./entity-core.mjs";
import { publicBaseUrl } from "./provider-payload-core.mjs";
import { log } from "./log.js";
import { llmComplete } from "./providers.js";
import { hasLlm } from "./llm-transport.mjs";

// No model id lives here. An id typed from memory is how every image analysis
// this app attempted once failed (a text-only model, a 404 nobody surfaced).
// llmComplete resolves the model against what the messages CARRY, so a call
// with image parts can only ever reach a model that sees. VISION_MODEL is an
// escape hatch and is honoured only when llm-models.mjs knows the id.
const VISION_MODEL = process.env.VISION_MODEL || undefined;

const FIELD_GUIDE = {
  ageAppearance: "how old they read on camera, e.g. 'early thirties'",
  genderPresentation: "how they present",
  ethnicity: "only if clearly readable; otherwise leave empty",
  face: "face shape, jaw, brow, cheekbones",
  skin: "tone and texture, visible marks",
  hair: "colour, length, cut, how it sits",
  eyes: "colour and shape",
  build: "body build",
  heightImpression: "how tall they read, only if the frame shows enough",
  distinctiveFeatures: "what you would name first to identify them again",
  wardrobe: "what they are wearing",
  accessories: "glasses, jewellery, watch",
  makeup: "visible makeup, or empty",
  defaultExpression: "the RESTING shape of their face — brow, eye and mouth set when they are doing nothing. Never record a smile or any expression they happen to be wearing in the photograph",
  posture: "how they hold themselves, only if the frame shows enough",
};

const SYSTEM_PROMPT = `You describe a person from reference photographs so an image model can render them again consistently.

Rules:
- Describe ONLY what you can actually see. An attribute you cannot read from these photographs must be an empty string. Guessing is worse than leaving it blank, because a wrong detail gets repeated in every shot.
- Be concrete and physical. "heavy dark brows, a broad nose, a faint scar through the left eyebrow" is useful. "handsome, friendly" is not.
- Describe the person, never the photograph. No mention of lighting, background, camera, framing, or image quality.
- Keep each value under 200 characters.
- Never describe clothing as an identity trait if it looks incidental — put it in wardrobe.
- A MOOD IS NOT A FEATURE. Whatever the person is doing with their face in this photograph — smiling, laughing, frowning — is what they were doing that day, not who they are. Every word here is repeated into every shot the character ever appears in, so a "warm smile" recorded once puts a smile into a funeral. Describe the face's resting structure and leave the performance to the director.

Reply with ONLY a JSON object whose keys are exactly these, each a string:
${Object.entries(FIELD_GUIDE).map(([k, v]) => `  "${k}": ${v}`).join("\n")}`;

// OpenRouter fetches these URLs from its own servers, so an app-relative
// path is as useless here as it is to any other provider — the same class of
// bug that broke the identity pack.
const absolute = (url) => (typeof url === "string" && url.startsWith("/api/") ? `${publicBaseUrl()}${url}` : url);

export async function describeCharacterFromPhotos(urls = [], { name = "" } = {}) {
  const images = urls.filter(Boolean).slice(0, 4).map(absolute);
  if (!images.length) {
    const err = new Error("Add a photograph first — there is nothing to read.");
    err.code = "no_source";
    throw err;
  }

  if (!hasLlm()) {
    const err = new Error("Reading a photograph is not available right now.");
    err.code = "unavailable";
    throw err;
  }

  let content;
  try {
    content = await llmComplete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Describe ${name ? `the person called ${name}` : "this person"} from ${images.length === 1 ? "this photograph" : `these ${images.length} photographs`}. Return only the JSON object.`,
            },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
      { model: VISION_MODEL, maxTokens: 1200, temperature: 0.2, responseFormat: { type: "json_object" }, timeout: 90000 },
    );
  } catch (e) {
    // llmComplete has already logged the raw upstream text, once per route.
    log.error("entity_vision_failed", { message: e?.message });
    const err = new Error("The photograph could not be read. Please try again.");
    err.code = "vision_failed";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    log.error("entity_vision_unparseable", { sample: String(content).slice(0, 200) });
    const err = new Error("The photograph could not be read. Please try again.");
    err.code = "vision_failed";
    throw err;
  }

  // Keep only the observable keys, as trimmed strings. An empty answer is
  // dropped rather than stored — a blank field the user can fill in is
  // honest; a blank field we wrote over their own text is not.
  const attributes = {};
  for (const key of OBSERVABLE_ATTRIBUTES) {
    const value = parsed?.[key];
    if (typeof value !== "string") continue;
    const text = value.trim().slice(0, 400);
    if (text && !/^(unknown|n\/?a|none|not visible)$/i.test(text)) attributes[key] = text;
  }
  return { attributes, readFrom: images.length };
}
