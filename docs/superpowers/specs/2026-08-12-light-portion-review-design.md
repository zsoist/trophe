# Light-mode portion review design

## Goal

Make the mobile food portion-review state immediately readable and easier to operate in light mode while preserving dark mode and all portion calculations.

## Evidence

The supplied 390px-wide screenshot shows three visible defects in the ajiaco confirmation state:

1. Amber text and controls are too pale against white and cream surfaces.
2. The quantity, unit, portion options, and action labels are too small for rapid scanning and tapping.
3. Nested card padding and a fixed `pb-64` spacer reduce the useful content width and leave excessive empty space.

## Design

- Keep Trophy's existing glass surfaces, gold accent, typography, icons, and information order.
- Give the food-review component its own semantic classes so light-mode contrast can be corrected without globally changing every amber utility.
- Use `var(--warn)`/dark amber for light-mode instructional text, borders, and estimated-state labels. Preserve the existing warm amber appearance in dark mode.
- Make the amount input 96px wide with a 20px value, and make the decrement/increment controls 52px square.
- Make Small/Medium/Large buttons at least 58px tall with labels of at least 14px and values of at least 12px.
- Use the full available card width: reduce outer item padding from 12px to 10px, tighten gaps, and let the quantity row distribute across the width.
- Replace the unconditional 256px content spacer with a smaller responsive spacer sized for the fixed save bar.
- Increase the review summary numbers and labels while reducing unnecessary save-bar padding.
- Add explicit accessible labels to item-removal controls and preserve 44px-or-larger touch targets for all primary interactions.

## Responsive behavior

- Mobile baseline: 390x844.
- At very narrow widths, the quantity row remains on one line and the unit may truncate rather than forcing horizontal overflow.
- Desktop retains the existing `max-w-md` review width.

## Testing

- Extend the mounted ajiaco review test to verify accessible controls and selection behavior.
- Add a CSS contract test that loads the real stylesheet and verifies the component-specific light-mode declarations and minimum control sizes.
- Run focused Vitest, typecheck, lint, production build, and a visual mobile comparison before deployment.

## Non-goals

- No changes to food parsing, gram conversion, macro calculations, navigation, theme selection, or other dashboard cards.

