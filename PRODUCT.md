# Trophē Product Truth

## Product

Trophē is an AI-assisted coaching platform for professional nutrition and fitness coaches and their clients. It combines a real coach relationship, precise food logging, training plans, fast workout execution, progress evidence, and private messaging in one mobile-first product.

The product must feel trustworthy enough to sell to coaching businesses and simple enough for a client to use during an actual meal or workout without instruction.

## Primary users

### Client

A client such as Nik wants to understand what to do today, log food and training quickly, receive useful feedback, and see whether their habits and performance are improving. During a workout they may be moving, tired, using one hand, or training in difficult lighting. The interface must therefore prioritize large targets, legible contrast, persistent state, and recovery from interruption.

### Coach

A professional coach manages multiple clients, assigns or approves programs, reviews nutrition and training evidence, responds to pain or form concerns, and needs to trust that the client-facing experience preserves the intended plan.

## Unique mechanism

Trophē is a coach-governed adaptive loop:

1. The coach can assign and approve a program.
2. Trophē can prepare an editable recommendation from the client’s goals, level, equipment, history, recovery, and reported pain.
3. The client reviews the plan before choosing to start a live workout or record a workout completed elsewhere.
4. Sets, effort, rest, pain, and completion become evidence visible to the client and coach.
5. The next recommendation adapts while the coach retains final authority.

AI assists; it never silently starts, completes, or medically clears a workout. The initial recommendation path must work without recurring paid-model calls. Paid inference remains optional and budget-gated.

## Workout jobs

The Workout module must support six clear jobs without mixing their states:

- Understand today’s coach plan and current readiness.
- Explore exercises by body area, equipment, goal, or search.
- Build or customize a reusable routine.
- Review the exact workout before starting it.
- Run or pause a live session with fast set logging and visible technique help.
- Review history, muscle distribution, personal records, and trend evidence.

A reusable plan is not a live session. Adding an exercise does not start a timer. Finishing always requires confirmation, and an empty session is never saved accidentally.

## Experience principles

- **One obvious next action.** Every Workout screen has a single primary action and a clear way back.
- **Plan before live.** Discovery and editing stay calm; live mode becomes focused and high-contrast only after explicit start.
- **Coach-led, client-controlled.** Coach assignments lead, but clients can inspect, substitute, and report constraints without destroying the source plan.
- **Evidence over decoration.** Previous values, targets, progress, recovery, muscle load, and form cues earn screen space.
- **Anatomy must be honest.** Exercise media must match the named movement, equipment, position, and highlighted muscles. A generic body-area image is labeled as anatomy, never presented as a technique demonstration.
- **Motion teaches.** Motion is reserved for exercise technique, state transitions, timers, and progress. It must pause, respect reduced-motion preferences, and never obstruct logging.
- **Mobile is the arena.** The core path must work at 320–430 CSS pixels, in light and dark mode, with safe-area protection and no controls hidden by the bottom navigation or keyboard.
- **Language stays coherent.** English is the development source of truth. Translated chrome ships only when the complete flow is translated; exercise names and instructions fall back visibly to English rather than mixing languages within one sentence.

## Visual commitments

Workout extends the established **Personal Best** world: obsidian/graphite in dark mode, warm paper in light mode, Trophē gold for identity and decisive actions, and restrained performance colors for data channels. It uses compact evidence rails, tabular metrics, contained anatomical imagery, and a stable five-destination bottom navigation.

The redesign may replace Workout composition, cards, controls, icons, and motion, but it must not turn the rest of the product into a new visual identity.

## Content and media

Each supported exercise should eventually have a media record containing:

- canonical exercise and equipment identity;
- primary and secondary muscles;
- neutral-light technique still or loop;
- front/back anatomical focus when useful;
- setup, movement, breathing, and safety cues;
- provenance, dimensions, duration, and reduced-motion poster;
- an explicit fallback tier when exact media is unavailable.

Muscle-group animation is a first-class teaching surface. It must use a deterministic, named front/back anatomy map; distinguish primary, secondary, and stabilizing roles; explain the highlighted regions in text; and transition only when it adds understanding. Technique motion must be controllable, match the named exercise and equipment, and fall back to a static poster for reduced-motion users. An AI-generated body or movement is never accepted as anatomical authority without curated metadata and human visual review.

Real-person and photoreal technique media may be generated or sourced only with clear provenance. It is coaching guidance, not a medical diagnosis. Pain flags are shared with the coach and should advise stopping or modifying activity when severity warrants it.

## Business and technical constraints

- Production is a PWA and web application, with mobile Safari as a first-class target.
- Existing authenticated data isolation, auditability, and coach/client permissions must remain intact.
- Draft and live sessions must survive navigation, refresh, temporary network loss, and retryable persistence failures.
- The user has authorized subsequent deployments for this goal, but deployment remains gated by tests, accessibility, responsive review, and production canaries.
- Recurring model/API spend is not implied by design approval. Any new paid inference path must remain within an explicitly approved budget.
- Existing unrelated or untracked workspace files are preserved until their ownership is known.

## Success criteria

A first-time client can choose or understand a workout, customize it, review it, start it, log a set, pause it, inspect technique, report pain, and finish it without coaching from a human or changing tabs to recover navigation. The same journey remains clear in light and dark mode and after interruption.

The module feels premium because it is specific, responsive, and trustworthy—not because it is flashy. Media is crisp and anatomically credible, motion is useful, progress is legible, and every state makes the next action obvious.
