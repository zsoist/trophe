import { NextRequest, NextResponse } from 'next/server';
import { FOOD_DATABASE, buildFoodReferencePrompt } from '@/lib/food-units';
import { logAPIUsage, calculateCost, extractAnthropicUsage } from '@/lib/api-cost-logger';
import { guardAiRoute } from '@/lib/api-guard';

export interface ParsedFoodItem {
  raw_text: string;
  food_name: string;
  name_localized: string;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  confidence: number;
  source: 'local_db' | 'ai_estimate';
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function buildSystemPrompt(): string {
  const foodRef = buildFoodReferencePrompt();

  return `You are a food parsing assistant for a Greek nutrition coaching app. Parse the user's free-form text describing what they ate into structured food items.

RULES:
1. Extract EACH food item separately with quantity, unit, and estimated grams
2. Support input in English, Spanish, and Greek (including Latin-script Greek like "avga" for αυγά)
3. Use the food reference database below for accurate macros per 100g
4. Calculate total macros based on the estimated grams: macros = (grams / 100) * per_100g_value
5. If a food isn't in the database, estimate macros from your knowledge (set source to "ai_estimate")
6. If a food IS in the database, use those exact values (set source to "local_db")
7. Common implicit quantities: "toast" = 1 serving, "coffee" = 1 cup, "salad" = 1 serving
8. Greek abbreviations: κ.σ.=tablespoon(15g), κ.γ.=teaspoon(5g-7g), φλ=cup(~100g cooked), φέτα=slice

IMPORTANT CONTEXT — Kavdas Nutrition Plan units:
- "1 φλ (100γρ) ρύζι/κινόα" = 1 cup (100g) cooked rice/quinoa
- "1 παλάμη" = palm-sized portion (~120g meat)
- "1 γροθιά" = fistful (~75g potatoes)
- "1 χούφτα ξ. καρπούς" = handful (~30g) nuts
- "½ scoop πρωτεΐνης" = half scoop protein powder (~15g)
- All quantities refer to COOKED food (per Kavdas instructions)

${foodRef}

CRITICAL ACCURACY RULES:
- Eggs: 1 large whole egg = 72 cal, 6.3g protein, 0.4g carbs, 5g fat. NEVER estimate higher.
- Chicken breast (cooked, no skin): per 100g = 165 cal, 31g protein, 0g carbs, 3.6g fat
- Rice (cooked, white): per 100g = 130 cal, 2.7g protein, 28g carbs, 0.3g fat
- Greek yogurt (2%): per 100g = 73 cal, 10g protein, 4g carbs, 2g fat
- Beef patty (grilled, lean): per 100g = 250 cal, 26g protein, 0g carbs, 15g fat
- Always calculate: calories = (protein * 4) + (carbs * 4) + (fat * 9). If the math doesn't add up, adjust.
- When user says "2 eggs", calculate exactly: 2 * 72 = 144 cal, 2 * 6.3 = 12.6g protein
- Include sugar_g in the output for each item (estimate from carb type: fruit ~10g sugar per 100g, rice ~0g, bread ~3g, desserts ~15-25g per serving)

Return ONLY valid JSON in this format:
{
  "items": [
    {
      "raw_text": "the original text fragment for this item",
      "food_name": "English canonical name",
      "name_localized": "name in user's language",
      "quantity": 3,
      "unit": "piece",
      "grams": 150,
      "calories": 215,
      "protein_g": 18.9,
      "carbs_g": 1.1,
      "fat_g": 14.3,
      "fiber_g": 0,
      "sugar_g": 0.5,
      "confidence": 0.95,
      "source": "local_db"
    }
  ]
}

Round all macros to 1 decimal place. Confidence: 0.9+ for exact DB matches, 0.7-0.9 for close matches, <0.7 for estimates.`;
}

function extractJSON(text: string): { items: ParsedFoodItem[] } | null {
  const objectMatch = text.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (Array.isArray(parsed.items)) return parsed;
    } catch {
      // Try array extraction
    }
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return { items: parsed };
    } catch {
      // JSON parse failed
    }
  }

  return null;
}

// Try to match parsed items against local food database for verified macros
function enrichWithLocalDB(items: ParsedFoodItem[]): ParsedFoodItem[] {
  return items.map(item => {
    const nameLower = item.food_name.toLowerCase();

    const match = FOOD_DATABASE.find(f => {
      const names = [f.name_en, f.name_el, f.name_es].map(n => n.toLowerCase());
      return names.some(n =>
        n.includes(nameLower) || nameLower.includes(n.split(',')[0].trim())
      );
    });

    if (!match) return item;

    // Recalculate macros from our verified database
    const grams = item.grams;
    const factor = grams / 100;

    return {
      ...item,
      calories: Math.round(match.calories_per_100g * factor),
      protein_g: Math.round(match.protein_per_100g * factor * 10) / 10,
      carbs_g: Math.round(match.carbs_per_100g * factor * 10) / 10,
      fat_g: Math.round(match.fat_per_100g * factor * 10) / 10,
      fiber_g: Math.round(match.fiber_per_100g * factor * 10) / 10,
      sugar_g: item.sugar_g ?? 0,
      source: 'local_db' as const,
      confidence: Math.max(item.confidence, 0.9),
    };
  });
}

export async function POST(request: NextRequest) {
  const block = guardAiRoute(request);
  if (block) return block;

  try {
    const body = await request.json();
    const { text, language = 'en' } = body as { text?: string; language?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    // Sanitize: cap length, strip control chars to prevent prompt injection
    const MAX_INPUT_LENGTH = 500;
    const sanitizedText = text.trim()
      .slice(0, MAX_INPUT_LENGTH)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      );
    }

    const systemPrompt = buildSystemPrompt();

    const startTime = Date.now();
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Parse this food input (language: ${language}):\n\n"${sanitizedText}"`,
          },
        ],
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API error: ${response.status} ${errorText}`);
      logAPIUsage({ endpoint: '/api/food/parse', model: MODEL, provider: 'anthropic', tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: latencyMs, success: false, error_message: errorText.slice(0, 200) });
      return NextResponse.json(
        { error: 'Failed to parse food input' },
        { status: 502 },
      );
    }

    const data = await response.json();
    const { tokensIn, tokensOut } = extractAnthropicUsage(data);
    const cost = calculateCost(MODEL, tokensIn, tokensOut);
    logAPIUsage({ endpoint: '/api/food/parse', model: MODEL, provider: 'anthropic', tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost, latency_ms: latencyMs, success: true });

    const textContent = data?.content?.[0]?.text;

    if (!textContent) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 502 },
      );
    }

    const parsed = extractJSON(textContent);

    if (!parsed || parsed.items.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse food items from input' },
        { status: 422 },
      );
    }

    // Enrich with local DB for verified macros
    const enriched = enrichWithLocalDB(parsed.items);

    return NextResponse.json({ items: enriched });
  } catch (error) {
    console.error('Food parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse food input' },
      { status: 500 },
    );
  }
}
