"use client";

export default function Error({ error, reset }) {
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
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: "0.9rem", color: "rgba(242,242,247,0.5)", marginBottom: "1.5rem", maxWidth: 400 }}>
        {error?.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "9999px",
          background: "#FF1B6B",
          color: "#fff",
          border: "none",
          fontSize: "0.9rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
