interface BrandRewrite {
  candidate: RegExp;
  intent: RegExp;
  replacement: string;
}

const BRAND_REWRITES: BrandRewrite[] = [
  { candidate: /\bbig\s+mac\b/gi, intent: /\bbig\s+mac\b/i, replacement: 'burger' },
  { candidate: /\bwhopper\b/gi, intent: /\bwhopper\b/i, replacement: 'burger' },
  { candidate: /\bcoca[\s-]*cola\b|\bcoke\b/gi, intent: /\bcoca[\s-]*cola\b|\bcoke\b/i, replacement: 'cola' },
  { candidate: /\bpepsi\b/gi, intent: /\bpepsi\b/i, replacement: 'cola' },
  { candidate: /\bred\s+bull\b/gi, intent: /\bred\s+bull\b/i, replacement: '' },
  { candidate: /\bstarbucks\b/gi, intent: /\bstarbucks\b/i, replacement: '' },
  { candidate: /\bmcdonald(?:'s|s)?\b/gi, intent: /\bmcdonald(?:'s|s)?\b/i, replacement: '' },
  { candidate: /\bburger\s+king\b/gi, intent: /\bburger\s+king\b/i, replacement: '' },
  { candidate: /\b(?:dunkin|subway|wendy'?s|chipotle|kfc|taco\s+bell)\b/gi, intent: /\b(?:dunkin|subway|wendy'?s|chipotle|kfc|taco\s+bell)\b/i, replacement: '' },
  { candidate: /\bquest\b/gi, intent: /\bquest\b/i, replacement: '' },
  { candidate: /\btropicana\b/gi, intent: /\btropicana\b/i, replacement: '' },
];

function tidyName(value: string): string {
  return value
    .replace(/^[\s,;:()\-–—]+|[\s,;:()\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function genericFallback(candidateName: string, userInput: string): string {
  if (/\bred\s+bull\b/i.test(candidateName)) return 'energy drink';
  if (/\bquest\b/i.test(candidateName)) return 'protein bar';
  if (/\btropicana\b/i.test(candidateName)) return 'juice';
  return tidyName(userInput) || 'food';
}

/** Deterministic guard against common model-invented branded identities. */
export function enforceLiteralBrandName(
  candidateName: string,
  userInput: string,
): { name: string; changed: boolean } {
  let name = candidateName;
  let changed = false;
  for (const rewrite of BRAND_REWRITES) {
    rewrite.candidate.lastIndex = 0;
    if (!rewrite.candidate.test(name) || rewrite.intent.test(userInput)) continue;
    rewrite.candidate.lastIndex = 0;
    name = name.replace(rewrite.candidate, rewrite.replacement);
    changed = true;
  }
  const tidied = tidyName(name);
  return { name: tidied || genericFallback(candidateName, userInput), changed };
}
