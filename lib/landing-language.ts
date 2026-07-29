export const LANDING_LANGUAGE_ROUTES = {
  en: '/',
  es: '/es',
  el: '/el',
} as const;

export type LandingLang = keyof typeof LANDING_LANGUAGE_ROUTES;

export function landingLanguageHref(lang: LandingLang): string {
  return LANDING_LANGUAGE_ROUTES[lang];
}
