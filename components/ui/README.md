# components/ui — Trophē v0.3 Design Primitives

Canonical UI primitives extracted from the v0.3 design handoff (`docs/v0.3/design-handoff/trophe/project/Trophe Handoff.html`).

These are the **smallest reusable building blocks** — every redesigned screen composes from this set. No screen-specific components live here. Feature components live in `components/<feature>/` (added per phase: `components/coach/`, `components/dashboard/`, etc.).

## Conventions

- **Server-friendly first.** No `'use client'` unless the component genuinely needs browser state.
- **Tailwind v4 + CSS variables** from `app/globals.css` (`var(--bg-primary)`, `var(--color-gold)`, etc.). No raw `bg-stone-9xx` — light mode would break.
- **Mobile-first** (390×844). Desktop variants come via Tailwind breakpoints when actually needed.
- **No emoji as iconography** — use Lucide icons. Emoji is fine for meal photos / decorative content only.

## Inventory

| Primitive | Purpose | Source |
|---|---|---|
| `Card` | neutral surface card (`.glass` + 12px radius) | Handoff `.card` |
| `CardGold` | gold-bordered emphasis card | Handoff `.card-g` |
| `CardDanger` | danger-bordered warning card | Handoff `.card-r` |
| `Tag` | status pill (gold / danger / warning / success) | Handoff `.tag-*` |
| `BrandEye` | gold mono eyebrow text | Handoff `.brand-eye` |
| `MonoLabel` | uppercase mono label | Handoff `.mono-label` |
| `SectionTitle` | gold mono section heading with underline | Handoff `.section-title` |
| `BtnGold` | primary gold-gradient button | existing `.btn-gold` |
| `BtnGhost` | secondary outlined button | existing `.btn-ghost` |
| `Tabs` / `Tab` | pill-tab group with active state | Handoff `.tabs` / `.tab` |
| `Fab` | floating action button (gold gradient + glow) | Handoff `.fab` |
| `BotNav` / `BotNavItem` | bottom tab bar | Handoff `.bot-nav` |
| `StatusDot` | colored 6px circle (on / warn / off) | Handoff `.dot-on/warn/off` |
| `Avatar` | gold-gradient initials avatar | Handoff `.av` / `.av-lg` |

## Usage

```tsx
import { Card, CardGold, BrandEye, Tag, BtnGold } from '@/components/ui';

<CardGold className="p-4">
  <BrandEye>For Coaches</BrandEye>
  <h3 className="text-base font-semibold mt-2">Manage 10× more clients</h3>
  <Tag variant="gold" className="mt-3">14-day cycle</Tag>
  <BtnGold className="w-full mt-4">Start free trial →</BtnGold>
</CardGold>
```
