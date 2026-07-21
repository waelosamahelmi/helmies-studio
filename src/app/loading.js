export default function Loading() {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0A0A0F",
      color: "#F2F2F7",
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "2px solid rgba(255,27,107,0.2)",
        borderTopColor: "#FF1B6B",
        animation: "spin 0.8s linear infinite",
        marginBottom: "1rem",
      }} />
      <p style={{ fontSize: "0.85rem", color: "rgba(242,242,247,0.4)" }}>Loading...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
