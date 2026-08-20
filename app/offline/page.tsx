/**
 * Online-accessible branded recovery page. The service worker uses the
 * self-contained public/offline.html for cold offline navigation failures.
 * English-only recovery copy while the beta language is stabilized.
 * Dark premium aesthetic, no external dependencies.
 *
 * Note: the retry button is extracted into a client component so the page
 * itself remains a Server Component (no 'use client' directive needed).
 */

import type { Metadata } from "next";
import { RetryButton } from "./RetryButton";
import { ThemeModeProvider, ThemeModeToggle } from "@/components/shared/ThemeMode";

export const metadata: Metadata = {
  title: "Offline — Trophē",
  description: "You're offline. Trophē will reconnect automatically.",
};

export default function OfflinePage() {
  return (
    <ThemeModeProvider>
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden bg-[var(--canvas)] p-6 text-[var(--content-primary)]">
      <div className="fixed right-4 top-4 z-20"><ThemeModeToggle /></div>
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
          background: "radial-gradient(circle, color-mix(in srgb, var(--action-primary) 8%, transparent) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", maxWidth: 400, width: "100%", textAlign: "center" }}>
        {/* Trophē mark */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "var(--surface-2)",
            border: "1px solid var(--border-focus)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
          }}
        >
          {/* Inline brand mark */}
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
            color: "var(--action-primary)",
            fontSize: 14,
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
            color: "var(--content-primary)",
          }}
        >
          You&rsquo;re offline
        </h1>

        {/* Body copy */}
        <p
          style={{
            fontSize: 15,
            color: "var(--content-secondary)",
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
            background: "var(--border-subtle)",
            marginBottom: 32,
          }}
        />

        {/* Client component: retry button with onClick */}
        <div className="[&_button]:min-h-11 [&_button]:border-[var(--border-focus)] [&_button]:bg-[var(--surface-2)] [&_button]:text-[var(--action-primary)]">
          <RetryButton />
        </div>

        {/* Footer note */}
        <p
          style={{
            marginTop: 48,
            fontSize: 12,
            color: "var(--content-muted)",
            fontFamily: "monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Precision Nutrition Coaching
        </p>
      </div>
    </main>
    </ThemeModeProvider>
  );
}
