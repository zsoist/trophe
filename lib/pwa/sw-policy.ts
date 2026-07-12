export interface ServiceWorkerRequestContext {
  sameOrigin: boolean;
  url: URL;
  request: {
    mode: string;
    destination: string;
    headers: { get(name: string): string | null };
  };
}

export function mustUseNetwork({ request, url, sameOrigin }: ServiceWorkerRequestContext): boolean {
  return request.mode === 'navigate'
    || request.destination === 'document'
    || request.headers.get('RSC') === '1'
    || url.searchParams.has('_rsc')
    || (sameOrigin && url.pathname.startsWith('/api/'))
    || url.hostname.endsWith('.supabase.co')
    || url.hostname.endsWith('.supabase.in');
}

export function isStaticAssetRequest({ sameOrigin, url }: ServiceWorkerRequestContext): boolean {
  return sameOrigin && url.pathname.startsWith('/_next/static/');
}

export function isPublicAssetRequest({ sameOrigin, url }: ServiceWorkerRequestContext): boolean {
  return sameOrigin && (
    url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/images/')
    || url.pathname === '/favicon.svg'
    || url.pathname === '/apple-touch-icon.png'
  );
}
