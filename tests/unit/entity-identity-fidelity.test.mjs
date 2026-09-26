/* Uploading a photograph and generating the angles changed what the
   character looked like (2026-09-25): the written description and attributes
   were prefixed onto every angle prompt, and where they disagreed with the
   photograph the model followed the words. For the identity pack the
   photograph is the authority. */
import { describe, expect, it } from "vitest";
import { injectEntities, identityFidelityBlock } from "../../src/lib/entity-inject.js";

const entity = {
  id: "e1", userId: "u1", kind: "character", name: "Mina",
  description: "A tall woman with short blonde hair in a red coat",
  attributes: { hair: "short blonde", build: "tall", wardrobe: "red wool coat" },
  references: [{ id: "r1", kind: "source", source: "user", url: "https://cdn/mina.jpg", createdAt: "2026-09-25" }],
};
const prisma = { studioEntity: { findMany: async () => [entity] } };
const schema = { fields: { prompt: { type: "string" }, image_urls: { type: "array" } } };

describe("identity renders", () => {
  it("send the photograph and a fidelity instruction — never the written description or attributes", async () => {
    const out = await injectEntities({ prisma, userId: "u1", entityIds: ["e1"], params: {}, schema, purpose: "identity" });
    expect(out.params.image_urls).toEqual(["https://cdn/mina.jpg"]);
    expect(out.promptPrefix).toContain("Mina");
    expect(out.promptPrefix).toMatch(/exact person in the reference photograph/);
    for (const word of ["blonde", "red", "coat", "tall"]) expect(out.promptPrefix).not.toContain(word);
  });

  it("every other purpose still carries the written description", async () => {
    const out = await injectEntities({ prisma, userId: "u1", entityIds: ["e1"], params: {}, schema, purpose: "closeup" });
    expect(out.promptPrefix).toContain("short blonde");
  });

  it("names the subject by kind", () => {
    expect(identityFidelityBlock({ kind: "environment", name: "The Hall" })).toMatch(/exact place/);
    expect(identityFidelityBlock({ kind: "product", name: "Bottle" })).toMatch(/exact object/);
  });
});

describe("identity references", () => {
  it("come only from what the user uploaded — a generated angle never feeds the next one", async () => {
    const { selectEntityReferences } = await import("../../src/lib/entity-core.mjs");
    const withGenerated = { ...entity, references: [
      { id: "g1", kind: "face_front", source: "generated", url: "https://cdn/gen-front.jpg", createdAt: "2026-09-24" },
      { id: "g2", kind: "face_34", source: "generated", url: "https://cdn/gen-34.jpg", createdAt: "2026-09-24" },
      ...entity.references,
    ] };
    expect(selectEntityReferences(withGenerated, { purpose: "identity", max: 4 }).map((r) => r.url)).toEqual(["https://cdn/mina.jpg"]);
    // Every other purpose still uses the full pack.
    expect(selectEntityReferences(withGenerated, { purpose: "closeup", max: 4 }).length).toBe(3);
    // A place with only a generated anchor still derives its other views from it.
    const place = { kind: "environment", references: [{ id: "a", kind: "master", source: "generated", url: "https://cdn/room.jpg", createdAt: "2026-09-24" }] };
    expect(selectEntityReferences(place, { purpose: "identity", max: 4 }).map((r) => r.url)).toEqual(["https://cdn/room.jpg"]);
  });
});
