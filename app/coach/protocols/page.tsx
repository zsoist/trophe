'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Plus,
  Trash2,
  X,
  Save,
  Pill,
  ChevronDown,
  ChevronUp,
  UserPlus,
  FlaskConical,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SupplementProtocol, SupplementItem, Profile, ClientProfile } from '@/lib/types';
import { CoachNav } from '@/components/coach/CoachNav';
import CoachLoadingSkeletons from '@/components/coach/CoachLoadingSkeletons';
import { useDialogFocus } from '@/components/shared/useDialogFocus';
import ProtocolTemplateLibrary from '@/components/coach/ProtocolTemplateLibrary';
import { BotNav } from '@/components/ui/BotNav';
import { Icon, ConfirmSheet } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

/* All four tabs point at real routes — matches app/coach/page.tsx
   (were /coach/clients + /coach/profile 404s) */
const COACH_NAV = [
  { href: '/coach',           label: 'Today',    icon: <Icon name="i-grid"     size={18} /> },
  { href: '/coach/inbox',     label: 'Inbox',    icon: <Icon name="i-message"  size={18} /> },
  { href: '/coach/calendar',  label: 'Calendar', icon: <Icon name="i-calendar" size={18} /> },
  { href: '/coach/templates', label: 'Workouts', icon: <Icon name="i-dumbbell" size={18} /> },
];

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

const timingOptions = ['morning', 'pre-workout', 'post-workout', 'evening', 'with-meals'];

const evidenceColors: Record<string, string> = {
  A: 'bg-green-500/15 text-green-400 border-green-500/20',
  B: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  C: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  D: 'bg-[var(--surface-2)]/30 text-[var(--content-secondary)] border-[var(--border-default)]/20',
};

const evidenceLabels: Record<string, string> = {
  A: 'Strong Evidence',
  B: 'Moderate Evidence',
  C: 'Limited Evidence',
  D: 'Theoretical',
};

