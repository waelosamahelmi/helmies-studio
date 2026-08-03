"use client";

/* ErrorPanel — the one way a failed action talks to the user.
 *
 * Accepts either a plain string (legacy studios pass `error` straight from
 * state) or an ApiError-shaped object carrying the uniform envelope fields
 * (title, code, errorId, retryable, details) lifted by src/lib/client-fetch.js.
 * Renders: a friendly title, the explanation, per-field detail bullets when
 * the server named them (422 validation), a Retry action, an Edit settings
 * action, and the internal error id users can quote to support.
 */
import { IcAlert, IcRefresh, IcSettings } from "./Icons";

function normalize(error) {
  if (!error) return null;
  if (typeof error === "string") return { title: null, message: error };
  return {
    title: error.title || null,
    message: error.message || "The request did not complete.",
    errorId: error.errorId || null,
    details: Array.isArray(error.details) ? error.details : null,
    retryable: error.retryable,
  };
}

export default function ErrorPanel({ error, title, onRetry, onEditSettings, compact = false }) {
  const e = normalize(error);
  if (!e) return null;

  const heading = title || e.title || "Something went wrong";

  return (
    <div className={compact ? "" : "st-stage"} role="alert">
      <div className="hs-empty">
        <span className="hs-empty__mark" style={{ color: "var(--fault)", borderColor: "rgba(255,90,90,.3)" }}>
          <IcAlert />
        </span>
        <h3>{heading}</h3>
        <p>{e.message}</p>
        {e.details && e.details.length > 0 && (
          <ul className="hs-hint" style={{ listStyle: "disc", textAlign: "left", margin: "var(--s-2) auto 0", paddingLeft: "1.2em", maxWidth: 420 }}>
            {e.details.slice(0, 6).map((d, i) => (
              <li key={i}>{d.field ? `${d.field}: ` : ""}{d.message || String(d)}</li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "center", marginTop: "var(--s-3)", flexWrap: "wrap" }}>
          {onRetry && (
            <button type="button" className="hs-btn hs-btn--outline" onClick={onRetry}>
              <IcRefresh className="hs-icon-sm" /> Try again
            </button>
          )}
          {onEditSettings && (
            <button type="button" className="hs-btn hs-btn--ghost" onClick={onEditSettings}>
              <IcSettings className="hs-icon-sm" /> Edit settings
            </button>
          )}
        </div>
        {e.errorId && (
          <p className="hs-hint" style={{ marginTop: "var(--s-3)", opacity: 0.7 }}>
            Error ID: <code>{e.errorId}</code>
          </p>
        )}
      </div>
    </div>
  );
}
