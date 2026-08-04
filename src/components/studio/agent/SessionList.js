"use client";

import { useState } from "react";
import { Group, Sheet, IcHistory } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   SESSION LIST — new / history / resume (EDITSv1 E3.6)
   ──────────────────────────────────────────────────────────────────────────
   Newest 5 sessions inline (title + relative time), the rest behind a
   "Show all" sheet. Selecting resumes; "New session" starts fresh.
   ══════════════════════════════════════════════════════════════════════════ */

function relTime(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function SessionButton({ session, active, onSelect, disabled }) {
  return (
    <button
      type="button"
      className={`st-sessions__item${active ? " is-active" : ""}`}
      onClick={() => onSelect?.(session.id)}
      disabled={disabled}
      aria-current={active ? "true" : undefined}
    >
      <span className="st-sessions__title">{session.title || "New session"}</span>
      <span className="st-sessions__time">{relTime(session.updatedAt)}</span>
    </button>
  );
}

export default function SessionList({ sessions = [], activeId, onSelect, onNew, busy = false }) {
  const [showAll, setShowAll] = useState(false);
  const top = sessions.slice(0, 5);

  return (
    <Group
      label="Sessions"
      right={
        <button
          type="button"
          className="hs-btn hs-btn--ghost hs-btn--sm"
          onClick={onNew}
          disabled={busy}
        >
          New session
        </button>
      }
    >
      {sessions.length === 0 ? (
        <p className="hs-hint">Your conversations are saved here — send a message to start one.</p>
      ) : (
        <>
          {/* role="list" may contain ONLY role="listitem" children — the
              "Show all" button lives outside it, or axe reports
              aria-required-children (critical). It only surfaced once a user
              had more sessions than fit the preview, which is why it read as
              intermittent. */}
          <div className="st-sessions" role="list" aria-label="Saved sessions">
            {top.map((session) => (
              <div key={session.id} role="listitem">
                <SessionButton
                  session={session}
                  active={session.id === activeId}
                  onSelect={onSelect}
                  disabled={busy}
                />
              </div>
            ))}
          </div>

          {sessions.length > top.length && (
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--block"
              onClick={() => setShowAll(true)}
            >
              <IcHistory className="hs-icon-sm" /> Show all ({sessions.length})
            </button>
          )}
        </>
      )}

      <Sheet open={showAll} onClose={() => setShowAll(false)} title="All sessions">
        <div className="st-sessions" role="list" aria-label="All saved sessions">
          {sessions.map((session) => (
            <div key={session.id} role="listitem">
              <SessionButton
                session={session}
                active={session.id === activeId}
                onSelect={(id) => { setShowAll(false); onSelect?.(id); }}
                disabled={busy}
              />
            </div>
          ))}
        </div>
      </Sheet>
    </Group>
  );
}
