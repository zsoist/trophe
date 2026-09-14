/** Upper bound on distinct token terms any single caller may search with. */
export const POSTGREST_MAX_TOKEN_TERMS = 5;

/**
 * Serialise free text so it can be safely interpolated into a PostgREST
 * `or=(...)` filter without losing the user's meaning.
 *
 * PostgREST parses the `or` value as raw filter syntax: a bare comma separates
 * conditions and `(` `)` (and `"`) open grouped/`in` lists. A raw value such as
 * `chicken, rice` therefore produces an extra condition — PostgREST rejects the
 * malformed expression (the route answers "search temporarily unavailable") or
 * silently matches unintended rows.
 *
 * Replacement policy — keep meaning, never inject syntax:
 *  - `%`, `_` and `\` keep working as ILIKE wildcards/escapes: they are escaped
 *    with the LIKE default escape character `\` (unchanged from the first fix).
 *  - `,` `(` `)` `"` are PostgREST delimiters with no search meaning, so they
 *    collapse to a single space instead of being dropped. `"milk, whole"` must
 *    still describe the same two words, not `"milkwhole"` or `"milk  whole"`.
 *  - runs of whitespace collapse to one space and the result is trimmed so the
 *    term never contains a stray empty fragment.
 *
 * NOTE: matching stays a single literal ILIKE pattern. Punctuation we strip can
 * sit between words in a stored name (e.g. the row `Milk, whole`), so callers
 * that need recall must add the token OR-filter from `postgrestTokenTerms`
 * rather than relying on this phrase returned verbatim by the database.
 */
export function sanitizePostgrestIlikeTerm(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\\%_]/g, '\\$&')
    .replace(/[,"()]/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

/**
 * Whether free text still carries something to search for after sanitising.
 *
 * Delimiter-only input (`,()"`, whitespace) collapses to the empty string.
 * Interpolating that would build `column.ilike.%%`, a match-all pattern that
 * scans arbitrary rows, so callers MUST check this before issuing a query.
 */
export function hasPostgrestSearchText(raw: string): boolean {
  return sanitizePostgrestIlikeTerm(raw).length > 0;
}

/**
 * Split a user query into distinct, injection-safe ILIKE terms for a PostgREST
 * `or` fallback search.
 *
 * Callers that search by phrase alone drop rows whose stored name interleaves
 * punctuation with the words (`"milk, whole"` → `%milk whole%` misses
 * `Milk, whole`). Searching each word with an OR restores recall while keeping
 * the query bounded: the delimiters that could open extra PostgREST conditions
 * are already collapsed by `sanitizePostgrestIlikeTerm`, and every term is
 * escaped there, so each fragment stays a literal ILIKE pattern.
 *
 * Words shorter than three characters are dropped — a one/two letter `%a%`
 * pattern would scan nearly the whole table. The result is bounded by
 * `maxTerms` so a caller can never widen the query with a longer query string.
 * Returns `[]` when nothing searchable remains.
 */
export function postgrestTokenTerms(
  raw: string,
  maxTerms: number = POSTGREST_MAX_TOKEN_TERMS,
): string[] {
  const bound = Math.max(0, Math.floor(maxTerms));
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const token of sanitizePostgrestIlikeTerm(raw).split(/\s+/)) {
    if (terms.length >= bound) break;
    if (token.length < 3 || seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
  }
  return terms;
}

/**
 * Build a safe `or=(...)` value: one `column.ilike.%term%` fragment per
 * (term, column) pair, OR-ed together so a row matching any term in any column
 * is returned. `terms` must already be escaped (see `postgrestTokenTerms`) and
 * non-empty: an empty term would build `%%` and match every row, so this
 * throws instead of constructing a match-all filter.
 */
export function postgrestIlikeOrFilter(terms: string[], columns: string[]): string {
  if (columns.length === 0) {
    throw new Error('postgrestIlikeOrFilter requires at least one column');
  }
  if (terms.length === 0) {
    throw new Error('postgrestIlikeOrFilter requires at least one non-empty term');
  }
  for (const term of terms) {
    if (term.length === 0) {
      throw new Error('postgrestIlikeOrFilter rejects empty terms (would match every row)');
    }
  }
  return terms
    .flatMap((term) => columns.map((column) => `${column}.ilike.%${term}%`))
    .join(',');
}

/**
 * Merge a phrase-matching page with a supplementary token-matching page.
 *
 * Phrase matches are the closest to what the user typed, so they stay first
 * and in the order the database returned them (popularity). Token-only matches
 * fill the remaining budget, keyed by `id` so a row returned by both queries
 * appears once. The result is always bounded by `limit`.
 */
export function mergePostgrestSearchRows<T extends { id?: unknown }>(
  phraseRows: readonly T[],
  tokenRows: readonly T[],
  limit: number,
): T[] {
  const bound = Math.max(0, Math.floor(limit));
  if (bound === 0) return [];
  const seen = new Set<unknown>();
  const merged: T[] = [];
  for (const row of [...phraseRows, ...tokenRows]) {
    const key = row?.id ?? row;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= bound) break;
  }
  return merged;
}
