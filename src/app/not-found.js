import Link from "next/link";

/* 404 — a dead end should still offer the three doors people actually want. */

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const DOORS = [
  { href: "/studio",    label: "Open the studio" },
  { href: "/models",    label: "Browse the model catalog" },
  { href: "/gallery",   label: "See the gallery" },
];

export default function NotFound() {
  return (
    <main className="pg-status">
      <div className="pg-status__in">
        <span className="pg-status__code">404</span>
        <h1>No page at this address</h1>
        <p>
          The link is either mistyped or points at something we have since moved.
          Nothing is broken on your side.
        </p>

        <div className="hs-row" style={{ justifyContent: "center", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
          <Link href="/" className="hs-btn hs-btn--primary">Back to the front page</Link>
        </div>

        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", listStyle: "none", marginTop: "var(--s-4)" }}>
          {DOORS.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                {d.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
