import { describe, expect, it } from 'vitest';
import {
  hasPostgrestSearchText,
  mergePostgrestSearchRows,
  postgrestIlikeOrFilter,
  postgrestTokenTerms,
  sanitizePostgrestIlikeTerm,
} from '@/lib/food/postgrest-search';

describe('sanitizePostgrestIlikeTerm', () => {
  it('keeps % and _ as escaped wildcards (Postgres LIKE default escape)', () => {
    expect(sanitizePostgrestIlikeTerm('100% Whey_Mix\\plain')).toBe(
      '100\\% whey\\_mix\\\\plain',
    );
  });

  it('neutralises PostgREST or-filter delimiters without splitting words apart', () => {
    // A comma would otherwise split the value into an extra condition and a
    // paren/quote could start a grouped list — either malforms the request.
    // The delimiter collapses to a single space so "milk, whole" stays the two
    // words it was, not "milkwhole" and not "milk  whole".
    expect(sanitizePostgrestIlikeTerm('milk, whole')).toBe('milk whole');
    expect(sanitizePostgrestIlikeTerm('rice(brown)')).toBe('rice brown');
    expect(sanitizePostgrestIlikeTerm('"quoted"')).toBe('quoted');
    for (const raw of ['a,b', 'a(b)', 'a)b(', 'a"b']) {
      expect(sanitizePostgrestIlikeTerm(raw)).not.toMatch(/[,"()]/);
      expect(sanitizePostgrestIlikeTerm(raw)).not.toMatch(/ {2,}/);
    }
  });

  it('lowercases and trims so the ilike pattern is stable', () => {
    expect(sanitizePostgrestIlikeTerm('  Arroz  ')).toBe('arroz');
    expect(sanitizePostgrestIlikeTerm('   ')).toBe('');
  });
});

describe('postgrestTokenTerms', () => {
  it('splits punctuation-separated words into distinct, escaped terms', () => {
    expect(postgrestTokenTerms('milk, whole')).toEqual(['milk', 'whole']);
    expect(postgrestTokenTerms('rice(brown)')).toEqual(['rice', 'brown']);
    // Escapes ride along per-word so each fragment stays a literal pattern.
    expect(postgrestTokenTerms('100% whey_mix')).toEqual(['100\\%', 'whey\\_mix']);
  });

  it('drops too-short and duplicate words so the filter stays bounded', () => {
    // A one/two letter `%a%` pattern would scan nearly the whole table.
    expect(postgrestTokenTerms('a, ab, milk, milk')).toEqual(['milk']);
    expect(postgrestTokenTerms('   ')).toEqual([]);
  });
});

describe('postgrestIlikeOrFilter', () => {
  it('ties every term to every column as OR-ed ilike fragments', () => {
    expect(postgrestIlikeOrFilter(['milk', 'whole'], ['name', 'name_es'])).toBe(
      'name.ilike.%milk%,name_es.ilike.%milk%,name.ilike.%whole%,name_es.ilike.%whole%',
    );
  });

  it('refuses to build a match-all filter from empty input', () => {
    // `%%` would match every row, so an empty term list/term must throw rather
    // than silently widen the query.
    expect(() => postgrestIlikeOrFilter([], ['name'])).toThrow();
    expect(() => postgrestIlikeOrFilter([''], ['name'])).toThrow();
    expect(() => postgrestIlikeOrFilter(['milk'], [])).toThrow();
  });
});

describe('hasPostgrestSearchText', () => {
  it('rejects delimiter-only and blank input (would sanitise to an empty pattern)', () => {
    for (const raw of [',()"', '()', ',', '"', '  ,()"  ', '   ']) {
      expect(sanitizePostgrestIlikeTerm(raw)).toBe('');
      expect(hasPostgrestSearchText(raw)).toBe(false);
    }
  });

  it('accepts real text and legitimate wildcards, which stay escaped', () => {
    expect(hasPostgrestSearchText('milk, whole')).toBe(true);
    expect(hasPostgrestSearchText('100% whey_mix')).toBe(true);
    expect(postgrestIlikeOrFilter([sanitizePostgrestIlikeTerm('100%')], ['name'])).toBe(
      'name.ilike.%100\\%%',
    );
    expect(postgrestIlikeOrFilter([sanitizePostgrestIlikeTerm('a_b')], ['name'])).toBe(
      'name.ilike.%a\\_b%',
    );
  });
});

describe('mergePostgrestSearchRows', () => {
  const phrase = [{ id: 'p1' }, { id: 'p2' }];
  const tokens = [{ id: 'p2' }, { id: 't1' }, { id: 't2' }];

  it('keeps phrase matches first, dedupes by id and bounds the page', () => {
    expect(mergePostgrestSearchRows(phrase, tokens, 10).map((row) => row.id)).toEqual([
      'p1',
      'p2',
      't1',
      't2',
    ]);
    expect(mergePostgrestSearchRows(phrase, tokens, 3).map((row) => row.id)).toEqual([
      'p1',
      'p2',
      't1',
    ]);
    expect(mergePostgrestSearchRows(phrase, tokens, 0)).toEqual([]);
  });

  it('tolerates an empty phrase page (token fallback still works)', () => {
    expect(mergePostgrestSearchRows([], tokens, 2).map((row) => row.id)).toEqual(['p2', 't1']);
  });
});
