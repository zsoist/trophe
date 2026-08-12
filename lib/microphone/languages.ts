const SPEECH_LANGUAGE_TAGS: Record<string, string> = {
  de: 'de-DE',
  el: 'el-GR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
};

export function speechLanguageTag(locale: string): string {
  const normalizedLocale = locale.toLowerCase().split(/[-_]/)[0];
  return SPEECH_LANGUAGE_TAGS[normalizedLocale] ?? SPEECH_LANGUAGE_TAGS.en;
}
