import { describe, it, expect } from "vitest";
import {
  parseAssetRequestBlock,
  stripAssetRequestBlock,
  buildChatSystemPrompt,
  parseQuestionBlock,
} from "../../src/lib/agent-chat.js";
import { buildReceipt, usableUrls } from "../../src/lib/agent-assets.js";

const block = (json) => "Here is what I need.\n\n```asset-request\n" + JSON.stringify(json) + "\n```";

describe("parseAssetRequestBlock", () => {
  it("reads the slots a production needs", () => {
    const parsed = parseAssetRequestBlock(block({
      intro: "Three things.",
      assets: [
        { key: "actor", kind: "character", name: "Wael", label: "You", hint: "2-3 photos", min: 1, max: 6 },
        { key: "logo", kind: "logo", label: "Your logo" },
      ],
    }));
    expect(parsed.intro).toBe("Three things.");
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.assets[0]).toMatchObject({ key: "actor", kind: "character", name: "Wael", accept: "image", min: 1, max: 6 });
    expect(parsed.assets[1].accept).toBe("image");
  });

  it("gives a voice slot its owner, because a voice with no owner can never be chosen", () => {
    const parsed = parseAssetRequestBlock(block({
      assets: [{ key: "v", kind: "voice", voiceFor: "Wael", label: "Your voice" }],
    }));
    expect(parsed.assets[0]).toMatchObject({ kind: "voice", accept: "audio", voiceFor: "Wael" });
  });

  it("falls back to the slot name when voiceFor is omitted", () => {
    const parsed = parseAssetRequestBlock(block({
      assets: [{ key: "v", kind: "voice", name: "Wael", label: "Your voice" }],
    }));
    expect(parsed.assets[0].voiceFor).toBe("Wael");
  });

  it("drops slots of an unknown kind rather than rendering an unfillable card", () => {
    const parsed = parseAssetRequestBlock(block({
      assets: [{ key: "a", kind: "character", label: "You" }, { key: "b", kind: "hologram", label: "?" }],
    }));
    expect(parsed.assets.map((a) => a.kind)).toEqual(["character"]);
  });

  it("returns null when NOTHING is fillable — an empty upload card is worse than none", () => {
    expect(parseAssetRequestBlock(block({ assets: [{ kind: "hologram" }] }))).toBeNull();
    expect(parseAssetRequestBlock(block({ assets: [] }))).toBeNull();
  });

  it("survives malformed JSON as prose instead of throwing", () => {
    expect(parseAssetRequestBlock("```asset-request\n{not json\n```")).toBeNull();
    expect(parseAssetRequestBlock("no block here")).toBeNull();
    expect(parseAssetRequestBlock(null)).toBeNull();
  });

  it("takes the LAST block, matching how question blocks resolve", () => {
    const text = block({ assets: [{ key: "a", kind: "character", name: "First" }] })
      + "\n" + block({ assets: [{ key: "b", kind: "product", name: "Second" }] });
    expect(parseAssetRequestBlock(text).assets[0].name).toBe("Second");
  });

  it("de-duplicates keys so one slot cannot silently overwrite another's files", () => {
    const parsed = parseAssetRequestBlock(block({
      assets: [
        { key: "same", kind: "character", name: "A" },
        { key: "same", kind: "product", name: "B" },
      ],
    }));
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0].name).toBe("A");
  });

  it("clamps max into range and defaults min to required", () => {
    const parsed = parseAssetRequestBlock(block({
      assets: [
        { key: "a", kind: "character", max: 999 },
        { key: "b", kind: "product", required: false },
      ],
    }));
    expect(parsed.assets[0].max).toBe(8);
    expect(parsed.assets[0].min).toBe(1);
    expect(parsed.assets[1].min).toBe(0);
  });

  it("strips the block from the prose the user reads", () => {
    const text = block({ assets: [{ key: "a", kind: "character" }] });
    const prose = stripAssetRequestBlock(text);
    expect(prose).toBe("Here is what I need.");
    expect(prose).not.toContain("asset-request");
  });
});

