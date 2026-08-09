"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IcUpload, IcCheck, useUpload } from "@/components/studio/kit";
import { useVoiceInput, useVoiceOutput } from "@/components/studio/agent/useVoice";

/* ══════════════════════════════════════════════════════════════════════════
   THE CALL — talking to the studio instead of typing at it
   ──────────────────────────────────────────────────────────────────────────
   The design problem in a voice call with an agent is not transcription and
   it is not synthesis. It is TURN-TAKING. Get that wrong and the thing feels
   like a walkie-talkie no matter how good the words are.

   Three rules, and they are the whole feature:

   1. It listens continuously and decides for itself when you have finished,
      by watching the microphone level and waiting out a pause. Holding a
      button to speak is not a call, it is a radio.

   2. It starts speaking the moment the first sentence of the reply exists,
      not when the reply is complete. Streaming into the voice is what makes
      the gap feel like thinking rather than lag.

   3. It stops talking the instant you start. Being talked over by software
      that cannot hear you is the single most artificial thing a voice
      assistant does, so the level meter runs even while it speaks, and any
      real speech cancels the utterance mid-word.

   The upload button is here because the agent will ask for things mid-call —
   a face, a product, a logo — and hanging up to go and find the attach
   button would break the conversation exactly when it was getting useful.
   ══════════════════════════════════════════════════════════════════════════ */

// Tuned by ear against a laptop microphone in a room with a fan.
const SILENCE_MS = 1100;        // pause that ends a turn
const MIN_SPEECH_MS = 350;      // shorter than this is a cough, not a turn
const SPEECH_LEVEL = 0.08;      // above this counts as speech
const BARGE_IN_LEVEL = 0.16;    // higher, so its own speaker does not trigger it

