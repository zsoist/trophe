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
  allergy: 'bg-red-900/30 text-red-300 border-red-800',
  goal: 'bg-blue-900/30 text-blue-300 border-blue-800',
  preference: 'bg-purple-900/30 text-purple-300 border-purple-800',
  event: 'bg-yellow-900/30 text-yellow-300 border-yellow-800',
  observation: 'bg-gray-800/50 text-gray-400 border-gray-700',
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#D4A853] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href={`/coach/client/${clientId}`} className="text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="font-semibold text-white">AI Memory</h1>
            <p className="text-xs text-gray-500">Facts extracted from conversations</p>
          </div>
          <button
            onClick={() => void loadData()}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Tab selector */}
        <div className="flex gap-1 mb-6 bg-gray-900 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('blocks')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'blocks'
                ? 'bg-[#D4A853] text-gray-950'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Coach Blocks ({blocks.length})
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'memory'
                ? 'bg-[#D4A853] text-gray-950'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            AI Memory ({chunks.length})
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ── Coach Blocks Tab ─────────────────────────────────────── */}
        {activeTab === 'blocks' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              These blocks are injected into the AI system prompt for every interaction with this client. Keep them accurate.
            </p>

            {STANDARD_BLOCKS.map((def) => {
              const existing = blocks.find((b) => b.block_label === def.label);
              const isEditing = editingLabel === def.label;

              return (
                <div
                  key={def.label}
                  className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden"
                >
                  {/* Block header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
                    <span className="font-medium text-sm text-white flex-1">{def.displayName}</span>
                    {existing && (
                      <span className="text-xs text-gray-600">v{existing.version}</span>
                    )}
                    {existing && (
                      <button
                        onClick={() => void toggleVisibility(existing)}
                        className={`p-1.5 rounded transition-colors ${
                          existing.visible_to_client
                            ? 'text-[#D4A853] hover:text-yellow-400'
                            : 'text-gray-600 hover:text-gray-400'
                        }`}
                        title={existing.visible_to_client ? 'Visible to client' : 'Hidden from client'}
                      >
                        {existing.visible_to_client ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(existing ?? { block_label: def.label, content: '' })}
                        className="p-1.5 text-gray-600 hover:text-white rounded transition-colors"
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
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-[#D4A853]"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                        >
                          <X size={14} /> Cancel
                        </button>
                        <button
                          onClick={() => void saveBlock(def.label)}
                          disabled={saving}
                          className="px-3 py-1.5 text-sm bg-[#D4A853] text-gray-950 font-medium rounded-lg hover:bg-yellow-400 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Save size={14} />
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      {existing?.content ? (
                        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{existing.content}</p>
                      ) : (
                        <button
                          onClick={() => startEdit({ block_label: def.label, content: '' })}
                          className="text-sm text-gray-600 hover:text-gray-400 flex items-center gap-1.5 py-1 transition-colors"
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
            <p className="text-sm text-gray-500">
              Facts automatically extracted from your client&apos;s conversations. Review and remove inaccurate ones.
            </p>

            {chunks.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
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
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                      {FACT_TYPE_LABELS[type]} ({typeChunks.length})
                    </h3>
                    {typeChunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border ${FACT_TYPE_COLORS[chunk.fact_type] ?? 'bg-gray-900 border-gray-800'}`}
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
                          className="p-1.5 opacity-40 hover:opacity-100 transition-opacity rounded"
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
    </div>
  );
}
