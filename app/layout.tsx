import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "greek"],
  display: "swap",
});

/**
 * Brand Master v1.0 — primary display font.
 * Replaces Playfair Display (Phase 8 design handoff, Apr 18 2026).
 * Rule: italic 400 only — no bold, no roman in wordmark or display.
 * Exposed as --font-instrument-serif; --font-serif re-aliased below.
 * --font-playfair kept as compat alias for legacy component references.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

// Mono is only used for small numeric/metric labels deep in the app — never
// above the fold on the landing. Ship ONE weight and keep it OUT of the
// render-critical preload set (preload:false) so a slow connection doesn't
// block first paint on ~90KB of monospace it doesn't need yet. 500/600 map to
// the 400 file via the browser's synthetic weighting.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "τροφή — Precision Nutrition Coaching",
  description: "One habit. Two weeks. Transform. Evidence-based nutrition coaching platform.",
  // Next.js serves app/manifest.ts at /manifest.webmanifest automatically
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trophē",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover ensures content reaches the notch/home-indicator areas
  viewportFit: "cover",
  themeColor: "#D4A853",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('trophe_theme_mode');var c=m==='light'?'light':'dark';document.documentElement.classList.add(c);}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {/*
          Service-worker kill switch (transitional, 2026-07-12). The prior
          caching worker caused ~1-minute loads on iOS Safari. app/sw.ts now
          self-destructs, but Safari's PASSIVE sw-update check is unreliable, so
          a stuck worker could otherwise survive. This inline head script runs on
          EVERY page (including the logged-out landing), before React, and
          actively unregisters any worker + purges Cache Storage — healing the
          device on its next visit regardless of the SW lifecycle. No-op once no
          worker is registered. Remove after the fleet has healed.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(self.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="min-h-full font-sans antialiased"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
        <Analytics />
      </body>
    </html>
  );
}
