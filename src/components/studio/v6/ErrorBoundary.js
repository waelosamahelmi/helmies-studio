"use client";

import { Component } from "react";

/* ── Inline SVGs ── */
const IconError = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconRefresh = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

/* ══════════════════════════════════════════════════════════════ */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Studio tool error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="v6-error-state" style={{ padding: "60px 20px", minHeight: 300 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "color-mix(in srgb, var(--v6-bad), transparent 88%)", display: "grid", placeItems: "center", marginBottom: 12 }}>
            <IconError />
          </div>
          <h3>Something went wrong</h3>
          <p>
            {this.state.error?.message || "An unexpected error occurred in this studio tool."}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="v6-btn v6-primary" onClick={this.handleRetry}>
              <IconRefresh /> Try again
            </button>
            <a
              href="mailto:support@helmies.fi?subject=Studio%20Error%20Report"
              className="v6-btn v6-ghost"
              onClick={(e) => {
                // Optional: attach error details
                const subject = encodeURIComponent(
                  `Studio Error: ${this.state.error?.message || "Unknown"}`
                );
                e.currentTarget.href = `mailto:support@helmies.fi?subject=${subject}`;
              }}
            >
              Report issue
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
