/* ══════════════════════════════════════════════════════════════════════════
   BRIEF KEYDOWN — pure decision logic for the prompt dock's Enter-to-send
   ──────────────────────────────────────────────────────────────────────────
   Extracted out of components/studio/kit/Brief.js so it's unit-testable
   without a DOM or a React renderer: no JSX, no hooks, just a plain
   function from a keydown-shaped descriptor to a boolean.

   Mirrors Brief's onKeyDown exactly:
     - Ctrl/Cmd+Enter always submits when ready (any studio).
     - Plain Enter submits only when the surface opts in via `enterSends`
       (the chat-style surfaces) and no modifier is held.
     - Shift+Enter never submits — it's the textarea's newline.
     - An Enter that's confirming IME composition never submits, checked via
       `isComposing` OR `keyCode === 229` — Safari/WebKit's synthetic
       KeyboardEvent exposes composition state through the native event
       (isComposing), not through React's SyntheticKeyboardEvent interface,
       which doesn't forward it; keyCode 229 is the cross-browser fallback
       every engine agrees on.
     - Never submits an empty/whitespace brief, while a run is already in
       flight (`generating`), while `disabled`, or when unaffordable.

   `value` is expected to be the LIVE textarea value (e.currentTarget.value)
   rather than a possibly-stale `value` prop/closure — see kit/Brief.js's
   WebKit notes for why that distinction is load-bearing on WebKit.
   ══════════════════════════════════════════════════════════════════════════ */

export function shouldSubmitOnKeyDown({
  key,
  shiftKey = false,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  isComposing = false,
  keyCode,
  value = "",
  generating = false,
  disabled = false,
  affordable = true,
  enterSends = false,
}) {
  if (isComposing || keyCode === 229) return false;
  if (key !== "Enter") return false;

  const ready = !!value.trim() && !generating && !disabled && affordable;
  if (!ready) return false;

  if (ctrlKey || metaKey) return true;
  return enterSends && !shiftKey && !ctrlKey && !metaKey && !altKey;
}

// Whether an Enter keydown is a "send gesture" at all — independent of
// readiness. Brief uses this to decide whether to preventDefault() (i.e.
// swallow the textarea's default newline) even when the brief isn't ready
// yet (e.g. empty), exactly matching the pre-existing behavior: enterSends
// surfaces never let plain Enter insert a newline, ready or not — only
// Shift+Enter does. Kept separate from shouldSubmitOnKeyDown because
// preventDefault must NOT run during IME composition (it would break the
// composition), so callers must still guard on isComposing/keyCode 229
// themselves before calling this.
export function isEnterSendGesture({ key, shiftKey = false, ctrlKey = false, metaKey = false, altKey = false, enterSends = false }) {
  if (key !== "Enter") return false;
  if (ctrlKey || metaKey) return true;
  return enterSends && !shiftKey && !altKey;
}
