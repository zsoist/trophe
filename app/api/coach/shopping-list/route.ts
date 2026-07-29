export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require-role';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { canAccessClient } from '@/lib/auth/tenant-access';
import { db } from '@/db/client';
import { executeAiTask } from '@/agents/runtime';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import {
  shoppingExtractValidator,
  shoppingExtractJsonSchema,
  type ShoppingExtractOutput,
} from '@/agents/schemas/shopping-extract';
import { aggregateIngredients, groupByCategory } from '@/lib/food/shopping-list';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';

/**
 * Generate a shopping list from a client's weekly meal plan (Daily Nutrafit
 * "Shopping Lists" feature). Reads meal_plan_entries → DeepSeek extracts grocery
 * line-items → aggregateIngredients() consolidates them.
 *
 * POST { clientId } → { items, byCategory, mealCount }
 */
const bodySchema = z.object({ clientId: z.string().uuid() }).strict();
const MAX_WEEKLY_MEAL_CELLS = 35;

const SYSTEM_PROMPT = `You are a meal-prep assistant. You are given a week of meal-plan entries written as free text (possibly Greek, Spanish, or other languages). Extract every distinct grocery ingredient as a FLAT list of line items — one entry per ingredient occurrence. Do NOT merge duplicates; that happens downstream. For each item: a canonical lowercase singular name, a numeric quantity (0 if unspecified), a unit (g, ml, piece, cup, tbsp, slice, or empty string), and a store category (produce, protein, dairy, grains, pantry, frozen, bakery, other). Skip pure seasonings "to taste", water, and cooking verbs.`;

export async function POST(request: NextRequest) {
  const guard = await requireRole(['coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'clientId (uuid) is required' }, { status: 400 });
  }
  const { clientId } = parsed.data;
  const userId = guard.session.user.id;

  // Authorize: coaches → own clients, admins → own-org clients only. (Was a
  // blanket admin bypass = cross-tenant IDOR leaking meal plans + LLM cost.)
  if (!(await canAccessClient(db, userId, guard.session.role, clientId))) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 });
  }

  const rate = await consumeRateLimit(`shopping-list:${userId}`, 5, 600);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many shopping-list requests — please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  const service = createSupabaseServiceClient();

  // Read the week's meal cells and keep only distinct, non-empty descriptions
  // (a breakfast repeated 7× should cost one line in the prompt, not seven).
  const { data, error: mealPlanError } = await service
    .from('meal_plan_entries')
    .select('description')
    .eq('client_id', clientId)
    .limit(MAX_WEEKLY_MEAL_CELLS + 1);

  if (mealPlanError) {
    console.error('[shopping-list] meal plan read failed', safeErrorMetadata(mealPlanError));
    return NextResponse.json(
      { error: 'Could not read the meal plan — please try again.' },
      { status: 503 },
    );
  }

  const rows = data ?? [];
  if (rows.length > MAX_WEEKLY_MEAL_CELLS) {
    return NextResponse.json(
      { error: 'Meal plan exceeds the weekly 35-meal limit' },
      { status: 422 },
    );
  }

  const uniqueMeals = Array.from(
    new Set(rows.map((r) => (r.description ?? '').trim()).filter(Boolean)),
  );

  if (uniqueMeals.length === 0) {
    return NextResponse.json({ items: [], byCategory: {}, mealCount: 0 });
  }

  const userMessage = `Meals this week:\n${uniqueMeals.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nExtract the grocery line items.`;

  try {
    const result = await executeAiTask<ShoppingExtractOutput>({
      task: 'shopping_extract',
      prompt: userMessage,
      systemPrompt: SYSTEM_PROMPT,
      context: { userId, requestId: request.headers.get('x-request-id') ?? undefined },
      invoke: ({ policy, signal }) => invokeStructuredProvider({
        policy,
        signal,
        system: SYSTEM_PROMPT,
        prompt: userMessage,
        schema: shoppingExtractJsonSchema as Record<string, unknown>,
        validator: shoppingExtractValidator,
        toolName: 'submit_shopping_list',
        toolDescription: 'Submit the flat list of grocery line items',
        strict: true,
      }),
    });

    const aggregated = aggregateIngredients(result.output.items);
    return NextResponse.json({
      items: aggregated,
      byCategory: groupByCategory(aggregated),
      mealCount: uniqueMeals.length,
    });
  } catch (error) {
    console.error('[shopping-list] generation failed', safeErrorMetadata(error));
    return NextResponse.json({ error: 'Could not generate shopping list' }, { status: 502 });
  }
}
