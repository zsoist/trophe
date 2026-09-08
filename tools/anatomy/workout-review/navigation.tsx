/** Private export only: preserve product URLs in the hash without a Next server. */
import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

const home = '/dashboard/workout';
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
function snapshot() { return window.location.hash.slice(1) || home; }
export function navigate(href: string, replace = false) {
  if (!href.startsWith('/')) return;
  if (replace) {
    window.history.replaceState(null, '', `#${href}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (snapshot() !== href) window.location.hash = href;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
const router = { push: navigate, replace: (href: string) => navigate(href, true), back: () => window.history.back(), refresh: () => {}, prefetch: () => {} };
export function useRouter() { return router; }
export function useReviewLocation() { return useSyncExternalStore(subscribe, snapshot, () => home); }
export function usePathname() { return useReviewLocation().split('?')[0]; }
export function useSearchParams() {
  const location = useReviewLocation();
  return useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
}
export default function ReviewLink({ href = '', onClick, prefetch: _prefetch, replace, scroll: _scroll, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; prefetch?: boolean; replace?: boolean; scroll?: boolean }) {
  void _prefetch; void _scroll;
  return <a {...props} href={href.startsWith('/') ? `#${href}` : href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !href.startsWith('/')) return;
    event.preventDefault(); navigate(href, replace);
  }} />;
}
