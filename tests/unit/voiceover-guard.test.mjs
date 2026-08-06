import { describe, it, expect } from "vitest";
import { isVoiceoverInstruction } from "@/lib/voiceover-guard";

// A9 owner defect 1 — "when it sends a prompt for audio, the voiceover SAYS
// the prompt". The detector must convict instruction-shaped text (so the
// executor rewrites it into a real script before the TTS model reads it
// verbatim) and must ACQUIT real narration (so good copy is never burned on
// a pointless rewrite). Both directions are pinned here.

describe("isVoiceoverInstruction — instructions (must trigger)", () => {
  const instructions = [
    // The literal production-incident shape.
    "Generate a voiceover about our new mattress",
    "generate a voiceover for the launch film",
    "Create a warm narration for the product video",
    "Make an audio track describing the product benefits",
    "Write a voiceover script for the promo",
    "Please generate narration that highlights the three key features",
    "Produce a TTS reading of the tagline",
    "Record a voice-over introducing the brand",
    "Narrate the story of the founder",
    "Could you create a voiceover about family mornings",
    // Idioms convict wherever they appear, not only at the start.
    "We need a voiceover about family mornings and slow breakfasts",
    "The final asset is narration for the closing scene",
    "Here is the script for the voiceover: talk about comfort",
  ];

  for (const text of instructions) {
    it(`triggers on: "${text}"`, () => {
      expect(isVoiceoverInstruction(text)).toBe(true);
    });
  }
});

describe("isVoiceoverInstruction — real scripts (must NOT trigger)", () => {
  const scripts = [
    // Imperative openings are normal ad copy — no speech noun, no trigger.
    "Make your mornings better. Pure linen, woven for the way you actually sleep.",
    "Create memories that last a lifetime — with the people you love most.",
    "Generate excitement wherever you go. The new city bike, ready when you are.",
    "Record every moment with stunning clarity. This is the camera that keeps up.",
    "Say goodbye to restless nights. Say hello to real rest.",
    "Write your own story. One page, one morning, one cup at a time.",
    // The heuristic planner's own composed narration shape.
    "Some things are worth slowing down for. A linen bedding collection — crafted with care, made for real life. Experience it for yourself, today.",
    "Welcome to a new way to sleep. Softness you can feel, quality you can trust.",
    // Long-form narration that mentions audio DEEP in the copy is content.
    "Turn it up and let the room disappear. Every note, exactly where it should be. Because when the day finally ends, your music deserves a system built for the way it was recorded — pure, honest audio.",
    // Non-strings and empties.
    "",
    "   ",
  ];

  for (const text of scripts) {
    it(`stays quiet on: "${String(text).slice(0, 60)}"`, () => {
      expect(isVoiceoverInstruction(text)).toBe(false);
    });
  }

  it("handles non-string inputs", () => {
    expect(isVoiceoverInstruction(null)).toBe(false);
    expect(isVoiceoverInstruction(undefined)).toBe(false);
    expect(isVoiceoverInstruction(42)).toBe(false);
  });
});
