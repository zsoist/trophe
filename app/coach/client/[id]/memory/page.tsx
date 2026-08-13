'use client';

/**
 * Trophē v0.3 — Coach Memory Page (Phase 5).
 *
 * Shows the coach:
 *   1. All active memory_chunks for this client (AI-extracted facts).
 *   2. Coach blocks (Letta-style editable named text blocks).
 *
 * Coach can:
 *   - View and delete memory chunks (individual facts the AI has learned).
 *   - Edit coach blocks (structured notes that get injected into the AI system prompt).
 *   - Toggle block visibility to client.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Eye, EyeOff, Plus, Save, X, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

interface MemoryChunk {
  id: string;
  fact_text: string;
  fact_type: 'preference' | 'allergy' | 'goal' | 'event' | 'observation';
  scope: 'user' | 'session' | 'agent';
  confidence: number;
  salience: number;
  source: string;
  created_at: string;
  last_retrieved_at: string | null;
  retrieval_count: number;
  expires_at: string | null;
}

interface CoachBlock {
  id: string;
  block_label: string;
  content: string;
  version: number;
  visible_to_client: boolean;
  updated_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STANDARD_BLOCKS = [
  { label: 'persona', displayName: 'Client Profile', placeholder: 'Who this client is — age, background, motivations, lifestyle context...' },
  { label: 'current_protocol', displayName: 'Current Protocol', placeholder: 'Active nutrition and training protocol — current macros, meal timing, training split...' },
  { label: 'flags', displayName: 'Important Flags', placeholder: 'Medical conditions, allergies, red flags, motivational triggers, sensitivities...' },
  { label: 'nutrition_notes', displayName: 'Nutrition Notes', placeholder: 'Specific nutrition guidance — foods to emphasize, foods to avoid, supplementation...' },
  { label: 'workout_notes', displayName: 'Workout Context', placeholder: 'Training history, current phase, injuries, PRs, weekly volume...' },
];

const FACT_TYPE_COLORS: Record<string, string> = {
  allergy: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-[var(--status-danger-border)]',
  goal: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]',
  preference: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]',
  event: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]',
  observation: 'bg-[var(--surface-hover)] text-[var(--content-muted)] border-[var(--border-subtle)]',
};

const FACT_TYPE_LABELS: Record<string, string> = {
  allergy: 'Allergy',
  goal: 'Goal',
  preference: 'Preference',
  event: 'Event',
  observation: 'Note',
};

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ClientMemoryPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [chunks, setChunks] = useState<MemoryChunk[]>([]);
  const [blocks, setBlocks] = useState<CoachBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'memory' | 'blocks'>('blocks');

  // Block editing state
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [chunksRes, blocksRes] = await Promise.all([
        supabase
          .from('memory_chunks')
          .select('*')
          .eq('user_id', clientId)
          .eq('active', true)
          .order('salience', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('coach_blocks')
          .select('*')
          .eq('client_id', clientId)
          .eq('active', true)
          .order('block_label'),
      ]);

      if (chunksRes.error) throw chunksRes.error;
      if (blocksRes.error) throw blocksRes.error;

      setChunks(chunksRes.data as MemoryChunk[]);
      setBlocks(blocksRes.data as CoachBlock[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Memory chunk actions ─────────────────────────────────────────────

  const deleteChunk = async (chunkId: string) => {
    const { error } = await supabase
      .from('memory_chunks')
      .update({ active: false })
      .eq('id', chunkId);
    if (!error) {
      setChunks((prev) => prev.filter((c) => c.id !== chunkId));
    }
  };

  // ── Coach block actions ──────────────────────────────────────────────

  const startEdit = (block: CoachBlock | { block_label: string; content: string }) => {
    setEditingLabel(block.block_label);
    setEditDraft(block.content);
  };

  const cancelEdit = () => {
    setEditingLabel(null);
    setEditDraft('');
  };

  const saveBlock = async (label: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const existing = blocks.find((b) => b.block_label === label);

      if (existing) {
        const { data, error } = await supabase
          .from('coach_blocks')
          .update({
            content: editDraft,
            version: existing.version + 1,
            edited_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        if (error) throw error;
        setBlocks((prev) => prev.map((b) => (b.id === existing.id ? (data as CoachBlock) : b)));
      } else {
        const { data, error } = await supabase
          .from('coach_blocks')
          .insert({
            client_id: clientId,
            coach_id: user.id,
            block_label: label,
            content: editDraft,
            version: 1,
            edited_by: user.id,
            active: true,
            visible_to_client: false,
          })
          .select()
          .maybeSingle();
        if (error) throw error;
        setBlocks((prev) => [...prev, data as CoachBlock]);
      }

      setEditingLabel(null);
      setEditDraft('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (block: CoachBlock) => {
    const { data, error } = await supabase
      .from('coach_blocks')
      .update({ visible_to_client: !block.visible_to_client })
      .eq('id', block.id)
      .select()
      .maybeSingle();
    if (!error && data) {
      setBlocks((prev) => prev.map((b) => (b.id === block.id ? (data as CoachBlock) : b)));
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#D4A853] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--content-primary)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--canvas)]/90 backdrop-blur border-b border-[var(--border-strong)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href={`/coach/client/${clientId}`}
            aria-label="Back to client workspace"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-[var(--content-muted)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold text-[var(--content-primary)]">AI Memory</h1>
            <p className="text-xs text-[var(--content-muted)]">Facts extracted from conversations</p>
          </div>
          <button
            data-coach-primary-action
            data-icon-only
            onClick={() => void loadData()}
            className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 min-w-11 p-2 text-[var(--content-muted)] hover:text-[var(--content-primary)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div data-coach-mobile-workspace className="max-w-2xl mx-auto grid grid-cols-1 px-4 py-6">
        {/* Tab selector */}
        <div className="flex gap-1 mb-6 glass p-1">
          <button
            onClick={() => setActiveTab('blocks')}
            className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'blocks'
                ? 'bg-[var(--action-primary)] text-[var(--action-on-primary)]'
                : 'text-[var(--content-muted)] hover:text-[var(--content-primary)]'
            }`}
          >
            Coach Blocks ({blocks.length})
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'memory'
                ? 'bg-[var(--action-primary)] text-[var(--action-on-primary)]'
                : 'text-[var(--content-muted)] hover:text-[var(--content-primary)]'
            }`}
          >
            AI Memory ({chunks.length})
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]">
            {error}
          </div>
        )}

        {/* ── Coach Blocks Tab ─────────────────────────────────────── */}
        {activeTab === 'blocks' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--content-muted)]">
              These blocks are injected into the AI system prompt for every interaction with this client. Keep them accurate.
            </p>

            {STANDARD_BLOCKS.map((def) => {
              const existing = blocks.find((b) => b.block_label === def.label);
              const isEditing = editingLabel === def.label;

              return (
                <div
                  key={def.label}
                  className="glass overflow-hidden"
                >
                  {/* Block header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-strong)]">
                    <span className="font-medium text-sm text-[var(--content-primary)] flex-1">{def.displayName}</span>
                    {existing && (
                      <span className="text-xs text-[var(--content-disabled)]">v{existing.version}</span>
                    )}
                    {existing && (
                      <button
                        onClick={() => void toggleVisibility(existing)}
                        className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 rounded transition-colors ${
                          existing.visible_to_client
                            ? 'text-[#D4A853] hover:text-[var(--gold-200,#E8C078)]'
                            : 'text-[var(--content-disabled)] hover:text-[var(--content-muted)]'
                        }`}
                        title={existing.visible_to_client ? 'Visible to client' : 'Hidden from client'}
                      >
                        {existing.visible_to_client ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        aria-label={`Edit ${def.displayName}`}
                        onClick={() => startEdit(existing ?? { block_label: def.label, content: '' })}
                        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] min-h-11 min-w-11 p-1.5 text-[var(--content-disabled)] hover:text-[var(--content-primary)] rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>

                  {/* Block content */}
                  {isEditing ? (
                    <div className="p-4 space-y-3">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        placeholder={def.placeholder}
                        rows={6}
                        className="input-dark text-base w-full resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={cancelEdit}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] px-3 py-1.5 text-sm text-[var(--content-muted)] hover:text-[var(--content-primary)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors flex items-center gap-1.5"
                        >
                          <X size={14} /> Cancel
                        </button>
                        <button
                          onClick={() => void saveBlock(def.label)}
                          disabled={saving}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] px-3 py-1.5 text-sm bg-[var(--action-primary)] text-[var(--action-on-primary)] font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Save size={14} />
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      {existing?.content ? (
                        <p className="text-sm text-[var(--content-secondary)] whitespace-pre-wrap leading-relaxed">{existing.content}</p>
                      ) : (
                        <button
                          onClick={() => startEdit({ block_label: def.label, content: '' })}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-sm text-[var(--content-disabled)] hover:text-[var(--content-muted)] flex items-center gap-1.5 py-1 transition-colors"
                        >
                          <Plus size={14} /> Add {def.displayName.toLowerCase()}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── AI Memory Tab ────────────────────────────────────────── */}
        {activeTab === 'memory' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--content-muted)]">
              Facts automatically extracted from your client&apos;s conversations. Review and remove inaccurate ones.
            </p>

            {chunks.length === 0 ? (
              <div className="text-center py-12 text-[var(--content-disabled)]">
                <p className="text-sm">No memory facts yet.</p>
                <p className="text-xs mt-1">Facts are extracted automatically as your client chats with the AI.</p>
              </div>
            ) : (
              // Group by fact_type: allergies first
              (['allergy', 'goal', 'preference', 'observation', 'event'] as const).map((type) => {
                const typeChunks = chunks.filter((c) => c.fact_type === type);
                if (typeChunks.length === 0) return null;

                return (
                  <div key={type} className="space-y-2">
                    <h3 className="text-xs font-semibold text-[var(--content-muted)] uppercase tracking-wider px-1">
                      {FACT_TYPE_LABELS[type]} ({typeChunks.length})
                    </h3>
                    {typeChunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border ${FACT_TYPE_COLORS[chunk.fact_type] ?? 'bg-[var(--surface-hover)] border-[var(--border-subtle)]'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-relaxed">{chunk.fact_text}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs opacity-60">
                            <span>{Math.round(chunk.confidence * 100)}% confidence</span>
                            <span>{chunk.scope} scope</span>
                            {chunk.retrieval_count > 0 && (
                              <span>used {chunk.retrieval_count}×</span>
                            )}
                            {chunk.expires_at && (
                              <span>expires {new Date(chunk.expires_at).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => void deleteChunk(chunk.id)}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 opacity-40 hover:opacity-100 transition-opacity rounded"
                          title="Remove this memory"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      <span data-coach-mobile-workspace-end className="sr-only" />
    </div>
  );
}
