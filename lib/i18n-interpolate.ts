export function interpolateTranslation(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;

  let text = template;
  for (const [key, value] of Object.entries(params)) {
    text = text.replaceAll(`{${key}}`, () => String(value));
  }
  return text;
}
