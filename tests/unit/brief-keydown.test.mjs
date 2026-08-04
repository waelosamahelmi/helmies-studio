import { describe, it, expect } from "vitest";
import { shouldSubmitOnKeyDown, isEnterSendGesture } from "@/lib/brief-keydown";

// WebKit/Safari bug fix — the agent chat surface's Enter-to-send silently
// swallowed the keystroke on WebKit because the readiness check (and the
// eventual onSubmit call) trusted a possibly-stale `value` prop/closure
// instead of the textarea's live DOM value. shouldSubmitOnKeyDown is the
// pure decision extracted out of kit/Brief.js's onKeyDown so this can be
// covered without rendering the component. See kit/Brief.js's WebKit notes
// for the full story (the JSX file itself can't be imported here — it has
// no jsx transform configured for the plain-.js vitest environment).

const base = {
  key: "Enter",
  value: "Plan a launch film",
  enterSends: true,
};

describe("shouldSubmitOnKeyDown", () => {
  it("plain Enter with text submits", () => {
    expect(shouldSubmitOnKeyDown(base)).toBe(true);
  });

  it("Shift+Enter does not submit", () => {
    expect(shouldSubmitOnKeyDown({ ...base, shiftKey: true })).toBe(false);
  });

  it("Enter while composing (IME) does not submit, via isComposing", () => {
    expect(shouldSubmitOnKeyDown({ ...base, isComposing: true })).toBe(false);
  });

  it("Enter while composing (IME) does not submit, via keyCode 229 fallback", () => {
    expect(shouldSubmitOnKeyDown({ ...base, keyCode: 229 })).toBe(false);
  });

  it("Enter with an empty value does not submit", () => {
    expect(shouldSubmitOnKeyDown({ ...base, value: "" })).toBe(false);
  });

  it("Enter with a whitespace-only value does not submit", () => {
    expect(shouldSubmitOnKeyDown({ ...base, value: "   \n  " })).toBe(false);
  });

  it("Enter while a run is already generating does not submit", () => {
    expect(shouldSubmitOnKeyDown({ ...base, generating: true })).toBe(false);
  });

  it("Enter on a disabled field does not submit", () => {
    expect(shouldSubmitOnKeyDown({ ...base, disabled: true })).toBe(false);
  });

  it("Enter when unaffordable does not submit", () => {
    expect(shouldSubmitOnKeyDown({ ...base, affordable: false })).toBe(false);
  });

  it("plain Enter does not submit unless the surface opts in (enterSends: false)", () => {
    expect(shouldSubmitOnKeyDown({ ...base, enterSends: false })).toBe(false);
  });

  it("Ctrl+Enter submits even when enterSends is off (generation studios)", () => {
    expect(shouldSubmitOnKeyDown({ ...base, enterSends: false, ctrlKey: true })).toBe(true);
  });

  it("Cmd (meta)+Enter submits even when enterSends is off", () => {
    expect(shouldSubmitOnKeyDown({ ...base, enterSends: false, metaKey: true })).toBe(true);
  });

  it("a non-Enter key never submits", () => {
    expect(shouldSubmitOnKeyDown({ ...base, key: "a" })).toBe(false);
  });

  it("Alt+Enter does not submit even with enterSends on", () => {
    expect(shouldSubmitOnKeyDown({ ...base, altKey: true })).toBe(false);
  });
});

describe("isEnterSendGesture", () => {
  it("plain Enter is a send gesture when enterSends is on", () => {
    expect(isEnterSendGesture({ key: "Enter", enterSends: true })).toBe(true);
  });

  it("plain Enter is NOT a send gesture when enterSends is off", () => {
    expect(isEnterSendGesture({ key: "Enter", enterSends: false })).toBe(false);
  });

  it("Shift+Enter is never a send gesture, regardless of enterSends", () => {
    expect(isEnterSendGesture({ key: "Enter", shiftKey: true, enterSends: true })).toBe(false);
  });

  it("Ctrl+Enter is always a send gesture, even with enterSends off", () => {
    expect(isEnterSendGesture({ key: "Enter", ctrlKey: true, enterSends: false })).toBe(true);
  });

  it("readiness plays no part — an empty value is still a send gesture", () => {
    // isEnterSendGesture only decides whether to swallow the default
    // newline; shouldSubmitOnKeyDown is what gates the actual submit.
    expect(isEnterSendGesture({ key: "Enter", enterSends: true })).toBe(true);
  });
});
