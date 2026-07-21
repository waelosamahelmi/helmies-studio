import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
      background: "#0A0A0F",
      color: "#F2F2F7",
      textAlign: "center",
    }}>
      <h1 style={{ fontSize: "4rem", fontWeight: 800, letterSpacing: "-0.04em", color: "#FF1B6B", marginBottom: "0.5rem" }}>
        404
      </h1>
      <p style={{ fontSize: "1rem", color: "rgba(242,242,247,0.5)", marginBottom: "1.5rem" }}>
        This page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "9999px",
          background: "#FF1B6B",
          color: "#fff",
          textDecoration: "none",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        Go home
      </Link>
    </div>
  );
}
