export const ENGLISH_BETA_LANGUAGE = 'en' as const;

export function normalizeProductLanguage(candidate: unknown): 'en' {
  void candidate;
  return ENGLISH_BETA_LANGUAGE;
}

export function getEnglishGreeting(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
