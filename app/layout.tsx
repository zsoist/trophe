import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DocumentLanguage from "@/components/shared/DocumentLanguage";
import { Analytics } from "@vercel/analytics/react";
import { THEME_COLOR } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "greek"],
  display: "swap",
  preload: false,
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
  preload: false,
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
  themeColor: THEME_COLOR.dark,
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
            __html: `(function(){var r=document.documentElement,p=location.pathname.split('/')[1],m,c;r.lang=p==='es'||p==='el'?p:'en';try{m=localStorage.getItem('trophe_theme_mode')}catch(e){}c=m==='light'||m==='dark'?m:'dark';r.classList.remove('dark','light');r.classList.add(c);r.style.colorScheme=c;var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute('content',c==='light'?'#FAFAF9':'#0A0A0A')}())`,
          }}
        />
      </head>
      <body
        className="min-h-full font-sans antialiased"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <DocumentLanguage />
        <ErrorBoundary>{children}</ErrorBoundary>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
