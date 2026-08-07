import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* Six surfaces hand-rolled the same meter-and-button row because <Brief>
   will not submit while its textarea is empty. They drifted, and the
   costliest drift was positional: Clipping put its primary action in the
   left rail, so moving Video → Clips relocated "go" across the screen.

   These pin the adoption. The kit primitives are React components and the
   suite runs in a Node environment, so this asserts the structural
   contract rather than rendered output. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const ADOPTERS = [
  "src/components/studio/ImageStudio.js",
  "src/components/studio/ClippingStudio.js",
  "src/components/studio/VideoEditStudio.js",
  "src/components/studio/WorkflowStudio.js",
];

describe("Commit adoption", () => {
  it.each(ADOPTERS)("%s uses the shared dock", (file) => {
    const src = read(file);
    expect(src).toContain("<Commit");
    /* The hand-rolled docks all built their own .st-spend grid. */
    expect(src).not.toContain('<div className="st-spend">');
  });

  it("tells the user what is missing rather than only disabling", () => {
    for (const file of ADOPTERS) {
      expect(read(file)).toMatch(/blocked=\{/);
    }
  });
});

describe("Commit", () => {
  const src = read("src/components/studio/kit/Commit.js");

  it("keeps the primary primary when the work cannot be cancelled", () => {
    /* Workflows and Director have no cancel: a running job cannot be
       detached, so the button must not turn into a dead outline. */
    expect(src).toContain("generating && onCancel ?");
  });

  it("hides the cost badge while working", () => {
    /* The number is a price, not a progress readout. */
    expect(src).toContain("cost > 0 && !generating");
  });

  it("supports a sidebar layout without the bottom-dock chrome", () => {
    expect(src).toContain("if (block) {");
    /* The block branch must return BEFORE the .st-dock-prompt wrapper —
       a sidebar dock sits in an already-laid-out rail and must not inherit
       the bottom-dock chrome. */
    const wrapper = 'className="st-dock-prompt"';
    const blockBranch = src.slice(src.indexOf("if (block) {"), src.indexOf(wrapper));
    expect(blockBranch).toContain("return (");
    expect(blockBranch).not.toContain(wrapper);
  });
});

describe("manual clip ranges", () => {
  const src = read("src/components/studio/ClippingStudio.js");

  it("draws a range on drag and still scrubs on click", () => {
    expect(src).toContain("if (!drew) seek(from);");
    expect(src).toContain('draft-');
  });

  it("cleans up on pointercancel", () => {
    /* An interrupted touch never fires pointerup; without this the draw
       stays live and the next tap resizes the stray range. */
    const scrub = src.slice(src.indexOf("const scrub ="), src.indexOf("/* ── Range editing"));
    expect(scrub).toContain('window.addEventListener("pointercancel", up)');
    expect(scrub).toContain('window.removeEventListener("pointercancel", up)');
  });

  it("keeps hand-drawn ranges when a run returns", () => {
    /* A re-run used to replace the whole list and silently destroy them. */
    expect(src).toContain('prev.filter((c) => String(c.id).startsWith("draft-"))');
  });
});
