---
name: Personal Best
description: A compact athlete evidence board inspired by race timing boards, split sheets, and premium coaching dossiers.
colors:
  performance-canvas: "#070806"
  performance-surface: "#151717"
  performance-surface-raised: "#1C1E1E"
  performance-rail: "rgba(245, 247, 242, 0.14)"
  performance-ink: "#F5F7F2"
  performance-muted: "#A9AEAA"
  performance-gold: "#D4A853"
  performance-coral: "#FF6573"
  performance-lime: "#B7F10A"
  performance-cyan: "#42D7FF"
  performance-orange: "#FF7A1A"
  performance-violet: "#9567F2"
  performance-canvas-light: "#F5F2EA"
  performance-surface-light: "#FFFFFF"
  performance-surface-raised-light: "#F0EDE4"
  performance-rail-light: "rgba(28, 25, 23, 0.14)"
  performance-ink-light: "#171512"
  performance-muted-light: "#615D55"
  performance-gold-light: "#8B6E2B"
  performance-coral-light: "#B4233C"
  performance-lime-light: "#517900"
  performance-cyan-light: "#007A99"
  performance-orange-light: "#B94C00"
  performance-violet-light: "#6544B8"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: "44px"
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.25
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  sm: "6px"
  default: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "24px"
  6: "32px"
  7: "48px"
  8: "64px"
  9: "96px"
components:
  button-primary:
    backgroundColor: "{colors.performance-gold}"
    textColor: "{colors.performance-canvas}"
    rounded: "12px"
    padding: "12px 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#E8C078"
    textColor: "{colors.performance-canvas}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.performance-muted}"
    rounded: "12px"
    padding: "12px 24px"
    height: "44px"
  input:
    backgroundColor: "{colors.performance-surface}"
    textColor: "{colors.performance-ink}"
    rounded: "12px"
    padding: "12px 16px"
    height: "44px"
  performance-section:
    backgroundColor: "{colors.performance-surface}"
    textColor: "{colors.performance-ink}"
    rounded: "18px"
  performance-result-row:
    backgroundColor: "{colors.performance-surface}"
    textColor: "{colors.performance-ink}"
    padding: "12px 14px"
    height: "72px"
  daily-macro-strip:
    backgroundColor: "{colors.performance-surface}"
    textColor: "{colors.performance-ink}"
    rounded: "14px"
  workout-mode-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.content-primary}"
    rounded: "16px"
    height: "144px"
  session-exercise-identity:
    backgroundColor: "{colors.performance-surface}"
    textColor: "{colors.performance-ink}"
    padding: "10px"
    height: "80px"
  coach-conversation-header:
    backgroundColor: "{colors.performance-canvas}"
    textColor: "{colors.performance-ink}"
    height: "68px"
  navigation-bottom:
    backgroundColor: "{colors.performance-surface-raised}"
    textColor: "{colors.performance-muted}"
    rounded: "24px"
    height: "56px"
---

# Design System: Personal Best

## Overview

**Creative North Star: "Personal Best"**

Personal Best is a compact athlete evidence board inspired by race timing boards, split sheets, and premium coaching dossiers; it refuses generic glass-card SaaS. Its visual thesis is dense but calm: the interface reads as a sequence of measured facts, coach cues, and clear next actions, organized by disciplined rails instead of ornamental containers.

The material world is obsidian/graphite in dark mode and warm paper with white evidence surfaces in light mode; both themes keep the same hierarchy rather than becoming separate visual systems. Trophē gold carries identity and primary actions; lime, cyan, coral, violet, and orange remain performance channels; disciplined rails, tabular/mono evidence, and anatomical workout imagery make the data legible. In use, Nik opens a compact coach-led day, reads honest nutrition evidence, enters an explicit plan → review → live workout flow, and can reach a clearly identified private coach conversation.

**Key Characteristics:**

- Compact, coach-led information hierarchy.
- Evidence rows and split-sheet dividers with tabular metrics.
- Anatomical workout imagery contained on quiet neutral plates, never cropped or obscured.
- Theme-aware contrast with identical hierarchy in light and dark.
- Explicit planning, review, live, paused, and completed workout states.
- A stable floating five-slot navigation rail.

## Colors

