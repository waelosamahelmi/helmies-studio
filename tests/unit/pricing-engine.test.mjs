// tests/unit/pricing-engine.test.mjs
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { providerConfig: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

import { calculateCredits } from "@/lib/pricing-engine";

describe("calculateCredits", () => {
  it("applies 2.5x default markup at 1 credit = €0.01", () => {
    // €0.10 provider cost * 2.5 / 0.01 = 25 credits
    expect(calculateCredits(0.1)).toBe(25);
  });

  it("rounds up, never down", () => {
    // 0.001 * 2.5 / 0.01 = 0.25 → 1
    expect(calculateCredits(0.001)).toBe(1);
    // 0.0333 * 2.5 / 0.01 = 8.325 → 9
    expect(calculateCredits(0.0333)).toBe(9);
  });

  it("charges a minimum of 1 credit", () => {
    expect(calculateCredits(0)).toBe(1);
    expect(calculateCredits(-5)).toBe(1);
    expect(calculateCredits(null)).toBe(1);
    expect(calculateCredits(undefined)).toBe(1);
  });

  it("honors a per-provider markup override", () => {
    // €0.10 * 4.0 / 0.01 = 40
    expect(calculateCredits(0.1, 4.0)).toBe(40);
  });
});
