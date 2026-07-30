"use client";

import { useState } from "react";

/**
 * TemplatePurchaseButton — handles template purchase flow
 *
 * - Subscription-included: POST /api/templates/purchase → immediate access
 * - One-time: POST /api/templates/purchase → redirect to Stripe checkout
 */
export default function TemplatePurchaseButton({ template, onSuccess, compact }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSubscription = template.pricingModel === "subscription";
  const priceDisplay = template.oneTimePrice
    ? `€${(template.oneTimePrice / 100).toFixed(2)}`
    : null;

  const handlePurchase = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/templates/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug: template.slug }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to purchase templates.");
        } else if (res.status === 402) {
          setError(data.error || "Active subscription required for this template.");
        } else {
          setError(data.error || "Purchase failed. Please try again.");
        }
        return;
      }

      // Already purchased
      if (data.alreadyPurchased || data.hasAccess) {
        onSuccess?.();
        return;
      }

      // Stripe checkout redirect
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // Subscription template — immediate success
      if (data.success) {
        onSuccess?.();
      }
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
          className="v6-btn v6-primary v6-sm"
          onClick={handlePurchase}
          disabled={loading}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {loading ? (
            <>
              <span className="v6-skeleton" style={{ width: 14, height: 14, borderRadius: "50%", display: "inline-block" }} />
              Processing...
            </>
          ) : (
            <>
              {isSubscription ? "Use this template" : priceDisplay ? `Purchase for ${priceDisplay}` : "Get for free"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </>
          )}
        </button>
        {error && (
          <p style={{ fontSize: "10px", color: "#FF6B72", marginTop: 6, textAlign: "center" }}>{error}</p>
        )}
        <style jsx>{`
          .v6-btn { font-family: inherit; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="tpurchase-wrap">
      <button
        className="v6-btn v6-primary tpurchase-btn"
        onClick={handlePurchase}
        disabled={loading}
        style={{ padding: "11px 15px 11px 20px", fontSize: "13px" }}
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
            Processing...
          </>
        ) : isSubscription ? (
          <>
            Use this template
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </>
        ) : (
          <>
            Purchase for {priceDisplay || "Free"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </>
        )}
      </button>

      {error && (
        <div className="tpurchase-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
          <button onClick={handlePurchase} className="tpurchase-retry">
            Retry
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .tpurchase-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tpurchase-btn {
          align-self: flex-start;
        }
        .tpurchase-error {
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
        .tpurchase-retry {
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
        .tpurchase-retry:hover {
          background: rgba(255, 109, 114, 0.2);
        }
      `}</style>
    </div>
  );
}
