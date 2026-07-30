"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ApplyTemplateButton — applies template config to the studio
 *
 * Calls GET /api/templates/[slug]/apply to get config + toolType,
 * then navigates to the corresponding studio tool with config in query params.
 */
export default function ApplyTemplateButton({ template, compact, onApplied }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleApply = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/templates/${template.slug}/apply`);

      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to use this template.");
        } else if (res.status === 402) {
          setError("You don't have access to this template. Purchase it first.");
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to apply template.");
        }
        return;
      }

      const data = await res.json();
      const { config, toolType } = data;

      // Navigate to studio with template config
      const configParam = encodeURIComponent(JSON.stringify(config));
      const url = `/studio/${toolType}?template=${encodeURIComponent(template.slug)}&config=${configParam}`;

      onApplied?.();
      router.push(url);
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div>
        <button
          className="v6-btn v6-primary"
          onClick={handleApply}
          disabled={loading}
          style={{
            width: "100%",
            padding: "7px 10px",
            fontSize: "11px",
            justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                }}
              />
              Loading...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
              </svg>
              Open in Studio
            </>
          )}
        </button>
        {error && (
          <p style={{ fontSize: "10px", color: "#FF6B72", marginTop: 4, textAlign: "center" }}>{error}</p>
        )}
        <style jsx>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="tapply-wrap">
      <button
        className="v6-btn v6-primary tapply-btn"
        onClick={handleApply}
        disabled={loading}
        style={{ padding: "12px 16px 12px 22px", fontSize: "14px" }}
      >
        {loading ? (
          <>
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 16,
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                animation: "spin 0.6s linear infinite",
              }}
            />
            Loading template...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
            </svg>
            Open in Studio
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </>
        )}
      </button>

      {error && (
        <div className="tapply-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
          <button onClick={handleApply} className="tapply-retry">
            Retry
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .tapply-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tapply-btn {
          align-self: flex-start;
        }
        .tapply-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid rgba(255, 109, 114, 0.2);
          border-radius: 10px;
          background: rgba(255, 109, 114, 0.06);
          font-size: 11px;
          color: #FF6B72;
        }
        .tapply-retry {
          border: 1px solid rgba(255, 109, 114, 0.3);
          background: rgba(255, 109, 114, 0.1);
          color: #FF6B72;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: 0.18s;
        }
        .tapply-retry:hover {
          background: rgba(255, 109, 114, 0.2);
        }
      `}</style>
    </div>
  );
}
