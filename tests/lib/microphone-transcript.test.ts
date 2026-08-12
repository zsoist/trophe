import { describe, expect, it } from 'vitest';
import { speechLanguageTag } from '@/lib/microphone/languages';
import { appendTranscript, normalizeTranscript } from '@/lib/microphone/transcript';

describe('microphone transcript normalization', () => {
  it('collapses browser whitespace without changing spoken words', () => {
    expect(normalizeTranscript('  two   eggs\n and toast  ')).toBe('two eggs and toast');
  });

  it('appends speech to an existing answer without erasing typed text', () => {
    expect(appendTranscript('I sleep poorly', '  after   late training '))
      .toBe('I sleep poorly after late training');
  });

  it('does not add spaces when either side is empty', () => {
    expect(appendTranscript('', ' two eggs ')).toBe('two eggs');
    expect(appendTranscript('already typed', '   ')).toBe('already typed');
  });
});

describe('microphone language mapping', () => {
  it.each([
    ['en', 'en-US'],
    ['es-CO', 'es-ES'],
    ['el', 'el-GR'],
    ['fr', 'fr-FR'],
    ['de', 'de-DE'],
    ['it', 'it-IT'],
    ['pt-BR', 'pt-PT'],
    ['nl', 'nl-NL'],
  ])('maps %s to a supported speech tag', (locale, expected) => {
    expect(speechLanguageTag(locale)).toBe(expected);
  });

  it('uses English for an unknown locale', () => {
    expect(speechLanguageTag('xx')).toBe('en-US');
  });
});