const emptySupplement: SupplementItem = {
  name: '',
  dose: '',
  timing: 'morning',
  notes: '',
  evidence_level: 'B',
};

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function ProtocolsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [protocols, setProtocols] = useState<SupplementProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formGoal, setFormGoal] = useState('');
  const [formSupplements, setFormSupplements] = useState<SupplementItem[]>([{ ...emptySupplement }]);
  const [saving, setSaving] = useState(false);

  // Assign state
  const [assigningProtocolId, setAssigningProtocolId] = useState<string | null>(null);
  const [clients, setClients] = useState<(ClientProfile & { profile?: Profile })[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const formDialogRef = useRef<HTMLDivElement | null>(null);
  const assignDialogRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  useDialogFocus(showForm, () => setShowForm(false), formDialogRef);
  useDialogFocus(assigningProtocolId !== null, () => setAssigningProtocolId(null), assignDialogRef);

  const loadProtocols = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('supplement_protocols')
        .select('*')
        .order('created_at', { ascending: false });

      setProtocols(data || []);
    } catch (err) {
      console.error('Error loading protocols:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      // Role guard — only coaches can access
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (prof?.role === 'client') { router.push('/dashboard'); return; }
      loadProtocols();
    }
    checkAuth();
  }, [router, loadProtocols]);

  function resetForm() {
    setFormName('');
    setFormDesc('');
    setFormGoal('');
    setFormSupplements([{ ...emptySupplement }]);
  }

  function addSupplement() {
    setFormSupplements([...formSupplements, { ...emptySupplement }]);
  }

  function removeSupplement(index: number) {
    if (formSupplements.length <= 1) return;
    setFormSupplements(formSupplements.filter((_, i) => i !== index));
  }

  function updateSupplement(index: number, field: keyof SupplementItem, value: string) {
    const updated = [...formSupplements];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setFormSupplements(updated);
  }

  async function saveProtocol() {
    if (!formName.trim()) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const validSupplements = formSupplements.filter((s) => s.name.trim());

      const { data } = await supabase
        .from('supplement_protocols')
        .insert({
          coach_id: user.id,
          name: formName.trim(),
          description: formDesc.trim() || null,
          goal: formGoal.trim() || null,
          supplements: validSupplements,
        })
        .select()
        .maybeSingle();

      if (data) {
        setProtocols([data, ...protocols]);
        setShowForm(false);
        resetForm();
      }
    } catch (err) {
      console.error('Error saving protocol:', err);
    } finally {
      setSaving(false);
    }
  }

  function deleteProtocol(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDeleteProtocol() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await supabase.from('supplement_protocols').delete().eq('id', pendingDeleteId);
      setProtocols((prev) => prev.filter((p) => p.id !== pendingDeleteId));
    } catch (err) {
      console.error('Error deleting protocol:', err);
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  async function openAssign(protocolId: string) {
    setAssigningProtocolId(protocolId);
    setLoadingClients(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientProfiles } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('coach_id', user.id);

      if (clientProfiles) {
        const userIds = clientProfiles.map((cp: ClientProfile) => cp.user_id);
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);

        const merged = clientProfiles.map((cp: ClientProfile) => ({
          ...cp,
          profile: (profiles || []).find((p: Profile) => p.id === cp.user_id),
        }));
        setClients(merged);
      }
    } catch (err) {
      console.error('Error loading clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }

  async function assignToClient(clientUserId: string) {
    if (!assigningProtocolId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Deactivate any existing active protocol first
      await supabase.from('client_supplements')
        .update({ active: false })
        .eq('user_id', clientUserId)
        .eq('active', true);

      await supabase.from('client_supplements').insert({
        user_id: clientUserId,
        protocol_id: assigningProtocolId,
        assigned_by: user.id,
        active: true,
      });

      setAssigningProtocolId(null);
      toast.success('Protocol assigned successfully');
    } catch (err) {
      console.error('Error assigning protocol:', err);
    }
  }

  return (
    <div data-coach-mobile-workspace className="min-h-screen min-w-0 pb-20 px-4 py-6 sm:px-6 lg:px-8" style={{ background: 'var(--canvas)' }}>
      <div className="max-w-5xl mx-auto">
        <CoachNav active="/coach/protocols" />

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--content-primary)]">Supplement Protocols</h1>
              <p className="text-[var(--content-secondary)] text-sm mt-1">
                {protocols.length} protocol{protocols.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> New Protocol
            </button>
          </div>

          {/* Protocol Template Library */}
          <ProtocolTemplateLibrary
            onSelect={(protocol) => {
              setFormName(protocol.name);
              setFormSupplements(
                protocol.supplements.map((s) => ({
                  name: s.name,
                  dose: s.dose,
                  timing: s.timing,
                  notes: '',
                  evidence_level: protocol.evidenceLevel as 'A' | 'B' | 'C' | 'D',
                }))
              );
              setShowForm(true);
            }}
          />

          {/* Protocol List */}
          {loading ? (
            <CoachLoadingSkeletons page="protocols" />
          ) : protocols.length === 0 ? (
            <div className="text-center py-20">
              <FlaskConical size={48} className="mx-auto text-[var(--content-muted)] mb-4" />
              <p className="text-[var(--content-secondary)]">No protocols created yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {protocols.map((protocol, i) => {
                const isExpanded = expandedId === protocol.id;
                const supplements = protocol.supplements || [];

                return (
                  <motion.div
                    key={protocol.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="glass"
                  >
                    {/* Header row */}
                    <div
                      className="p-4 sm:p-5 flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : protocol.id)}
                    >
                      <Pill size={18} className="text-[var(--action-primary)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[var(--content-primary)]">{protocol.name}</h3>
                        {protocol.description && (
                          <p className="text-xs text-[var(--content-secondary)] mt-0.5 truncate">{protocol.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--content-secondary)]">
                          <span>{supplements.length} supplement{supplements.length !== 1 ? 's' : ''}</span>
                          {protocol.goal && <span>Goal: {protocol.goal}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); openAssign(protocol.id); }}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--content-secondary)] hover:text-[var(--action-primary)] transition-colors"
                          title="Assign to client"
                        >
                          <UserPlus size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteProtocol(protocol.id); }}
                          aria-label={`Delete ${protocol.name}`}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-2 rounded-lg hover:bg-red-500/10 text-[var(--content-secondary)] hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                        {isExpanded ? <ChevronUp size={16} className="text-[var(--content-secondary)]" /> : <ChevronDown size={16} className="text-[var(--content-secondary)]" />}
                      </div>
                    </div>

                    {/* Expanded supplement list */}
                    {isExpanded && supplements.length > 0 && (
                      <div className="px-4 sm:px-5 pb-4 border-t border-[var(--border-subtle)]">
                        <div className="mt-3 space-y-2">
                          {supplements.map((supp, si) => (
                            <div key={si} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-2)]">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[var(--content-primary)]">{supp.name}</span>
                                  {supp.evidence_level && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${evidenceColors[supp.evidence_level]}`}>
                                      {supp.evidence_level}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--content-secondary)]">
                                  <span>{supp.dose}</span>
                                  <span className="capitalize">{supp.timing}</span>
                                </div>
                                {supp.notes && (
                                  <p className="text-xs text-[var(--content-muted)] mt-1">{supp.notes}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Evidence legend */}
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                          {(['A', 'B', 'C', 'D'] as const).map((level) => (
                            <span key={level} className="text-xs text-[var(--content-muted)]">
                              <span className={`inline-block w-3 h-3 rounded text-center text-xs font-bold mr-0.5 ${evidenceColors[level]}`}>{level}</span>
                              {' '}{evidenceLabels[level]}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        <BotNav routes={COACH_NAV} />

        <ConfirmSheet
          open={pendingDeleteId !== null}
          title={t('confirm.delete_protocol_title')}
          message={t('confirm.delete_protocol_msg')}
          confirmLabel={t('confirm.delete')}
          danger
          loading={deleting}
          onConfirm={confirmDeleteProtocol}
          onCancel={() => setPendingDeleteId(null)}
        />

        {/* ─── Create Protocol Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4">
            <motion.div
              ref={formDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="protocol-dialog-title"
              initial={reducedMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated safe-bottom p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 id="protocol-dialog-title" className="font-semibold text-[var(--content-primary)] text-lg">New Protocol</h3>
                <button onClick={() => setShowForm(false)} aria-label="Close protocol editor" className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs text-[var(--content-secondary)] mb-1 block">Protocol Name *</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Muscle Recovery Stack"
                    className="text-base input-dark"
                  />
                </div>

                {/* Description + Goal */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Description</label>
                    <input
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Brief description"
                      className="text-base input-dark"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--content-secondary)] mb-1 block">Goal</label>
                    <input
                      value={formGoal}
                      onChange={(e) => setFormGoal(e.target.value)}
                      placeholder="e.g. Recovery"
                      className="text-base input-dark"
                    />
                  </div>
                </div>

                {/* Supplements */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[var(--content-secondary)]">Supplements</label>
                    <button
                      onClick={addSupplement}
                      className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-xs text-[var(--action-primary)] hover:text-[var(--action-primary-hover)] flex items-center gap-1 transition-colors"
                    >
                      <Plus size={12} /> Add Row
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formSupplements.map((supp, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[var(--surface-2)] space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={supp.name}
                            onChange={(e) => updateSupplement(idx, 'name', e.target.value)}
                            placeholder="Supplement name"
                            className="input-dark flex-1 !py-2 text-base"
                          />
                          {formSupplements.length > 1 && (
                            <button
                              onClick={() => removeSupplement(idx)}
                              aria-label={`Remove supplement ${idx + 1}`}
                              className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] p-1.5 text-[var(--content-muted)] hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            value={supp.dose}
                            onChange={(e) => updateSupplement(idx, 'dose', e.target.value)}
                            placeholder="Dose (e.g. 5g)"
                            className="input-dark !py-2 text-base"
                          />
                          <select
                            value={supp.timing}
                            onChange={(e) => updateSupplement(idx, 'timing', e.target.value)}
                            className="input-dark !py-2 text-base capitalize"
                          >
                            {timingOptions.map((t) => (
                              <option key={t} value={t} className="bg-[var(--surface-1)] capitalize">{t}</option>
                            ))}
                          </select>
                          <select
                            value={supp.evidence_level || 'B'}
                            onChange={(e) => updateSupplement(idx, 'evidence_level', e.target.value)}
                            className="input-dark !py-2 text-base"
                          >
                            {(['A', 'B', 'C', 'D'] as const).map((l) => (
                              <option key={l} value={l} className="bg-[var(--surface-1)]">Evidence {l}</option>
                            ))}
                          </select>
                        </div>
                        <input
                          value={supp.notes || ''}
                          onChange={(e) => updateSupplement(idx, 'notes', e.target.value)}
                          placeholder="Notes (optional)"
                          className="input-dark !py-2 text-base"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <button
                  onClick={saveProtocol}
                  disabled={saving || !formName.trim()}
                  className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Create Protocol'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ─── Assign to Client Modal ─── */}
        {assigningProtocolId && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--surface-overlay)] backdrop-blur-sm p-4">
            <motion.div
              ref={assignDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="assign-protocol-dialog-title"
              initial={reducedMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-elevated safe-bottom p-5 w-full max-w-md max-h-[70vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="assign-protocol-dialog-title" className="font-semibold text-[var(--content-primary)]">Assign to Client</h3>
                <button onClick={() => setAssigningProtocolId(null)} aria-label="Close client assignment" className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]">
                  <X size={18} />
                </button>
              </div>
              {loadingClients ? (
                <p className="text-[var(--content-secondary)] text-sm text-center py-6">Loading clients...</p>
              ) : clients.length === 0 ? (
                <p className="text-[var(--content-muted)] text-sm text-center py-6">No clients assigned to you</p>
              ) : (
                <div className="space-y-2">
                  {clients.map((client) => (
                    <button
                      key={client.user_id}
                      onClick={() => assignToClient(client.user_id)}
                      className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full text-left p-3 rounded-xl hover:bg-[var(--surface-2)] transition-colors flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--surface-active)] flex items-center justify-center text-[var(--action-primary)] text-sm font-semibold">
                        {client.profile?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[var(--content-primary)]">{client.profile?.full_name || 'Unknown'}</div>
                        <div className="text-xs text-[var(--content-secondary)]">{client.profile?.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
