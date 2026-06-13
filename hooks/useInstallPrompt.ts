"use client";

import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "trophe_pwa_install_dismissed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

export interface UseInstallPromptResult {
  /** True on Android/desktop when the browser can show the native install dialog. */
  canInstall: boolean;
  /** True on iOS — no native prompt, show "Share → Add to Home Screen" instructions. */
  isIOS: boolean;
  /** True when app is already running in standalone mode (installed). */
  isInstalled: boolean;
  /** True if user dismissed the card within the 7-day cooldown. */
  isDismissed: boolean;
  /** Trigger the native install dialog (Android/desktop). No-op on iOS. */
  triggerInstall: () => Promise<void>;
  /** Record dismissal and start 7-day cooldown. */
  dismiss: () => void;
}

function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari on iOS sets this
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function detectIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iP(hone|ad|od)/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  // Lazy initialisers: these read browser APIs that only exist on the client.
  // Using function-form avoids SSR errors and prevents calling setState
  // synchronously inside an effect (react-hooks/set-state-in-effect).
  // iOS detection: static — never changes after mount
  const [isIOS] = useState(() => detectIOS());
  const [isInstalled, setIsInstalled] = useState(() => isRunningStandalone());
  const [isDismissed, setIsDismissed] = useState(() => isDismissedRecently());

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setCanInstall(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // localStorage blocked — silently ignore
    }
    setIsDismissed(true);
  }, []);

  return { canInstall, isIOS, isInstalled, isDismissed, triggerInstall, dismiss };
}
