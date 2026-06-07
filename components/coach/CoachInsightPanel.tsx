'use client';

import { useState } from 'react';
import { Bot, BookOpen, LoaderCircle, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Citation {
  chunkId: string;
  documentId: string;
  source: string;
  createdAt: string;
}

interface InsightResponse {
  insight?: string;
  generationId?: string;
  citations?: Citation[];
  error?: string;
}

export default function CoachInsightPanel({ clientId }: { clientId: string }) {
  const [question, setQuestion] = useState('');
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateInsight() {
    const prompt = question.trim();
    if (!prompt || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your session expired. Sign in again.');
      const response = await fetch('/api/ai/coach-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId, question: prompt }),
      });
      const body = await response.json() as InsightResponse;
      if (!response.ok || !body.insight) throw new Error(body.error ?? 'Unable to generate insight');
      setInsight(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to generate insight');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white/[0.04] border border-[#D4A853]/20 rounded-xl p-4" aria-labelledby="coach-insight-title">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-[#D4A853]/10 text-[#D4A853]"><Bot size={18} /></div>
        <div className="flex-1">
          <h2 id="coach-insight-title" className="text-stone-100 text-sm font-semibold">Trophe Coach Insight</h2>
          <p className="text-stone-500 text-xs mt-0.5">Grounded in approved coach blocks, client memory, and permission-aware knowledge.</p>
        </div>
        <ShieldCheck size={16} className="text-emerald-400" aria-label="Permission-aware" />
      </div>

      <label htmlFor="coach-insight-question" className="sr-only">Question about this client</label>
      <div className="flex gap-2">
        <textarea
          id="coach-insight-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about patterns, adherence, risks, or the next coaching action..."
          rows={3}
          maxLength={8_000}
          className="flex-1 resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-[#D4A853]/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void generateInsight()}
          disabled={!question.trim() || loading}
          className="self-end rounded-lg bg-[#D4A853] p-2.5 text-stone-950 transition-colors hover:bg-[#e2bb6d] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Generate coach insight"
        >
          {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</p>}

      {insight?.insight && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-300">{insight.insight}</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 text-[11px] text-stone-500">
            <BookOpen size={13} />
            {insight.citations?.length
              ? insight.citations.map((citation) => (
                <span key={citation.chunkId} title={`${citation.documentId} · ${new Date(citation.createdAt).toLocaleString()}`} className="rounded-full bg-white/5 px-2 py-1">
                  {citation.source}
                </span>
              ))
              : <span>No knowledge citations were needed for this response.</span>}
            {insight.generationId && <span className="ml-auto font-mono">run {insight.generationId.slice(0, 8)}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
