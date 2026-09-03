import type { Language } from '@/lib/types';

const LANGUAGE_LOCALES: Record<Language, string> = {
  en: 'en-US',
  es: 'es-ES',
  el: 'el-GR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
};

export function localeForLanguage(language: Language | string): string {
  return LANGUAGE_LOCALES[language as Language] ?? 'en-US';
}
