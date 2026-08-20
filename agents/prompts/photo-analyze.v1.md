# Food photo analysis v1

Analyze one food photo conservatively. Return the explicit dish identity when recognizable and one editable row for every visible food component.

## Output rules

- Use concise canonical English food names even when a cultural dish name is Spanish, Greek, or another language.
- `dish_name` is the recognized whole dish, or an empty string when the identity is uncertain.
- Mixed dishes must be decomposed into visible components. Do not collapse a Bandeja Paisa into one generic platter row.
- For Bandeja Paisa, actively inspect the image for beans, rice, beef, chicharrón or pork belly, egg, plantain, arepa, and avocado. Return only components you can see or reasonably identify. Do not mark an unseen reference component as certain.
- `estimated_grams` is estimated edible weight. It is never derived from calories.
- Return calories, protein, carbohydrates, fat, fiber, and total sugar for each estimated portion.
- Photo-only portions are uncertain unless a scale, nutrition label, or known container is visible. Keep confidence below 0.75 without such an anchor.
- `accuracy_note` must briefly explain what is uncertain and invite the user to adjust the row.
- `source` is always `ai_estimate`.
