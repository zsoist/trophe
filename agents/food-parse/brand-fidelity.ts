interface BrandRewrite {
  candidate: RegExp;
  intent: RegExp;
  replacement: string;
}

/**
 * Plural-tolerant brand patterns. A countable brand/product named by the user
 * may arrive in the plural ("dos Big Macs", "two Whoppers", "two cokes"), and
 * the model may echo the plural form back. A singular-only `\b` boundary after
 * the brand token fails on the plural (there is no word boundary between "mac"
 * and "s"), so the intent guard never fired and an explicitly named brand was
 * stripped as if the model had invented it. `s?` covers ES/EN singular+plural
 * without matching a longer unrelated token (the trailing `\b` still holds).
 */
const BRAND_REWRITES: BrandRewrite[] = [
  { candidate: /\bbig\s+macs?\b/gi, intent: /\bbig\s+macs?\b/i, replacement: 'burger' },
  { candidate: /\bwhoppers?\b/gi, intent: /\bwhoppers?\b/i, replacement: 'burger' },
  { candidate: /\bcoca[\s-]*colas?\b|\bcokes?\b/gi, intent: /\bcoca[\s-]*colas?\b|\bcokes?\b/i, replacement: 'cola' },
  { candidate: /\bpepsis?\b/gi, intent: /\bpepsis?\b/i, replacement: 'cola' },
  { candidate: /\bred\s+bulls?\b/gi, intent: /\bred\s+bulls?\b/i, replacement: '' },
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
