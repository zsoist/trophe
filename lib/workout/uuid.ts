const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && UUID_PATTERN.test(normalized) ? normalized : null;
}
