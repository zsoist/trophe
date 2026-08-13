import { expect, type Page } from '@playwright/test';
import type { ThemeMode } from './auth';

export async function assertNoPageOverflow(page: Page): Promise<void> {
  const violations = await page.evaluate(() => {
    const name = (element: HTMLElement) => element.getAttribute('aria-label')?.trim() || element.innerText.trim() || element.textContent?.trim() || '';
    const path = (element: HTMLElement) => {
      const parts: string[] = [];
      let current: HTMLElement | null = element;
      while (current && parts.length < 5) { parts.unshift(`${current.tagName.toLowerCase()}${current.id ? `#${current.id}` : ''}`); current = current.parentElement; }
      return parts.join(' > ');
    };
    const root = document.documentElement;
    const overflow = root.scrollWidth - window.innerWidth;
    const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"]'))
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: name(element), path: path(element), left: rect.left, right: rect.right };
      })
      .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1);
    return { overflow, controls };
  });
  expect(violations.overflow, `page overflow is ${violations.overflow}px`).toBeLessThanOrEqual(1);
  expect(violations.controls, `offscreen interactive controls:\n${JSON.stringify(violations.controls, null, 2)}`).toEqual([]);
}

export async function assertNamedInteractiveControls(page: Page): Promise<void> {
  const unnamed = await page.evaluate(() => {
    const name = (element: HTMLElement): string => {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelled = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
        if (labelled) return labelled;
      }
      const aria = element.getAttribute('aria-label')?.trim();
      if (aria) return aria;
      const enclosingLabel = element.closest('label')?.textContent?.trim();
      if (enclosingLabel) return enclosingLabel;
      if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && element.labels?.length) return Array.from(element.labels).map((label) => label.textContent?.trim() ?? '').join(' ').trim();
      const placeholder = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder.trim() : '';
      return element.getAttribute('title')?.trim() || element.querySelector('img')?.getAttribute('alt')?.trim() || element.innerText.trim() || element.textContent?.trim() || placeholder || '';
    };
    const path = (element: HTMLElement) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;
    return Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"]'))
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0;
    })
    .map((element) => ({ name: name(element), path: path(element) }))
    .filter(({ name }) => !name);
  });
  expect(unnamed, `interactive controls without accessible names:\n${JSON.stringify(unnamed, null, 2)}`).toEqual([]);
}

export async function assertMinimumTargets(page: Page, minimumPx: number): Promise<void> {
  const undersized = await page.evaluate((minimum) => {
    const name = (element: HTMLElement) => element.getAttribute('aria-label')?.trim() || element.getAttribute('title')?.trim() || element.innerText.trim() || element.textContent?.trim() || '';
    const path = (element: HTMLElement) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;
    return Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"]'))
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || element.getClientRects().length === 0) return false;
      // Text links embedded in a prose line are exempt; icon-only links are not.
      return !(element.tagName === 'A' && style.display.startsWith('inline') && element.textContent?.trim());
    })
    .map((element) => {
      const target = element.closest('label') ?? element;
      const rect = target.getBoundingClientRect();
      return { label: name(element), width: Math.round(rect.width), height: Math.round(rect.height), path: path(element) };
    })
    .filter(({ width, height }) => width < minimum || height < minimum);
  }, minimumPx);
  expect(undersized, `targets below ${minimumPx}px:\n${JSON.stringify(undersized, null, 2)}`).toEqual([]);
}

export async function assertTheme(page: Page, mode: ThemeMode): Promise<void> {
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`));
  await expect(page.locator('html')).not.toHaveClass(new RegExp(`\\b${mode === 'light' ? 'dark' : 'light'}\\b`));
  await expect(page.locator('html')).toHaveCSS('color-scheme', mode);
}
