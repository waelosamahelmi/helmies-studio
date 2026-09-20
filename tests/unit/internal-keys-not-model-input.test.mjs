// Our own bookkeeping must never be submitted as model input.
//
// Production incident (2026-09-20, project cmu9znrtb000tjuktbekdixsr): every
// agent-run image step against qwen/text-to-image failed with KIE
// `failCode 500 / "Internal Error"` and `creditsConsumed: 0`. The cause was
// not the provider and not the prompt — agent-runner.js's enqueueJob puts
// `agentRunId`/`stepId` on the job payload (the webhook needs them to find
// the step again) and the plan carries `referenceOnly` (a display flag:
// "internal reference, keep it out of the final results"). The KIE adapter's
// GENERIC Market envelope spread the whole payload into `input`, so all
// three reached the provider as if they were model fields. KIE answers an
// unknown input key with a bare 500, which reads like an outage.
//
// The dedicated families (Flux Kontext, GPT-4o, Suno) were never affected —
// they build their bodies field-by-field. Only the generic envelope and
// Alibaba's async builder (which ends in a catch-all `else input[key] =
// value`) forwarded unknown keys verbatim, which is exactly why this is
// asserted against those two shapes.
import { describe, it, expect } from "vitest";

const { PROVIDERS } = await import("@/lib/providers.js");
const { formatAlibabaPayload } = await import("@/lib/alibaba-provider-core.mjs");

const INTERNAL_KEYS = ["agentRunId", "stepId", "referenceOnly"];

// A realistic agent-run step payload: the real model fields, plus the three
// internal ones the runner/plan attach.
// The prompt travels as the builders' second argument, not in params.
const agentStepParams = {
  endpoint: "qwen/text-to-image",
  aspect_ratio: "1:1",
  referenceOnly: true,
  stepId: "step-1",
  agentRunId: "d242c0ed-ca49-4266-8a11-ed4f0871a21b",
};

describe("internal bookkeeping keys never reach a provider as model input", () => {
  it("KIE generic Market envelope strips them from input", () => {
    const body = PROVIDERS.kie.formatPayload("qwen/text-to-image", "A pizza", agentStepParams);

    expect(Object.keys(body.input)).toEqual(expect.arrayContaining(["prompt", "aspect_ratio"]));
    for (const key of INTERNAL_KEYS) {
      expect(body.input, `${key} must not be model input`).not.toHaveProperty(key);
    }
  });

  it("KIE keeps the real model fields it is supposed to send", () => {
    const body = PROVIDERS.kie.formatPayload("qwen/text-to-image", "A pizza", agentStepParams);

    expect(body.model).toBe("qwen/text-to-image");
    expect(body.input.prompt).toBe("A pizza");
    expect(body.input.aspect_ratio).toBe("1:1");
    // callBackUrl belongs on the envelope, not inside `input`.
    expect(body.callBackUrl).toContain("/api/webhooks/generation-complete");
  });

  it("Alibaba's async builder strips them despite its catch-all", () => {
    // wan2.x routes async — the shape whose `else input[key] = value` would
    // otherwise forward anything it does not recognize.
    const body = formatAlibabaPayload("wan2.2-t2v-plus", "A pizza", {
      ...agentStepParams,
      endpoint: "wan2.2-t2v-plus",
    });

    for (const key of INTERNAL_KEYS) {
      expect(body.input, `${key} must not be model input`).not.toHaveProperty(key);
      expect(body.parameters || {}, `${key} must not be a parameter`).not.toHaveProperty(key);
    }
    expect(body.input.prompt).toBe("A pizza");
  });
});
