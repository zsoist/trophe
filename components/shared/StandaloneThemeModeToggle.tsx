'use client';

/**
 * Public-shell theme control. It deliberately avoids the app-wide context so
 * the server-rendered landing page does not ship provider state machinery.
 */
export function StandaloneThemeModeToggle() {
  const toggleMode = () => {
    const root = document.documentElement;
    const next = root.classList.contains('light') ? 'dark' : 'light';

    try {
      localStorage.setItem('trophe_theme_mode', next);
    } catch {
      // Theme changes still apply when storage is unavailable.
    }

    root.classList.remove('dark', 'light');
    root.classList.add(next);
    root.style.colorScheme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      next === 'dark' ? '#0A0A0A' : '#FAFAF9',
    );
  };

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border-default)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
      title="Toggle color theme"
      aria-label="Toggle color theme"
    >
      <span data-theme-icon="dark" aria-hidden="true" className="theme-icon-in text-xs text-[var(--content-muted)] [.light_&]:hidden">
        Dark
      </span>
      <span data-theme-icon="light" aria-hidden="true" className="theme-icon-in hidden text-xs text-[var(--action-primary)] [.light_&]:block">
        Light
      </span>
    </button>
  );
}
