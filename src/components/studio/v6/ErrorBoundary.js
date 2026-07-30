"use client";

import { Component } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   ERROR BOUNDARY
   A tool that throws should not take the whole studio down. State the plain
   fact, offer the one useful action, and keep the shell navigable so the
   user can move to another instrument.
   ══════════════════════════════════════════════════════════════════════════ */

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[studio] tool crashed:", error, info?.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const subject = encodeURIComponent(`Studio error: ${error.message || "unknown"}`);

    return (
      <div className="st-stage">
        <div className="hs-empty">
          <span
            className="hs-empty__mark"
            style={{ color: "var(--fault)", borderColor: "rgba(255,90,90,.3)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l9.5 16.5H2.5L12 3z" />
              <path d="M12 10v4M12 17h.01" />
            </svg>
          </span>

          <h3>This instrument stopped responding</h3>
          <p>
            {error.message
              ? `${error.message}. Your other work is unaffected — the rest of the studio is still available.`
              : "Something in this tool failed unexpectedly. Your other work is unaffected."}
          </p>

          <div className="hs-row" style={{ marginTop: "var(--s-2)" }}>
            <button type="button" className="hs-btn hs-btn--primary" onClick={this.retry}>
              Reload the instrument
            </button>
            <a className="hs-btn hs-btn--ghost" href={`mailto:support@helmies.fi?subject=${subject}`}>
              Report it
            </a>
          </div>
        </div>
      </div>
    );
  }
}
