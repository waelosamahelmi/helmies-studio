import { describe, it, expect } from "vitest";
import { messageModalities, resolveModelFor } from "@/lib/providers";
import { buildUserParts } from "@/lib/agent-multimodal.mjs";
import { llmModel, canSee, DEFAULT_LLM } from "@/lib/llm-models.mjs";

/* A model that cannot see must never be sent a picture.
   ──────────────────────────────────────────────────────────────────────────
   The failure this locks down was live in production: attaching an image to
   agent chat returned a 500, because the STREAMING path in
   src/app/api/agent/chat/route.js built its own fetch and passed the caller's
   model through verbatim. llmComplete resolved the model properly; the
   streaming path never asked. OpenRouter answered 404 "No endpoints found
   that support image input" and the user saw "Something went wrong".

   The route's own comment claimed providers.js already substituted — it did,
   but only on the path the route wasn't using. Nothing tested the pairing, so
   the comment and the code could disagree indefinitely. That is what these
   tests exist to prevent: they bind "these messages carry an image" to "the
   model chosen for them can see". */

const TEXT_ONLY = "deepseek/deepseek-v4-flash";

describe("the registry's own claims", () => {
  it("still ships the text-only model this bug was about", () => {
    const row = llmModel(TEXT_ONLY);
    expect(row, `${TEXT_ONLY} left the registry — update this test`).toBeTruthy();
    expect(row.modalities).toEqual(["text"]);
    expect(canSee(TEXT_ONLY)).toBe(false);
  });

  it("the default model can see, so the common case needs no substitution", () => {
    expect(canSee(DEFAULT_LLM)).toBe(true);
  });
});

describe("messageModalities", () => {
  it("reports text for plain string turns", () => {
    expect(messageModalities([{ role: "user", content: "hello" }])).toEqual(["text"]);
  });

  it("detects an image among content parts", () => {
    const msgs = [{
      role: "user",
      content: buildUserParts("what is this?", [{ url: "https://x.test/a.png" }]),
    }];
    expect(messageModalities(msgs)).toContain("image");
  });

  it("detects an image on a NON-final turn too", () => {
    // The route only attaches to the newest turn, but history replays carry
    // older image parts; a model chosen for the tail must still cover them.
    const msgs = [
      { role: "user", content: buildUserParts("look", [{ url: "https://x.test/a.jpg" }]) },
      { role: "assistant", content: "I see a cat." },
      { role: "user", content: "and now?" },
    ];
    expect(messageModalities(msgs)).toContain("image");
  });
});

describe("resolveModelFor", () => {
  it("leaves a text-only model alone when the turn is text-only", () => {
    const msgs = [{ role: "user", content: "just words" }];
    expect(resolveModelFor(msgs, { model: TEXT_ONLY })).toBe(TEXT_ONLY);
  });

  it("SUBSTITUTES when a text-only model is handed an image", () => {
    const msgs = [{
      role: "user",
      content: buildUserParts("describe it", [{ url: "https://x.test/a.png" }]),
    }];
    const used = resolveModelFor(msgs, { model: TEXT_ONLY });
    expect(used).not.toBe(TEXT_ONLY);
    expect(canSee(used)).toBe(true);
  });

  it("resolves to a seeing model when no model is requested at all", () => {
    // The route now passes `undefined` rather than a hardcoded text-only id.
    const msgs = [{
      role: "user",
      content: buildUserParts("describe it", [{ url: "https://x.test/a.webp" }]),
    }];
    expect(canSee(resolveModelFor(msgs, { model: undefined }))).toBe(true);
  });

  it("is safe to call with no options", () => {
    expect(resolveModelFor([{ role: "user", content: "hi" }])).toBeTruthy();
  });
});

/* The pairing itself: for ANY registry model, the model actually used for a
   message list carrying an image can see. This is the invariant the streaming
   route violated, stated once so no future transport path can violate it
   quietly. */
describe("the invariant", () => {
  const withImage = [{
    role: "user",
    content: buildUserParts("what is this?", [{ url: "https://x.test/p.png" }]),
  }];

  it.each([TEXT_ONLY, "deepseek/deepseek-v4-pro", DEFAULT_LLM, undefined, "not-a-real-model"])(
    "requesting %s for an image turn yields a model that can see",
    (requested) => {
      expect(canSee(resolveModelFor(withImage, { model: requested }))).toBe(true);
    },
  );
});
