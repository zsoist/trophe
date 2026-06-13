"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker with updateViaCache:'none' to ensure
 * the browser always fetches a fresh SW manifest.
 * Shows a subtle "update available" toast when a new SW is waiting.
 */
export function SWRegistration() {
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    // Register with updateViaCache:'none' — always network-check SW on page load
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Check if a new worker is already waiting
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdateToast(true);
        }

        // Listen for future updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(newWorker);
              setShowUpdateToast(true);
            }
          });
        });
      })
      .catch(() => {
        // SW registration failed — non-critical, app still works online
      });

    // When the controller changes, reload to activate the new SW
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    // Tell the waiting SW to skip waiting and take control
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setShowUpdateToast(false);
  };

  if (!showUpdateToast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        padding: "10px 16px",
        borderRadius: 12,
        border: "1px solid rgba(212,168,83,0.25)",
        background: "rgba(12,10,6,0.96)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.6)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 13, color: "#A8A29E" }}>Update available</span>
      <button
        onClick={handleUpdate}
        style={{
          padding: "5px 12px",
          borderRadius: 8,
          border: "none",
          background: "linear-gradient(135deg, #D4A853, #E8C078)",
          color: "#0a0a0a",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: "0.01em",
        }}
      >
        Reload
      </button>
      <button
        onClick={() => setShowUpdateToast(false)}
        aria-label="Dismiss"
        style={{
          padding: "4px 8px",
          border: "none",
          background: "transparent",
          color: "#57534E",
          fontSize: 18,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
