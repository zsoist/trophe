export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}
