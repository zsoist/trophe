# Premium mobile client surface brief

## Scope and visitor mode

Replacement visual world for the authenticated client shell and the Home, Log, Workout, exercise picker, active session, Messages, and Progress-adjacent navigation surfaces. The visitor operates one-handed in short bursts at meals and between sets.

## Audience, job, action, proof, constraints

- Audience: coached nutrition and training clients, starting with Nik and Daniel.
- Job: know today's priority, log food, start or continue training, and reach the coach without interpreting a dashboard.
- Primary actions: Log meal and Start/Continue training; context decides which leads.
- Proof: actual plan, completed sets/meals, recent sessions, coach cue, daily nutrition feedback, and traceable metrics.
- Constraints: preserve routes/data/RLS/i18n; 390×844 first; light/dark; reduced motion; no recurring image-generation cost.

## Chosen direction and memorable moment

Personal Best: an athlete result-card world with obsidian performance surfaces, timing gold, signal lime, cyan, disciplined rails, monospaced evidence, and human coaching copy. The memorable moment is the coach-led start panel: today's plan, readiness, exercise orientation, and one unambiguous action in the same first viewport.

Approved comp: `.impeccable/mocks/personal-best-coach-led.png`.

## Component grammar and implementation inventory

| Ingredient | Commitment | Medium |
|---|---|---|
| App shell | One compact safe-area owner; no duplicate sticky headers | semantic HTML/CSS |
| Page movement | Directional transform/opacity transition tied to tab order | Framer Motion |
| Coach cue | One-line contextual strip with avatar/status | semantic HTML/CSS + existing profile asset |
| Primary plan | One dominant high-contrast action region; flat timing rails, not nested cards | semantic HTML/CSS |
| Body areas | Four-to-six large recognizable colored anatomical silhouettes | generated transparent raster assets |
| Exercise orientation | One crop per featured/relevant exercise; never decorative filler | generated raster assets + Next Image |
| Lists | Dense result rows with name, date, duration, volume/sets and explicit state | semantic HTML/CSS |
| Inputs | Large numeric entry, explicit units, semantic labels, no native select popup | semantic HTML/CSS + accessible sheet |
| Bottom nav | Five real destinations, floating on mobile, persistent and reachable | semantic HTML/CSS |
| Messaging | Full-height transcript, legible bubbles, sticky composer above nav | semantic HTML/CSS |

## Corner, line, elevation, and type rules

- Large action regions: 18–22px corners; compact controls: 10–14px; list rows share a parent rather than becoming individual floating pills.
- Hairline timing rails separate information; borders communicate grouping and state.
- Elevation is reserved for the shell, primary action, sheets, and composer. Most content is flat on the canvas.
- Humanist sans for prose and action labels; tabular/monospaced numerals for sets, weight, reps, time, dates, and macro evidence.
- Headlines are compact and strong, never so large that the next action falls below the first viewport.

## Motion grammar

- Adjacent tabs move 18–24px in travel direction with opacity and 0.985 scale, 220–280ms, transform-only.
- Sheets rise from the bottom with a dimmed backdrop; expanded rows grow in place.
- Selected anatomy and completed-set signals use one decisive state transition, not looping animation.
- `prefers-reduced-motion` removes spatial travel and keeps instant opacity/state changes.

## Unresolved decisions

None blocking. Exact exercise asset coverage is governed by the initial high-frequency library and graceful icon fallback.
