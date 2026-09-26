/* The still every clip derives from sent its references unlabelled, cut at
   three, with the room taking two — so in a wide of three people the third
   was dropped and the model cast whichever face it liked (2026-09-26). */
import { describe, expect, it } from "vitest";
import { castReferencesForShot } from "../../src/lib/entity-core.mjs";

const person = (id, name, n = 3) => ({ id, name, kind: "character", references: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, kind: ["face_front", "full_body", "face_34"][i % 3], source: "generated", url: `https://cdn/${id}-${i}.jpg`, createdAt: `2026-09-2${i}` })) });
const room = { id: "r", name: "Train Car", kind: "environment", references: [{ id: "r0", kind: "master", source: "generated", url: "https://cdn/room-0.jpg" }, { id: "r1", kind: "reverse", source: "generated", url: "https://cdn/room-1.jpg" }] };

describe("castReferencesForShot", () => {
  it("in a wide of three people every person gets one picture before the room gets a second", () => {
    const cast = castReferencesForShot([room, person("lily", "Lily"), person("tomas", "Tomas"), person("emily", "Emily")], { framing: "wide shot", max: 4 });
    expect(cast.urls).toHaveLength(4);
    expect(cast.groups.map((g) => g.name)).toEqual(["Train Car", "Lily", "Tomas", "Emily"]);
    expect(cast.groups.every((g) => g.positions.length === 1)).toBe(true);
    expect(cast.legend).toMatch(/image 1 is the location Train Car; image 2 is Lily; image 3 is Tomas; image 4 is Emily/);
  });

  it("with room to spare, a wide gives the place a second picture", () => {
    const cast = castReferencesForShot([room, person("lily", "Lily")], { framing: "wide shot", max: 4 });
    expect(cast.groups.find((g) => g.isPlace).positions).toEqual([1, 3]);
  });

  it("a close-up leads with the face and never sends two of one person when two people are in it", () => {
    const cast = castReferencesForShot([room, person("lily", "Lily"), person("tomas", "Tomas")], { framing: "close-up on her eyes", max: 4 });
    expect(cast.groups[0].name).toBe("Lily");
    expect(cast.groups.filter((g) => !g.isPlace).every((g) => g.positions.length === 1)).toBe(true);
  });

  it("respects the model's slot and reports who has nothing on file rather than inventing", () => {
    const cast = castReferencesForShot([room, person("lily", "Lily"), person("nobody", "Marcus", 0)], { framing: "medium shot", max: 2 });
    expect(cast.urls).toHaveLength(2);
    expect(cast.unreferenced).toEqual(["Marcus"]);
    expect(cast.legend).not.toContain("Marcus");
  });
});
