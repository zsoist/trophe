import { describe, expect, it } from 'vitest';
import { collectEvidence } from './tools';
import { fixtureRepository } from './fixtures';

const request = { message: 'How was today?', intent: 'today' as const };
const options = { actorId: 'synthetic-client', now: new Date('2026-09-07T03:30:00Z'), signal: new AbortController().signal };

describe('bounded evidence tools', () => {
  it('computes nutrition and actual workout totals from authorized integration rows', async () => {
    const result = await collectEvidence(request, { ...options, repository: fixtureRepository() });
    expect(result.facts.find(f => f.id === 'nutrition.calories')?.value).toBe(1000);
    expect(result.facts.find(f => f.id === 'nutrition.protein')?.value).toBe(75);
    expect(result.facts.find(f => f.id === 'workout.volume')?.value).toBe(720);
    expect(result.facts.find(f => f.id === 'workout.completedSessions')?.value).toBe(1);
    expect(result.facts.find(f => f.id === 'plan.sets')?.value).toBe(3);
    expect(result.reads).toBeLessThanOrEqual(4);
    expect(result.facts.find(f => f.id === 'plan.reps')?.value).toBe(30);
    expect(result.facts.find(f => f.id === 'comparison.remainingReps')?.value).toBe(12);
    expect(result.facts.find(f => f.id === 'comparison.recordedSetRatio')?.value).toBe(66.67);
    expect(result.facts.find(f => f.id === 'workout.weight.lb.0')?.value).toBe(88.18);
  });
  it('does not treat missing nutrition as zero or missing logs as nonadherence', async () => {
    const repo = fixtureRepository({ nutrition: [] });
    const result = await collectEvidence(request, { ...options, repository: repo });
    expect(result.facts.some(f => f.id === 'nutrition.calories')).toBe(false);
    expect(result.limitations).toContain('no_nutrition_records');
  });
  it('denies access revoked between authorization and a data read', async () => {
    const repo = fixtureRepository({ revokeAfterAuthorizations: 1 });
    await expect(collectEvidence(request, { ...options, repository: repo })).rejects.toThrow('forbidden');
    expect(repo.readCount()).toBe(0);
  });
  it('propagates cancellation and query errors without demo fallback', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(collectEvidence(request, { ...options, signal: controller.signal, repository: fixtureRepository() })).rejects.toThrow();
    const repo = fixtureRepository(); repo.nutrition = async () => { throw new Error('query_failed'); };
    await expect(collectEvidence(request, { ...options, repository: repo })).rejects.toThrow('query_failed');
  });
  it('denies revocation during the read before returning its content', async () => {
    const repo = fixtureRepository({ revokeAfterAuthorizations: 2 });
    await expect(collectEvidence(request, { ...options, repository: repo })).rejects.toThrow('forbidden');
  });
  it('rejects conflicting duplicate IDs instead of selecting an arbitrary value', async () => {
    const row={id:'duplicate',userId:'synthetic-client',date:'2026-09-06',calories:100,proteinG:10};
    const repo=fixtureRepository({nutrition:[row,{...row,calories:999}]});
    await expect(collectEvidence(request,{...options,repository:repo})).rejects.toThrow('query_failed');
  });
});
