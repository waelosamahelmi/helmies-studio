import { describe, it, expect, vi, beforeEach } from "vitest";

const submitOnly = vi.fn(async () => ({ requestId: null, submitData: { ok: true } }));
vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(() => ({ name: "KIE" })),
  submitOnly,
  pollProviderResult: vi.fn(),
}));

const { generateI2I, generateVideo } = await import("@/lib/generation");

beforeEach(() => vi.clearAllMocks());

const sentPayload = () => submitOnly.mock.calls[0][2];

describe("a payload carries what the model asks for", () => {
  it("forwards a field the hand-written list has never heard of", async () => {
    // The exact production failure: seedream's edit models require
    // `image_urls` (plural), which appears in none of the builders' lists,
    // so a shot carrying a face was submitted WITHOUT the face and the
    // provider answered "This field is required".
    await generateI2I({
      model: "seedream/5-pro-image-to-image",
      prompt: "a room",
      image_urls: ["https://cdn/face.png"],
      quality: "high",
      _schema: { fields: { prompt: {}, image_urls: {}, quality: {} } },
    });
    expect(sentPayload().image_urls).toEqual(["https://cdn/face.png"]);
  });

  it("does not invent fields the model never declared", async () => {
    await generateI2I({
      model: "m",
      prompt: "x",
      some_random_thing: "nope",
      _schema: { fields: { prompt: {} } },
    });
    expect(sentPayload().some_random_thing).toBeUndefined();
  });

  it("leaves the hand-written behaviour alone when no schema is supplied", async () => {
    // Every caller without a schema must keep working exactly as before —
    // this ADDS a source of truth, it does not replace one.
    await generateI2I({ model: "m", prompt: "x", image_url: "https://cdn/a.png" });
    expect(sentPayload().image_url).toBe("https://cdn/a.png");
    expect(sentPayload().prompt).toBe("x");
  });

  it("never overwrites a value the builder already shaped", async () => {
    // generateImage upper-cases resolution; the schema pass must not undo
    // transformations the list applies on purpose.
    await generateVideo({
      model: "m", prompt: "x", duration: 5, resolution: "720p",
      _schema: { fields: { prompt: {}, duration: {}, resolution: {} } },
    });
    expect(sentPayload().resolution).toBe("720p");
    expect(sentPayload().duration).toBe(5);
  });

  it("skips empty values rather than sending blanks", async () => {
    await generateI2I({
      model: "m", prompt: "x", image_urls: [], negative_prompt: "",
      _schema: { fields: { prompt: {}, image_urls: {}, negative_prompt: {} } },
    });
    expect(sentPayload().image_urls).toBeUndefined();
    expect(sentPayload().negative_prompt).toBeUndefined();
  });

  it("never sends the schema itself upstream", async () => {
    await generateI2I({ model: "m", prompt: "x", _schema: { fields: { prompt: {} } } });
    expect(sentPayload()._schema).toBeUndefined();
  });
});