describe("the chat prompt", () => {
  it("teaches the asset-request contract", () => {
    const prompt = buildChatSystemPrompt({});
    expect(prompt).toContain("asset-request");
    expect(prompt).toContain("voiceFor");
    // The order rule is what stops a run rendering a stranger's face.
    expect(prompt).toContain("ORDER OF BUSINESS");
  });

  it("lists what the user already has so it never asks twice", () => {
    const prompt = buildChatSystemPrompt({
      inventory: {
        entities: [{ name: "Wael", kind: "character", references: 3, hasVoice: true }],
        brandKits: [{ name: "Helmies", hasLogo: false, colors: "#ff2d8f" }],
        voiceProfiles: [{ name: "Wael", status: "ready" }],
      },
    });
    expect(prompt).toContain("Wael (character, voice on file, 3 references)");
    // A kit with no logo is exactly when it SHOULD ask.
    expect(prompt).toContain("NO logo");
  });

  it("says plainly when there is nothing on file", () => {
    expect(buildChatSystemPrompt({})).toContain("nothing on file yet");
  });

  it("still carries the question contract — the new block did not displace it", () => {
    const prompt = buildChatSystemPrompt({});
    expect(prompt).toContain("```question");
    expect(prompt).toContain("plan-ready");
  });

  it("a turn cannot be read as both an upload card and a question", () => {
    // The prompt forbids combining them; this pins the parsers' independence
    // so the route's precedence rule (assets outrank questions) is the only
    // place the ambiguity is resolved.
    const both = block({ assets: [{ key: "a", kind: "character" }] })
      + '\n```question\n{"question":"Which?","options":["A","B"]}\n```';
    expect(parseAssetRequestBlock(both)).not.toBeNull();
    expect(parseQuestionBlock(both)).not.toBeNull();
  });
});

describe("a character nobody has a photograph of", () => {
  it("carries the proposed description through the parser", () => {
    const parsed = parseAssetRequestBlock(block({
      assets: [{
        key: "villain",
        kind: "character",
        name: "The Collector",
        label: "The supervillain",
        description: "Tall man in his fifties, gaunt, close-cropped grey hair, long charcoal coat.",
        min: 0,
      }],
    }));
    expect(parsed.assets[0].description).toContain("charcoal coat");
    expect(parsed.assets[0].min).toBe(0);
  });

  it("is filed as an identity, not skipped — same words in every shot", () => {
    const receipt = buildReceipt([{
      key: "villain",
      kind: "character",
      entity: { id: "ent_9", name: "The Collector", kind: "character" },
      created: true,
      added: 0,
      describedOnly: true,
    }]);
    expect(receipt).toContain("ent_9");
    expect(receipt).toContain("description alone");
    // The honest part: the face is invented. It just stops being RE-invented.
    expect(receipt).toContain("invents the SAME one");
  });

  it("tells the assistant to propose descriptions, not just ask for uploads", () => {
    const prompt = buildChatSystemPrompt({});
    expect(prompt).toContain("LIST EVERY PERSON, PRODUCT AND PLACE");
    expect(prompt).toContain('"description"');
  });
});

describe("usableUrls", () => {
  it("keeps uploads and https, drops everything else", () => {
    expect(usableUrls([
      "/api/media/local/a.png",
      "/uploads/b.png",
      "https://example.com/c.png",
      "http://example.com/insecure.png",
      "javascript:alert(1)",
      "",
      null,
    ])).toEqual(["/api/media/local/a.png", "/uploads/b.png", "https://example.com/c.png"]);
  });

  it("de-duplicates and accepts {url} objects", () => {
    expect(usableUrls([{ url: "/uploads/a.png" }, "/uploads/a.png"])).toEqual(["/uploads/a.png"]);
  });

  it("caps how many one slot can carry", () => {
    expect(usableUrls(Array.from({ length: 30 }, (_, i) => `/uploads/${i}.png`))).toHaveLength(8);
  });
});

describe("buildReceipt", () => {
  it("names the ids, because the ids are what the next turn has to use", () => {
    const receipt = buildReceipt([
      { key: "actor", kind: "character", entity: { id: "ent_1", name: "Wael", kind: "character" }, created: true, added: 3 },
    ]);
    expect(receipt).toContain("ent_1");
    expect(receipt).toContain("3 reference images");
    expect(receipt).toContain("Go ahead and plan");
  });

  it("reports a reused identity as reused, not created", () => {
    const receipt = buildReceipt([
      { key: "a", kind: "character", entity: { id: "ent_1", name: "Wael", kind: "character" }, created: false, added: 0 },
    ]);
    expect(receipt).toContain("reused");
    expect(receipt).not.toContain("created");
  });

  it("says when a voice was trimmed, so a silent re-encode is never a surprise", () => {
    const receipt = buildReceipt([
      { key: "v", kind: "voice", voice: true, entity: { id: "ent_1", name: "Wael" }, samples: [{ trimmed: true }] },
    ]);
    expect(receipt).toContain("Voice for Wael");
    expect(receipt).toContain("trimmed");
  });

  it("surfaces a voice nobody owns instead of dropping the file", () => {
    const receipt = buildReceipt([
      { key: "v", kind: "voice", voiceProfile: { id: "vp_1" }, orphan: true, owner: "Ghost" },
    ]);
    expect(receipt).toContain("Ghost");
    expect(receipt).toContain("ask me who it belongs to");
  });

  it("reports a failure as a failure", () => {
    const receipt = buildReceipt([{ key: "a", kind: "logo", error: "disk full" }]);
    expect(receipt).toContain("could not be filed");
    expect(receipt).toContain("disk full");
  });

  it("does not claim assets exist when none were filed", () => {
    expect(buildReceipt([])).not.toContain("Go ahead and plan");
  });
});
