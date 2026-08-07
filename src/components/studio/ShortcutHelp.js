"use client";

import { Modal } from "@/components/studio/kit/Sheet";
import { getTool } from "@/components/studio/kit/tools";

/* ══════════════════════════════════════════════════════════════════════════
   SHORTCUT HELP — the map, opened with ?
   ──────────────────────────────────────────────────────────────────────────
   The studio had exactly two shortcuts (⌘K and Ctrl+Enter) and no way to
   learn either. CanvasStudio had a full private set that existed nowhere
   else. This is the shared map, and it is the only place the chord letters
   are defined — StudioClient imports GO_KEYS from here, so the list a user
   reads and the keys the app listens for can never disagree.
   ══════════════════════════════════════════════════════════════════════════ */

/** `g` then one of these jumps to that studio. Letters are the first letter
    of the tool where that is unambiguous; the collisions (m/music vs
    marketing vs memory) are settled by what people reach for most. */
export const GO_KEYS = {
  a: "orchestrator", // Agent
  i: "image",
  v: "video",
  d: "director",
  s: "audio",        // Sound — "a" is taken by the agent
  m: "music",
  p: "perform",
  k: "marketing",    // "m" is taken by music
  w: "workflows",
  b: "brands",
  r: "memory",       // Projects
  l: "assets",       // Library
};

const KEYS = [
  { keys: ["⌘", "K"], what: "Open the command palette", note: "Ctrl+K on Windows and Linux" },
  { keys: ["⌘", "↵"], what: "Generate", note: "From inside the brief" },
  { keys: ["?"], what: "Show this map" },
  { keys: ["Esc"], what: "Close whatever is open" },
];

export default function ShortcutHelp({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        <section>
          <span className="hs-label">Anywhere</span>
          <ul className="st-keys">
            {KEYS.map((k) => (
              <li key={k.what} className="st-keys__row">
                <span className="st-keys__combo">
                  {k.keys.map((key) => <kbd key={key} className="hs-kbd">{key}</kbd>)}
                </span>
                <span className="st-keys__what">
                  {k.what}
                  {k.note && <em className="hs-hint"> — {k.note}</em>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <span className="hs-label">Go to a studio</span>
          <p className="hs-hint" style={{ marginBottom: "var(--s-2)" }}>
            Press <kbd className="hs-kbd">g</kbd> then the letter. Ignored while you are typing.
          </p>
          <ul className="st-keys">
            {Object.entries(GO_KEYS).map(([key, tool]) => (
              <li key={key} className="st-keys__row">
                <span className="st-keys__combo">
                  <kbd className="hs-kbd">g</kbd>
                  <kbd className="hs-kbd">{key}</kbd>
                </span>
                <span className="st-keys__what">{getTool(tool)?.label || tool}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
