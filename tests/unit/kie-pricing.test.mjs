import { describe, it, expect, vi } from "vitest";
import { getPricing } from "@/lib/kie-pricing-core.mjs";

/* These are the exact ids that were mispriced in production. A $1.28 model
   was being billed at 8 credits (EUR 0.08) per run, because nothing matched
   it and it fell through to the $0.03 video default. */
describe("getPricing", () => {
  it("prices a punctuated veo-3 id from the veo3 override", () => {
    // The old rule refused any key shorter than five characters, which
    // excluded "veo3" itself — the very key that would have saved it.
    expect(getPricing("generate-veo-3-video", "video")).toBe(1.28);
    expect(getPricing("veo-3", "video")).toBe(1.28);
    expect(getPricing("veo3", "video")).toBe(1.28);
  });

  it("prices a namespaced seedance id", () => {
    expect(getPricing("bytedance/seedance-2", "video")).toBe(0.57);
    expect(getPricing("bytedance/seedance-1.5-pro", "video")).toBe(0.26);
  });

  it("never prices a specific variant as its cheaper base", () => {
    // Longest key first. Without that ordering "wan-2-7-image" matches
    // "wan-2-7-image-pro" and the pro variant bills at half price.
    expect(getPricing("wan-2-7-image-pro", "image")).toBe(0.04);
    expect(getPricing("wan-2-7-image", "image")).toBe(0.02);
  });

  it("still honours an exact id above any partial match", () => {
    expect(getPricing("nano-banana-pro", "image")).toBe(0.09);
    expect(getPricing("nano-banana", "image")).toBe(0.04);
  });

  it("says so loudly when it has to guess a video price", () => {
    // A quiet guess here is a quiet loss on every run.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getPricing("some-brand-new-video-model-nobody-listed", "video");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no price known for video model"));
    warn.mockRestore();
  });

  it("does not shout about an unknown still, where the default is close enough", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getPricing("some-new-image-model", "image");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