export default function CallScreen({ open, onClose, onTurn, transcript = [], busy = false, onAttach }) {
  const [status, setStatus] = useState("connecting");
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const voiceOut = useVoiceOutput();
  const { upload, busy: uploading } = useUpload();

  const speakingSince = useRef(0);
  const silenceSince = useRef(0);
  const armed = useRef(false);
  const fileRef = useRef(null);
  const startedAt = useRef(0);

  const handleText = useCallback((text) => {
    if (!text) { setStatus("listening"); return; }
    setHeard(text);
    setStatus("thinking");
    onTurn?.(text, {
      onToken: (chunk) => voiceOut.feed(chunk),
      onDone: () => { voiceOut.flush(); setStatus("listening"); },
      onError: (message) => { setError(message || "That did not go through."); setStatus("listening"); },
    });
  }, [onTurn, voiceOut]);

  const voiceIn = useVoiceInput({ onText: handleText });
  const { recording, level, start, stop } = voiceIn;

  /* The call clock — a call without one does not feel like a call. */
  useEffect(() => {
    if (!open) return undefined;
    startedAt.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [open]);

  /* Open the line. */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      await start();
      if (alive) setStatus("listening");
    })();
    return () => {
      alive = false;
      voiceOut.cancel();
      stop({ send: false });
    };
    // Deliberately keyed on `open` alone: start/stop/voiceOut change
    // identity on ordinary re-renders, and depending on them would hang up
    // and redial mid-sentence.
  }, [open]);

  /* Turn-taking. Runs off the live level meter that useVoiceInput already
     maintains, so it costs nothing extra. */
  useEffect(() => {
    if (!open || !recording || muted) return;
    const now = Date.now();

    // Barge-in: it is talking, you started talking, it stops. Threshold is
    // deliberately higher than the speech threshold so its own output
    // leaking into the microphone cannot silence it.
    if (voiceOut.speaking && level > BARGE_IN_LEVEL) {
      voiceOut.cancel();
      setStatus("listening");
    }

    if (level > SPEECH_LEVEL) {
      if (!speakingSince.current) speakingSince.current = now;
      silenceSince.current = 0;
      if (!armed.current && now - speakingSince.current > MIN_SPEECH_MS) {
        armed.current = true;
        setStatus("hearing you");
      }
      return;
    }

    // Below the speech threshold: start (or continue) the pause that ends
    // the turn — but only if there was a turn to end.
    if (!armed.current) return;
    if (!silenceSince.current) { silenceSince.current = now; return; }
    if (now - silenceSince.current < SILENCE_MS) return;

    armed.current = false;
    speakingSince.current = 0;
    silenceSince.current = 0;
    setStatus("thinking");
    // Close the recording, transcribe it, and immediately reopen the line —
    // the microphone must never be shut while the agent answers, or the
    // barge-in rule above has nothing to listen with.
    (async () => {
      await stop({ send: true });
      if (!muted) await start();
    })();
  }, [open, recording, muted, level, voiceOut, stop, start]);

  const attach = useCallback(async (files) => {
    if (!files?.length) return;
    const done = [];
    for (const file of Array.from(files).slice(0, 4)) {
      const up = await upload(file);
      if (up?.url) done.push(up);
    }
    if (!done.length) { setError("That upload did not go through."); return; }
    onAttach?.(done);
    // Say it out loud as well as showing it: in a call, a silent success is
    // indistinguishable from nothing happening.
    voiceOut.speak(`Got ${done.length === 1 ? done[0].name : `${done.length} files`}.`);
  }, [upload, onAttach, voiceOut]);

  const hangUp = useCallback(() => {
    voiceOut.cancel();
    stop({ send: false });
    onClose?.();
  }, [voiceOut, stop, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") hangUp(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hangUp]);

  if (!open) return null;

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const state = muted ? "muted" : voiceOut.speaking ? "speaking" : busy ? "thinking" : status;
  const ring = Math.min(1, (voiceOut.speaking ? 0.55 : 0) + level * 1.6);

  return (
    <div className="st-call" role="dialog" aria-modal="true" aria-label="Call with the studio">
      <div className="st-call__inner">
        <header className="st-call__head">
          <span className="st-call__who">Helmies Studio</span>
          <span className="st-call__clock" aria-live="off">{mmss}</span>
        </header>

        {/* One object that breathes with whoever is speaking. It is the only
            thing on screen that tells you the line is live. */}
        <div className="st-call__orb-wrap">
          <div
            className={`st-call__orb st-call__orb--${voiceOut.speaking ? "out" : "in"}`}
            style={{ "--level": ring.toFixed(3) }}
            aria-hidden="true"
          />
          <p className="st-call__state" aria-live="polite">
            {state === "connecting" && "Connecting…"}
            {state === "listening" && "Listening"}
            {state === "hearing you" && "…"}
            {state === "thinking" && "Thinking"}
            {state === "speaking" && "Speaking"}
            {state === "muted" && "Muted"}
          </p>
          {heard && <p className="st-call__heard">“{heard}”</p>}
        </div>

        {/* What has been said, newest last — a call you cannot scroll back
            through loses every model name and number mentioned in it. */}
        {transcript.length > 0 && (
          <ol className="st-call__log">
            {transcript.slice(-6).map((line, i) => (
              <li key={i} className={`st-call__line st-call__line--${line.role}`}>
                <span className="hs-sr">{line.role === "user" ? "You said" : "The studio said"}</span>
                {line.text}
              </li>
            ))}
          </ol>
        )}

        {error && <p className="hs-error" role="alert">{error}</p>}

        <div className="st-call__controls">
          <button
            type="button"
            className={`hs-btn hs-btn--sm ${muted ? "hs-btn--primary" : "hs-btn--ghost"}`}
            onClick={async () => {
              const next = !muted;
              setMuted(next);
              if (next) { await stop({ send: false }); voiceOut.cancel(); }
              else await start();
            }}
          >
            {muted ? "Unmute" : "Mute"}
          </button>

          <label className="hs-btn hs-btn--ghost hs-btn--sm">
            <IcUpload className="hs-icon-sm" aria-hidden="true" />
            {uploading ? "Uploading…" : "Send a file"}
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*,audio/*,video/*"
              disabled={uploading}
              onChange={(e) => { attach(e.target.files); e.target.value = ""; }}
            />
          </label>

          <button
            type="button"
            className="hs-btn hs-btn--sm"
            onClick={() => voiceOut.setEnabled(!voiceOut.supported ? false : voiceOut.speaking ? false : true) || voiceOut.cancel()}
            title="Stop the studio talking"
          >
            Quiet
          </button>

          <button type="button" className="hs-btn hs-btn--danger hs-btn--sm st-call__end" onClick={hangUp}>
            End call
          </button>
        </div>

        {!voiceOut.supported && (
          <p className="st-call__note">
            <IcCheck className="hs-icon-sm" aria-hidden="true" />
            This browser cannot speak replies aloud — you will see them written instead.
          </p>
        )}
      </div>
    </div>
  );
}
