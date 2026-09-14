import { describe, expect, it } from 'vitest';
import { isAdviceOrQuestionUtterance, textFoodIntakeIntent } from './text-food-intent';
import { nutritionIntent } from './nutrition-intent';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import type { TextFoodResult } from './text-food-contract';

/**
 * FOOD-ADVICE-002 — voice transcripts omit punctuation.
 *
 * The earlier FOOD-ADVICE-001 fix stopped an advice/status question from being
 * captured as a new-meal intake, but only when the interrogative was
 * clause-initial ("... , how am I doing today?"). A question whose auxiliary
 * follows the food clause ("... a sugary soda is that bad") is still swallowed
 * by the past-tense ingestion branch, so the Ask turn prepared a meal review
 * and never answered from the profile/same-day context.
 */
const ADVICE_QUESTIONS = [
  'I drank a sugary soda is that bad',
  'I had chicken and rice was that a good choice',
  'I ate chicken am I on track',
  'I had pizza do I need to compensate',
  'I ate a lot today do I still need protein',
  'desayuné avena puedo comer más',
];

describe('unpunctuated advice/status questions after a food clause', () => {
  it.each(ADVICE_QUESTIONS)('is recognized as a question and keeps %s out of intake', text => {
    expect(isAdviceOrQuestionUtterance(text)).toBe(true);
    expect(textFoodIntakeIntent(text)).toBeNull();
    expect(nutritionIntent({ message: text })).not.toBe('log');
  });

  it.each(['I had a big breakfast two eggs and toast', 'I ate chicken and rice', 'Comí arroz con pollo', 'I drank a sugary soda'])(
    'still prepares a review for the plain consumption statement %s',
    text => expect(textFoodIntakeIntent(text)).toMatchObject({ text }),
  );

  it('answers the question from context instead of preparing a meal review', async () => {
    const repository = fixtureRepository();
    const authorize = repository.authorize;
    repository.authorize = async (...args) => ({ ...await authorize(...args), language: 'en' });
    const parsed: string[] = [];
    const resolveTextFoodIntake = async (input: { message: string }): Promise<TextFoodResult | null> => {
      if (!textFoodIntakeIntent(input.message)) return null;
      parsed.push(input.message);
      return { ok: false as const, error: 'not_connected' as const };
    };
    const result = await runConversation(
      { version: 'coach-assistant.v2', conversationId: '00000000-0000-4000-8000-000000000001', turnId: '00000000-0000-4000-8000-000000000002', message: 'I had pizza do I need to compensate' },
      { actorId: 'synthetic-client', repository, now: new Date('2026-09-12T22:00:00Z'), signal: new AbortController().signal, mode: 'offline', resolveTextFoodIntake },
    );
    expect(parsed).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.textFood).toBeUndefined();
    expect(result.output?.answer).toContain('Offline record summary');
    expect(result.output?.answer).not.toContain('Review the foods');
  });
});
