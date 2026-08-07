import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* The three .st-lib browsers (Assets, Brand kits, Projects) each carried
   their own copy of the roving-focus handler, the search field, the card
   button reset and the loading skeleton. These assertions keep the copies
   from creeping back — the extraction only stays valuable if a fourth
   browser reuses it instead of pasting a fifth copy.

   The kit primitives themselves are DOM/React components; the suite runs in
   a Node environment with no renderer, so this pins the structural contract
   rather than rendered output. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const BROWSERS = [
  "src/components/studio/AssetLibraryStudio.js",
  "src/components/studio/BrandKitStudio.js",
  "src/components/studio/MemoryStudio.js",
];

describe("library browsers use the shared kit", () => {
  it.each(BROWSERS)("%s uses useGridRoving instead of its own handler", (file) => {
    const src = read(file);
    expect(src).toContain("useGridRoving");
    /* The hand-rolled handler enumerated the arrow keys inline. */
    expect(src).not.toContain("ArrowRight");
    expect(src).not.toContain("gridTemplateColumns");
  });

  it.each(BROWSERS)("%s uses LibrarySearch and LibrarySkeleton", (file) => {
    const src = read(file);
    expect(src).toContain("LibrarySearch");
    expect(src).toContain("LibrarySkeleton");
    /* The old inline skeleton built its own grid with aria-busy. */
    expect(src).not.toContain('aria-busy="true"');
  });

  it.each(BROWSERS)("%s distinguishes a failed load from an empty collection", (file) => {
    const src = read(file);
    /* A network failure must not render as "you have nothing saved" — the
       user is told their data does not exist when the request merely
       failed. All three now replace the list with ErrorState. */
    expect(src).toContain("ErrorState");
    /* The guard reads differently per browser (one uses a `filtering` flag,
       two check the query directly) but the invariant is the same: the
       empty state is only reached when the list is empty AND there is no
       error, and the error branch is tested first. */
    expect(src).toMatch(/shown\.length === 0[\s\S]{0,40}error|error[\s\S]{0,40}shown\.length === 0/);
    expect(src).toMatch(/<ErrorState[\s\S]{0,120}shown\.length === 0 \?|shown\.length === 0[\s\S]{0,120}<ErrorState/);
  });
});

describe("the shared kit", () => {
  const lib = read("src/components/studio/kit/Library.js");

  it("exports the primitives the browsers import", () => {
    for (const name of ["useGridRoving", "useCopyFeedback", "LibrarySearch", "LibraryCard", "LibrarySkeleton"]) {
      expect(lib).toContain(`export function ${name}`);
    }
    expect(read("src/components/studio/kit/index.js")).toContain("./Library");
  });

  it("keeps the card actions inside .st-item", () => {
    /* .st-item__acts is revealed by :hover/:focus-within on .st-item.
       Flattening that wrapper would silently remove the card actions for
       keyboard users across all three browsers at once. */
    const card = lib.slice(lib.indexOf("export function LibraryCard"));
    const item = card.indexOf('className="st-item"');
    const acts = card.indexOf('className="st-item__acts"');
    expect(item).toBeGreaterThan(-1);
    expect(acts).toBeGreaterThan(item);
    expect(card.indexOf("</div>", acts)).toBeGreaterThan(acts);
  });

  it("handles a missing grid element rather than throwing", () => {
    expect(lib).toContain("if (!el || typeof window === \"undefined\") return 1");
  });
});
