"use client";

/* ══════════════════════════════════════════════════════════════════════════
   STUDIO HISTORY — the prompts you have already written
   ──────────────────────────────────────────────────────────────────────────
   Every tool asked the user to retype or remember their last brief. There
   was no recall anywhere in the studio: refresh the page, switch tools, or
   come back tomorrow and the wording was gone, even though the generation
   itself was safely in the gallery.

   Recording happens in ONE place — useAsyncGeneration's submit, which all
   17 tool files funnel through — so every tool gains history without a
   per-tool edit, and a tool added later gets it for free.

   Local, not server-side, on purpose: this is a convenience buffer for the
   device you are working on, it must survive a failed request, and it must
   never cost a round trip while the user is typing. The durable record of
   what was actually made is the Generation row, which the gallery renders.

   Entries are keyed by tool so a tool can show its own history first, but
   the store is shared so "reuse the wording from that image brief in a
   video" works — which is the whole point of one studio rather than twelve.
   ══════════════════════════════════════════════════════════════════════════ */

export const HISTORY_KEY = "helmies.studio.history";
export const HISTORY_LIMIT = 60;
const HISTORY_EVENT = "helmies:history";
/* Below this a "prompt" is a fragment, not something worth recalling. */
const MIN_PROMPT = 3;

const canStore = () => typeof window !== "undefined";

export function readHistory() {
  if (!canStore()) return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    /* private mode, quota, or a corrupt entry — history is a convenience,
       never a reason to break the studio */
    return [];
  }
}

function write(entries) {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded — drop silently rather than interrupt a generation */
  }
  /* Same-tab listeners: the native `storage` event only fires in OTHER
     tabs, so a component in this tab would never see its own write. */
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: entries }));
}

/**
 * Record a prompt. Called from the generation hook, not from tool code.
 * Re-submitting the same wording moves it to the top instead of stacking
 * duplicates — a retry is not a second idea.
 */
export function recordPrompt({ tool, prompt, model }) {
  if (!canStore()) return;
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (text.length < MIN_PROMPT) return;

  /* `at` is a display timestamp and is NOT unique — two submits inside the
     same millisecond collide, and deleting one would take the other with
     it. `id` is the identity; `at` is only ever shown. */
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool,
    prompt: text,
    model: model || null,
    at: Date.now(),
  };
  const rest = readHistory().filter(
    (e) => !(e.prompt === text && e.tool === tool),
  );
  write([entry, ...rest].slice(0, HISTORY_LIMIT));
}

export function clearHistory() {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch { /* nothing to do */ }
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: [] }));
}

export function removeEntry(id) {
  write(readHistory().filter((e) => e.id !== id));
}

/** Subscribe to changes from this tab and from other tabs. */
export function subscribeHistory(fn) {
  if (!canStore()) return () => {};
  const local = (e) => fn(e.detail ?? readHistory());
  const cross = (e) => { if (e.key === HISTORY_KEY) fn(readHistory()); };
  window.addEventListener(HISTORY_EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(HISTORY_EVENT, local);
    window.removeEventListener("storage", cross);
  };
}
