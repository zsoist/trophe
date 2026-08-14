import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('food extraction brand fidelity', () => {
  const prompt = readFileSync(
    join(process.cwd(), 'agents/prompts/food-parse.v9.md'),
    'utf8',
  );

  it('forbids brands or products that the user did not literally name', () => {
    expect(prompt).toMatch(/never (?:add|infer|invent).{0,80}brand/i);
    expect(prompt).toMatch(/generic.{0,80}(?:remain|stay).{0,40}generic/i);
  });

  it.each([
    ['latte', 'Starbucks'],
    ['burger', 'Big Mac'],
    ['cola', 'Coca-Cola'],
    ['protein bar', 'Quest'],
  ])('keeps generic %s generic instead of introducing %s', (input, invented) => {
    expect(prompt).toContain(`"${input}" → food_name: "${input}"`);
    expect(prompt).toContain(`NOT "${invented}"`);
  });
});
