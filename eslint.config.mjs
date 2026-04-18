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
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
