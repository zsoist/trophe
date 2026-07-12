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

/**
 * Generate a shopping list from a client's weekly meal plan (Daily Nutrafit
 * "Shopping Lists" feature). Reads meal_plan_entries → DeepSeek extracts grocery
 * line-items through the governed provider policy, then aggregateIngredients()
 * consolidates them.
 *
 * POST { clientId } → { items, byCategory, mealCount }
 */
const bodySchema = z.object({ clientId: z.string().uuid() }).strict();

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

  const service = createSupabaseServiceClient();

  // Authorize: coaches → own clients, admins → own-org clients only. (Was a
  // blanket admin bypass = cross-tenant IDOR leaking meal plans + LLM cost.)
  if (!(await canAccessClient(db, userId, guard.session.role, clientId))) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 });
  }

  // Read the week's meal cells and keep only distinct, non-empty descriptions
  // (a breakfast repeated 7× should cost one line in the prompt, not seven).
  const { data: rows } = await service
    .from('meal_plan_entries')
    .select('description')
    .eq('client_id', clientId);

  const uniqueMeals = Array.from(
    new Set((rows ?? []).map((r) => (r.description ?? '').trim()).filter(Boolean)),
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
      invoke: ({ policy, signal, clientRequestId }) => invokeStructuredProvider({
        policy,
        signal,
        clientRequestId,
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
    console.error('Shopping-list generation error:', error);
    return NextResponse.json({ error: 'Could not generate shopping list' }, { status: 502 });
  }
}
