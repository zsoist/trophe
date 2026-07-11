import { describe, expect, it } from 'vitest';
import { diffHasUnjustifiedScoringChange } from '../../scripts/ci/check-golden-tolerance-justification.mjs';

describe('golden tolerance justification guard', () => {
  it('goes red for a silent tolerance widening', () => {
    const diff = [
      '-      "max": 250',
      '+      "max": 350',
    ].join('\n');
    expect(diffHasUnjustifiedScoringChange(diff)).toBe(true);
  });

  it('goes red for a silent case-level criteria relaxation', () => {
    const diff = [
      '-    "expectedFallbackToAI": false',
      '+    "expectedFallbackToAI": true',
    ].join('\n');
    expect(diffHasUnjustifiedScoringChange(diff)).toBe(true);
  });

  it('stays green when the same diff adds a justification', () => {
    const diff = [
      '-      "max": 250',
      '+      "max": 350',
      '+      "tolerance_justification": "Reviewed portion variance from production traces"',
    ].join('\n');
    expect(diffHasUnjustifiedScoringChange(diff)).toBe(false);
  });

  it('ignores input copy changes that do not alter scoring', () => {
    expect(diffHasUnjustifiedScoringChange('-  "input": "old"\n+  "input": "new"')).toBe(false);
  });

  it('rejects an empty justification', () => {
    const diff = [
      '-      "max": 250',
      '+      "max": 350',
      '+      "tolerance_justification": ""',
    ].join('\n');
    expect(diffHasUnjustifiedScoringChange(diff)).toBe(true);
  });

  it('requires a justification in every scoring hunk', () => {
    const diff = [
      '@@ -10,2 +10,3 @@',
      '-  "max": 250',
      '+  "max": 350',
      '+  "tolerance_justification": "Production trace variance"',
      '@@ -90,1 +91,1 @@',
      '-  "expectedFallbackToAI": false',
      '+  "expectedFallbackToAI": true',
    ].join('\n');
    expect(diffHasUnjustifiedScoringChange(diff)).toBe(true);
  });
});
