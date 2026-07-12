"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Registers the service worker inside authenticated layouts only. The edge
 * serves /sw.js as no-store, and updates wait for explicit user approval.
 */
export function SWRegistration() {
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;

    const handleStateChange = () => {
      if (
        installingWorker?.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        setWaitingWorker(installingWorker);
        setShowUpdateToast(true);
      }
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      installingWorker?.removeEventListener('statechange', handleStateChange);
      installingWorker = worker;
      installingWorker?.addEventListener('statechange', handleStateChange);
      // The worker may have advanced before this listener was attached.
      handleStateChange();
    };

    const handleUpdateFound = () => {
      watchInstallingWorker(registration?.installing ?? null);
    };

    const handleControllerChange = () => {
      // A first install may claim this page. Reload only when the user explicitly
      // accepted a waiting update via the button below.
      if (!reloadRequested.current) return;
      reloadRequested.current = false;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // /sw.js is no-store at the edge, so the browser always checks the current worker.
    navigator.serviceWorker
      .register("/sw.js")
      .then((registeredWorker) => {
        if (disposed) return;
        registration = registeredWorker;
        registration.addEventListener('updatefound', handleUpdateFound);

        // Check if a new worker is already waiting
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdateToast(true);
        }

        if (registeredWorker.installing) {
          watchInstallingWorker(registeredWorker.installing);
        }
      })
      .catch((error) => {
        // Non-critical, but visible to production browser/error telemetry.
        console.error('[service-worker] registration failed', error);
      });

    return () => {
      disposed = true;
      installingWorker?.removeEventListener('statechange', handleStateChange);
      registration?.removeEventListener('updatefound', handleUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    reloadRequested.current = true;
    // Tell the waiting worker to activate; controllerchange performs the one
    // user-approved reload after it takes control.
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
