export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'trophe_theme_mode';

export const THEME_COLOR: Record<ThemeMode, string> = {
  dark: '#0A0A0A',
  light: '#FAFAF9',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light';
}

export function resolveInitialTheme(storageValue: string | null, rootClass: string): ThemeMode {
  const rootClasses = rootClass.split(/\s+/);

  if (rootClasses.includes('light')) return 'light';
  if (rootClasses.includes('dark')) return 'dark';

  return isThemeMode(storageValue) ? storageValue : 'dark';
}

export function applyThemeMode(mode: ThemeMode, document: Document): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(mode);
  root.style.colorScheme = mode;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = THEME_COLOR[mode];
}
