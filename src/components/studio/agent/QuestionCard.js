"use client";

import { useState } from "react";
import { IcCheck } from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   QUESTION CARD — one question at a time (EDITSv1 E3.3)
   ──────────────────────────────────────────────────────────────────────────
   Renders the parsed ```question block: option buttons plus a free-text
   "Your choice" row (when allowCustom). Choosing sends the answer as the
   next user message; an answered card locks and shows what was chosen.
   ══════════════════════════════════════════════════════════════════════════ */

export default function QuestionCard({ question, answered, onAnswer, disabled = false }) {
  const [custom, setCustom] = useState("");
  if (!question?.question) return null;

  const locked = !!answered || disabled;

  const submitCustom = () => {
    const text = custom.trim();
    if (text && !locked) onAnswer?.(text);
  };

  return (
    <section className="st-question" aria-label="The agent asks">
      <p className="st-question__q">{question.question}</p>

      {answered ? (
        <p className="st-question__answered">
          <IcCheck className="hs-icon-sm" aria-hidden="true" />
          <span className="hs-sr">You answered:</span>
          {answered}
        </p>
      ) : (
        <>
          {question.options?.length > 0 && (
            <div className="hs-chips st-question__opts">
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="hs-chip"
                  disabled={locked}
                  onClick={() => onAnswer?.(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {question.allowCustom !== false && (
            <div className="st-question__custom">
              <input
                className="hs-input"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCustom();
                  }
                }}
                placeholder="Your choice…"
                aria-label="Your own answer"
                disabled={locked}
              />
              <button
                type="button"
                className="hs-btn hs-btn--ghost hs-btn--sm"
                onClick={submitCustom}
                disabled={locked || !custom.trim()}
              >
                Answer
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