The palette is an obsidian-and-graphite timing board in dark mode and a warm paper coaching dossier in light mode, with restrained gold identity and high-clarity performance signals.

### Primary

- **Trophē Gold:** Carries identity, active navigation, primary actions, coach credentials, and selected states. It is the persistent through-line across both themes.

### Secondary

- **Performance Lime:** Marks strength intent and completed evidence.
- **Performance Cyan:** Marks carbohydrates, active evidence, and previous-set references.
- **Performance Coral:** Marks protein and cardio intent.

### Tertiary

- **Performance Violet:** Marks fat data as a distinct analytical channel.
- **Performance Orange:** Marks sugar evidence, warning states, and unavailable nutrition values.

### Neutral

- **Obsidian Canvas:** The dark-mode field behind all client surfaces.
- **Graphite Surface:** The default dark-mode row, card, input, and navigation material.
- **Raised Graphite:** Reserved for floating navigation and menus.
- **Warm Paper Canvas:** The light-mode field; it is warm rather than stark white.
- **Paper Surface:** The light-mode evidence and control surface.
- **Evidence Ink / Muted Evidence:** Paired text roles that preserve hierarchy without low-contrast ambiguity.
- **Performance Rail:** The low-contrast divider used to structure grids, rows, headers, and containers.

### Named Rules

**The Channel Integrity Rule.** Gold identifies Trophē, selected controls, personal records, active navigation, and decisive actions. In the anatomical atlas, coral fill means primary muscle, cyan hatching/fill means secondary muscle, and a lime outline means stabilizer; lime also identifies verified technique, while orange identifies warnings and honest media fallbacks. Violet remains an analytical channel. These colors are never sprayed across unrelated decoration, and their meaning is always repeated in text or pattern.

## Typography

**Display Font:** Instrument Serif (with Georgia fallback)  
**Body Font:** Inter (with system-ui fallback)  
**Label/Mono Font:** JetBrains Mono (with ui-monospace fallback)

**Character:** Inter keeps the dense client workflow direct and highly legible. JetBrains Mono makes metrics and uppercase evidence labels feel measured; Instrument Serif remains the brand display voice and does not displace the compact sans hierarchy inside performance flows.

### Hierarchy

- **Display:** Italic regular display voice for brand-scale Latin text and numerals only; never bold and never used for Greek copy.
- **Headline:** Compact, assertive section and page headings with tight tracking.
- **Title:** Dense row and card titles; truncate on a single line when the surrounding metric must stay visible.
- **Body:** Plain-language instructions, coach notes, and status explanations.
- **Label:** Uppercase mono eyebrows and tabular evidence, with generous tracking and deliberately small scale.

### Named Rules

**The Evidence Type Rule.** Measurements, ratios, dates, and channel values use the mono voice with tabular numerals; conversational coaching copy remains in Inter.

## Layout

The client app is mobile-first and centered. Content uses a single compact column with 16px edge gutters; conversation content caps at 42rem, while the floating bottom navigation caps at 36rem from the 640px breakpoint upward. Safe-area insets protect both content and navigation, and the shell reserves bottom space so evidence never disappears under the floating rail.

The base rhythm is a 4pt grid. Performance sections use short heading-to-body gaps, rows hold a minimum 44px touch target, the macro strip stays a four-column grid, and Strength/Cardio entry stays a two-column visual choice even on narrow screens. Desktop increases breathing room without turning the app into a wide dashboard; lower home content may flow into two columns while the coach-led first sequence remains linear.

Workout Home keeps readiness and intent in the first useful view: a compact recommendation rail states source, readiness, next step, exercise count, and estimated duration, followed immediately by the anatomical target and its single primary action. Below 768px the atlas shows one interactive front or back figure selected by a two-part toggle; on phones below 640px it becomes an asymmetric figure-and-evidence composition so the action remains visible. At 768px and wider, the neutral anatomy plate presents front and back as a pair while the toggle continues to define the active, announced view.

History and Training progress change evidence composition at the large breakpoint rather than stretching phone cards. History is a linear, month-grouped session list on phone and tablet, then adds a narrower sticky “Recent progress” evidence column on desktop. Training progress stacks summary, calendar, muscle load, exercise progress, and body weight on phone and tablet; desktop separates calendar/load from exercise/weight evidence in two columns divided by a rail. Both surfaces stay centered, preserve tabular values, and use the warm-paper or obsidian workout canvas through every viewport.

