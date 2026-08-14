import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { taskFallbacks, taskPolicies } from '@/agents/router/policies';

describe('generic cooked steak nutrition contract', () => {
  const promptPath = join(process.cwd(), 'agents/prompts/food-parse.v9.md');

  it('routes both text providers through a versioned steak-safe prompt', () => {
    expect(taskPolicies.food_parse.promptVersion).toBe('food-parse-v9-luna');
    expect(taskFallbacks.food_parse?.promptVersion).toBe('food-parse-v9-haiku-fallback');
    expect(existsSync(promptPath)).toBe(true);
  });

  it('distinguishes cooked steak from ground beef and preserves useful portions', () => {
    expect(existsSync(promptPath)).toBe(true);
    const prompt = readFileSync(promptPath, 'utf8');

    expect(prompt).toMatch(/beef steak, (?:grilled|cooked).{0,40}\|\s*\d+\s*\|\s*(?:2[5-9]|3\d)(?:\.\d+)?/i);
    expect(prompt).toMatch(/never.{0,80}(?:steak).{0,80}(?:ground beef|17\.2)/i);
    expect(prompt).toMatch(/large\/big whole steak\s*=\s*200g/i);
    expect(prompt).toMatch(/explicit.{0,80}grams.{0,80}(?:preserve|exact)/i);
  });
});
