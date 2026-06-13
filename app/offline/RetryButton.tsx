"use client";

export function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 28px",
        borderRadius: 12,
        border: "1px solid rgba(212,168,83,0.3)",
        background: "rgba(212,168,83,0.08)",
        color: "#D4A853",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: "0.01em",
      }}
    >
      Try again
    </button>
  );
}