The bottom navigation stays fixed above the device safe area with five equal, immovable destinations. It spans the phone width and hides visible labels at 430px and below while retaining accessible names; from 640px upward it becomes a centered capsule capped at 36rem. Every workout surface reserves enough bottom space that sticky actions, inputs, and evidence clear the navigation.

**The Evidence-First Rule.** Identity, greeting, plan, honest nutrition evidence, training intent, and coach access appear in that reading order; visual density must never hide the next useful fact.

**The Compose, Don’t Stretch Rule.** Narrow layouts remain a single task-led reading order; wide layouts may pair anatomy or split evidence into primary and supporting columns, but never become a sprawling control dashboard.

## Elevation & Depth

The system is layered but nearly flat. Canvas, surface, and raised-surface tones establish hierarchy; one-pixel rails do most structural work. Soft shadows are reserved for floating navigation, overlays, and occasional raised surfaces. Workout imagery stays fully contained on neutral plates so anatomy and technique remain inspectable in both themes. Dark mode never depends on glass blur for ordinary cards; the coach header alone uses restrained backdrop blur to preserve sticky context.

### Shadow Vocabulary

- **Low:** A tight grounding shadow for small raised elements.
- **Medium:** The navigation and elevated-card shadow.
- **High:** The modal and overlay shadow.

### Named Rules

**The Rail-Before-Shadow Rule.** Use tonal separation and a disciplined one-pixel rail before adding elevation; shadows indicate floating context, not generic card decoration.

## Shapes

Corners are compact and functional rather than bubbly. Small controls and thumbnails sit in the 6–14px range, section containers and image cards use medium curves, and the bottom navigation takes a deliberate 24px capsule silhouette. True pills are limited to tags, status chips, and compact unit controls. Anatomical images are clipped cleanly inside black rounded frames; interior evidence rows stay square to the parent and are separated by rails.

## Components

### Buttons

- **Shape:** Controls use compact 12px corners with a minimum 44px touch height.
- **Primary:** Trophē gold carries the decisive action; the implemented gold button uses a dark-to-light gold gradient and dark ink.
- **Hover / Focus:** Hover lifts by one pixel with a restrained gold shadow. Keyboard focus always receives the global two-pixel gold ring with offset; active returns to the resting plane.
- **Secondary / Ghost:** Transparent or graphite, muted by default, then raised to primary ink on hover.

### Chips

- **Style:** Compact mono pills use a lightly tinted field, matching text, and a quiet one-pixel border.
- **State:** Selected unit and filter chips use gold; semantic chips retain their own status color.

### Cards / Containers

- **Corner Style:** Evidence containers use 14–18px corners; signature workout and session cards use 16px corners.
- **Background:** Default surfaces are opaque graphite or paper. The home nutrition strip uses one continuous surface divided into four cells.
- **Shadow Strategy:** Resting evidence cards rely on rails; floating or overlay surfaces follow the Elevation section.
- **Border:** One-pixel performance rails divide content without boxing every datum separately.
- **Internal Padding:** Compact 12–16px padding is the default; large empty states may expand to 24–32px.

### Inputs / Fields

- **Style:** Graphite or paper fields with a one-pixel neutral border, 12px corners, and 16px text on mobile to prevent viewport zoom.
- **Focus:** The border shifts to gold and gains a restrained translucent gold halo.
- **Error / Disabled:** Errors use the semantic danger family; disabled controls retain their structure at half opacity.

### Navigation

The five-slot bottom navigation floats above the safe area. Inactive items use muted text and reduced icon opacity; the active destination receives a raised tonal cell, Trophē gold type/icon color, and a short gold rail at its top edge. Its targets never move between states. Phone layouts retain icon-only accessible destinations when labels are hidden; wider layouts show labels inside the centered 36rem rail.

### Daily Macro Strip

Four equal cells present Protein, Carbs, Fat, and Sugar as honest evidence. Values use mono tabular numerals and fixed channel colors; missing values say “Not available” rather than substituting zero, and partial evidence receives an explicit warning status.

