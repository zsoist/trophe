"use client";

import { useSyncExternalStore } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const subscribeHydration = () => () => {};

/**
 * Premium install prompt card — dark + gold, bilingual (EN/EL).
 *
 * Android/Desktop: captures beforeinstallprompt → native dialog.
 * iOS Safari: shows "Share → Add to Home Screen" instructions.
 * Hidden when: already installed in standalone, user dismissed within 7 days.
 */
export function InstallCard() {
  const { canInstall, isIOS, isInstalled, isDismissed, triggerInstall, dismiss } =
    useInstallPrompt();
  // The server cannot know the browser's iOS/install state. Keep the first
  // client render identical to SSR, then reveal the card after hydration.
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);

  // Only show if something to offer and not already installed / dismissed
  const shouldShow = hydrated && (canInstall || isIOS) && !isInstalled && !isDismissed;
  if (!shouldShow) return null;

  return (
    <div
      role="region"
      aria-label="Install Trophē"
      style={{
        position: "fixed",
        bottom: "env(safe-area-inset-bottom)",
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "0 16px 16px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          borderRadius: 18,
          border: "1px solid var(--border-focus)",
          background: "var(--surface-1)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "var(--shadow-high)",
          padding: "20px",
          pointerEvents: "auto",
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        {/* τ icon */}
        <div
          aria-hidden
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="3" y="5" width="18" height="3" rx="1.5" fill="var(--action-primary)" />
            <rect x="9" y="5" width="6" height="15" rx="1.5" fill="var(--action-primary)" />
          </svg>
        </div>

        {/* Copy */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--content-primary)",
              marginBottom: 4,
              letterSpacing: "-0.01em",
            }}
          >
            {isIOS ? "Add to Home Screen" : "Install Trophē"}
          </p>

          {isIOS ? (
            <p style={{ fontSize: 12, color: "var(--content-secondary)", lineHeight: 1.5 }}>
              Tap{" "}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  color: "var(--action-primary)",
                  fontWeight: 500,
                }}
              >
                {/* Share icon approximation */}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--action-primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>{" "}
                Share
              </span>{" "}
              then{" "}
              <span style={{ color: "var(--action-primary)", fontWeight: 500 }}>
                Add to Home Screen
              </span>{" "}
              for the full app experience. · Προσθέστε στην αρχική οθόνη
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "var(--content-secondary)", lineHeight: 1.5 }}>
              Install for offline access & faster loading.
              <br />
              <span style={{ color: "var(--content-muted)", fontSize: 12 }}>
                Εγκατάσταση για offline πρόσβαση
              </span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {!isIOS && (
            <button
              onClick={triggerInstall}
              style={{
                minHeight: 44, padding: "8px 16px",
                borderRadius: 10,
                border: "none",
                background: "var(--action-primary)",
                color: "var(--action-on-primary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            style={{
              minHeight: 44, padding: "7px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: "var(--content-secondary)",
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {isIOS ? "Got it" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}
