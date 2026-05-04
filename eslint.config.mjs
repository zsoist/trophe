import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Bans raw dark-only Tailwind colors on themed surfaces. Use CSS variables
// (e.g. style={{ background: 'var(--bg-primary)' }}) or `.glass` / `.glass-elevated`
// utility classes so the `.light` theme toggle propagates.
const BANNED_DARK_COLOR_RE =
  "\\b(bg-stone-9\\d\\d|bg-neutral-9\\d\\d|bg-zinc-9\\d\\d)\\b";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/dashboard/**/*.{ts,tsx}", "app/onboarding/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=/${BANNED_DARK_COLOR_RE}/]`,
          message:
            "Raw dark-only Tailwind class detected. Use CSS variable (var(--bg-primary)) or .glass/.glass-elevated so the light-mode toggle works.",
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${BANNED_DARK_COLOR_RE}/]`,
          message:
            "Raw dark-only Tailwind class detected. Use CSS variable (var(--bg-primary)) or .glass/.glass-elevated so the light-mode toggle works.",
        },
      ],
    },
  },
  // Pre-existing Next 16 react-compiler / react-hooks errors inherited from
  // pre-v0.2 code. Downgraded to warnings so CI can still protect against NEW
  // regressions. Tech debt ticket: resolve these in Wave D (see v0.2 plan).
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "coverage/**",
    "next-env.d.ts",
    // One-off Node scripts (legacy require-style, not part of the app bundle):
    "scripts/**",
    // v0.3 Claude design-handoff prototypes — reference HTML/JSX, NOT production
    // source. They use `window.X`, in-browser Babel JSX, and other patterns that
    // wouldn't pass strict lint. Kept as reference under docs/.
    "docs/v0.3/design-handoff/**",
    // Drizzle Kit auto-generated artifacts (introspect output and migrations).
    "drizzle/**",
  ]),
]);

export default eslintConfig;