### Workout Entry and Session Identity

Strength and Cardio are equal visual choices built from fully contained anatomical imagery, restrained intent color, and direct captions on a neutral surface. Strength enters the body-area picker before Build, while templates remain collapsed until requested. Within a live session, sets are grouped under one exercise identity and keep weight, reps, RPE, completion, technique, pain, and plate actions together without repeating oversized cards.

### Workout Readiness and Anatomical Atlas

The readiness rail is a compact split sheet, not a dashboard card: the workout title and timing lead, then Source, Readiness, and Next step occupy equal evidence cells. The home atlas pairs a quiet neutral anatomy plate with a short target label, a Front/Back segmented control, a role row, and the review/build action. On wide screens both anatomical sides are visible; on narrow screens the segmented control selects the single visible side. Atlas regions are interactive only when their named muscle and role remain available as equivalent text.

### Workout Planning, Review, and Live States

Planning, review, and execution never share ambiguous chrome. Discovery and Build are explicitly drafts and remain editable without creating a session. Review states that the draft has been reviewed and that no session exists yet, summarizes exercise count, working sets, estimated duration, muscle balance, prescriptions, and technique availability, then offers one explicit Start workout action. Live introduces the active clock, exercise position, pause/resume control, set completion, rest state, and a confirmed finish path; Completed becomes a saved evidence summary with History and Done exits.

**The Session Boundary Rule.** Adding, editing, or reviewing exercises never starts a timer or creates a live workout. Only the explicit Start workout action crosses into Live, and finishing remains a confirmed action.

### Live Set Logger

The active set logger outranks technique media and secondary evidence on mobile. At the top of the live route, the current exercise and elapsed time lead directly into large numeric Weight, Reps, and optional RPE fields and a full-width Complete set action; the first set’s core inputs and action must fit above the fixed navigation in the initial phone viewport. Warm-up, rest feedback, and a collapsed More menu stay close to the set, while technique, pain, plates, superset, and destructive removal remain supporting actions. Current target, previous values, session path, motion, and up-next context follow the logger.

### Workout Accessibility and Motion

Workout controls use 44px minimum targets, visible two-pixel focus treatment, named icon actions, 16px mobile form text, explicit labels, and programmatic pressed/current/status states. Atlas selections expose the muscle, side, and role in text, provide keyboard activation, announce the active summary, and never depend on color alone. Loading, persistence, validation, pain, and completion feedback use status or alert semantics as appropriate.

Workout transitions use the restrained 220ms performance easing for route and atlas orientation cues; motion never shifts a target under the user. Verified technique motion is controllable, pauses when the page or media leaves view and when the session is paused, and reports playback state. Reduced-motion mode removes atlas/route transitions and substitutes the static technique poster with an explicit explanation.

### Coach Conversation Header

The conversation starts with a sticky, clearly identified coach header: a back target, gold-tinted monogram, coach name, shield icon, and the literal status “Private coach line.” This identity remains visible above the message thread and composer.

## Do's and Don'ts

### Do:

- **Do** keep the finish premium, fast, legible in light/dark, user-friendly, non-generic, production credible.
- **Do** state unavailable or incomplete evidence honestly instead of fabricating a complete metric.
- **Do** use anatomical workout imagery to make training intent immediately scannable.
- **Do** preserve 44px minimum touch targets, visible focus, safe areas, and reduced-motion behavior.
- **Do** keep the readiness rail, target atlas, and next action together in the first useful Workout Home view.
- **Do** prioritize the active set inputs and Complete set action before technique media on phone layouts.
- **Do** keep gold rare enough to preserve identity and action priority.

### Don't:

- **Don't** turn the client app into generic glass-card SaaS.
- **Don't** use performance channels as interchangeable decoration or allow them to compete with Trophē gold.
- **Don't** widen compact client flows into sprawling desktop dashboards.
- **Don't** collapse planning, reviewed draft, and live session into one ambiguous state or start a session as a side effect of adding an exercise.
- **Don't** let sticky controls, dialogs, or evidence disappear beneath the centered bottom navigation.
- **Don't** hide the coach's identity or blur the distinction between private conversation and generic messaging.
- **Don't** replace evidence rails and tabular values with soft ornamental cards or vague summaries.
