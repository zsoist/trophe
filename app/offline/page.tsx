/**
 * Offline fallback page — served by the service worker when navigation fails.
 * Bilingual: English primary, Greek secondary.
 * Dark premium aesthetic, no external dependencies.
 *
 * Note: the retry button is extracted into a client component so the page
 * itself remains a Server Component (no 'use client' directive needed).
 */

import type { Metadata } from "next";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = {
  title: "Offline — Trophē",
  description: "You're offline. Trophē will reconnect automatically.",
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a0a0a",
        color: "#FAFAF9",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,168,83,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", maxWidth: 400, width: "100%", textAlign: "center" }}>
        {/* τ mark */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "rgba(212,168,83,0.08)",
            border: "1px solid rgba(212,168,83,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
          }}
        >
          {/* Inline τ SVG */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="9" width="24" height="4" rx="2" fill="#D4A853" />
            <rect x="14" y="9" width="8" height="20" rx="2" fill="#D4A853" />
          </svg>
        </div>

        {/* Wordmark */}
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            color: "#D4A853",
            fontSize: 13,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          trophē
        </p>

        {/* Headline */}
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            marginBottom: 12,
            color: "#FAFAF9",
          }}
        >
          You&rsquo;re offline
        </h1>

        {/* Greek subtitle */}
        <p
          style={{
            fontSize: 14,
            color: "#78716C",
            marginBottom: 24,
            letterSpacing: "0.02em",
          }}
        >
          Είστε εκτός σύνδεσης
        </p>

        {/* Body copy */}
        <p
          style={{
            fontSize: 15,
            color: "#A8A29E",
            lineHeight: 1.65,
            marginBottom: 40,
          }}
        >
          Trophē will reconnect automatically when your connection returns.
          Your logged data is safe.
        </p>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            marginBottom: 32,
          }}
        />

        {/* Client component: retry button with onClick */}
        <RetryButton />

        {/* Footer note */}
        <p
          style={{
            marginTop: 48,
            fontSize: 11,
            color: "#57534E",
            fontFamily: "monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Precision Nutrition Coaching
        </p>
      </div>
    </div>
  );
}
