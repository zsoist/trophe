// API Cost Logger — tracks token usage and cost for Anthropic + Gemini calls
// Data stored in Supabase table: api_usage_log
// Admin dashboard at /admin/costs

import { supabase } from './supabase';

export interface APIUsageEntry {
  endpoint: string;
  model: string;
  provider: 'anthropic' | 'gemini';
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  user_id?: string;
  success: boolean;
  error_message?: string;
}

// Pricing per million tokens (as of April 2026)
const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
} as Record<string, { input: number; output: number }>;

export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PRICING[model] || { input: 1.0, output: 3.0 }; // fallback
  return (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000;
}

export async function logAPIUsage(entry: APIUsageEntry): Promise<void> {
  try {
    await supabase.from('api_usage_log').insert({
      endpoint: entry.endpoint,
      model: entry.model,
      provider: entry.provider,
      tokens_in: entry.tokens_in,
      tokens_out: entry.tokens_out,
      cost_usd: entry.cost_usd,
      latency_ms: entry.latency_ms,
      user_id: entry.user_id,
      success: entry.success,
      error_message: entry.error_message,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Don't let logging failures break the app
    console.error('Failed to log API usage');
  }
}

// Estimate tokens from text length (rough: 1 token ≈ 4 chars)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Estimate tokens from Anthropic response
export function extractAnthropicUsage(response: {
  usage?: { input_tokens?: number; output_tokens?: number };
}): { tokensIn: number; tokensOut: number } {
  return {
    tokensIn: response.usage?.input_tokens ?? 0,
    tokensOut: response.usage?.output_tokens ?? 0,
  };
}

// Summary queries for the admin dashboard
export async function getCostSummary(days: number = 30): Promise<{
  totalCost: number;
  totalCalls: number;
  byEndpoint: Record<string, { calls: number; cost: number }>;
  byDay: { date: string; cost: number; calls: number }[];
  avgCostPerCall: number;
  avgLatency: number;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const { data } = await supabase
    .from('api_usage_log')
    .select('*')
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: true });

  if (!data || data.length === 0) {
    return { totalCost: 0, totalCalls: 0, byEndpoint: {}, byDay: [], avgCostPerCall: 0, avgLatency: 0 };
  }

  const totalCost = data.reduce((s, d) => s + (d.cost_usd || 0), 0);
  const totalCalls = data.length;
  const avgLatency = data.reduce((s, d) => s + (d.latency_ms || 0), 0) / totalCalls;

  const byEndpoint: Record<string, { calls: number; cost: number }> = {};
  const byDayMap = new Map<string, { cost: number; calls: number }>();

  for (const entry of data) {
    // By endpoint
    if (!byEndpoint[entry.endpoint]) byEndpoint[entry.endpoint] = { calls: 0, cost: 0 };
    byEndpoint[entry.endpoint].calls++;
    byEndpoint[entry.endpoint].cost += entry.cost_usd || 0;

    // By day
    const day = entry.created_at.split('T')[0];
    if (!byDayMap.has(day)) byDayMap.set(day, { cost: 0, calls: 0 });
    const d = byDayMap.get(day)!;
    d.cost += entry.cost_usd || 0;
    d.calls++;
  }

  return {
    totalCost,
    totalCalls,
    byEndpoint,
    byDay: Array.from(byDayMap.entries()).map(([date, v]) => ({ date, ...v })),
    avgCostPerCall: totalCost / totalCalls,
    avgLatency,
  };
}
