/* ══════════════════════════════════════════════════════════════════════════
   ROUTE LOADING — app/loading.js
   ──────────────────────────────────────────────────────────────────────────
   A skeleton of the shape that is coming, not a spinner in the void: the
   nav strip, a page heading, and a grid of cards. The page appears to
   settle into place instead of replacing a spinner with content.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="hs-sr">Loading</span>

      {/* Nav strip */}
      <div
        style={{
          height: 64,
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: "var(--s-5)",
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 var(--s-5)",
        }}
      >
        <div className="hs-skel" style={{ height: 20, width: 132 }} />
        <div className="hs-skel" style={{ height: 14, width: 220, marginLeft: "var(--s-4)" }} />
        <div className="hs-skel" style={{ height: 32, width: 108, marginLeft: "auto", borderRadius: "var(--r-md)" }} />
      </div>

      {/* Heading */}
      <div className="hs-wrap" style={{ paddingTop: "var(--s-12)" }}>
        <div className="hs-stack" style={{ maxWidth: 620 }}>
          <div className="hs-skel" style={{ height: 12, width: 88 }} />
          <div className="hs-skel" style={{ height: 42, width: "82%" }} />
          <div className="hs-skel" style={{ height: 16, width: "64%" }} />
        </div>

        {/* Content grid */}
        <div className="hs-grid hs-grid--3" style={{ marginTop: "var(--s-10)" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="hs-skel"
              style={{ height: 168, borderRadius: "var(--r-lg)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
