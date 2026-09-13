import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createTextFoodService } from './text-food-service';
import type { FoodParseOutput, ParsedFoodItem } from '@/agents/schemas/food-parse';
import type { TextFoodProposal, TextFoodDraft } from './text-food-contract';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { version: 'coach-assistant.v2', conversationId: id(3), turnId: id(4) };
const rice: ParsedFoodItem = { raw_text: '100g rice', food_name: 'Rice', name_localized: 'Rice', quantity: 100, unit: 'g', grams: 100, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, sugar_g: 0, confidence: 0.9, source: 'ai_estimate', portion_explicit: true };
// Injected transactions only: no database, provider, credentials, or network.
function fixture() {
  type ProposalRow = { id: string; actor: string; subject: string; organization: string; conversation: string; action: string; request_hash: string; resource_version: string; envelope: Record<string, unknown>; expires: string };
  type ReceiptRow = { actor: string; subject: string; organization: string; conversation: string; actionId: string; proposal_id: string; request_hash: string; result: unknown };
  let proposals: ProposalRow[] = [], receipts: ReceiptRow[] = [], foods: Record<string, unknown>[] = [], audits = 0;
  let cataloguePresent = true; const catalogueLocks: string[] = [];
  let authorized = true, connected = true, expired = false, failReceipt = false, failAudit = false, corrupt = false, failDraft = false;
  const controller = new AbortController(), dialect = new PgDialect();
  const parser = vi.fn(async (): Promise<FoodParseOutput> => ({ items: [structuredClone(rice)] }));
  const scope = { actorId: id(1), subjectId: id(1), organizationId: id(2), signal: controller.signal };
  const tx = {
    async execute(statement: Parameters<PgDialect['sqlToQuery']>[0]) {
      const { sql: query, params: p } = dialect.sqlToQuery(statement);
      const rows = (values: unknown[]) => ({ rows: values });
      if (query.startsWith('SELECT id FROM public.foods')) { catalogueLocks.push(String(p[0])); return rows(cataloguePresent ? [{ id: p[0] }] : []); }
      if (query.startsWith('SET LOCAL') || query.includes('pg_advisory_xact_lock')) return rows([]);
      if (query.includes('FROM public.profiles') || query.includes('FROM private.coach_chat_threads')) return rows(authorized ? [{ id: id(1) }] : []);
      if (query.includes('FROM pg_constraint')) return rows([{ enabled: connected }]);
      if (query.includes('count(*)')) return rows([{ count: '0' }]);
      if (query.includes("interval '5 minutes'")) return rows([{ expires: '2026-09-12T23:05:00Z' }]);
      if (query.includes('clock_timestamp()::text AS recorded')) return rows([{ recorded: '2026-09-12T23:01:00Z' }]);
      if (query.startsWith('SELECT clock_timestamp()>=')) return rows([{ expired }]);
      if (query.startsWith('INSERT INTO private.coach_action_proposals')) {
        if (proposals.some(row => row.id === p[0])) throw Error('unique');
        proposals.push({ id: String(p[0]), actor: String(p[1]), subject: String(p[2]), organization: String(p[3]), conversation: String(p[4]), action: String(p[5]), request_hash: String(p[6]), resource_version: String(p[7]), envelope: JSON.parse(String(p[8])), expires: String(p[9]) });
        return rows([]);
      }
      if (query.startsWith('UPDATE private.coach_action_proposals')) {
        if (failDraft) throw Object.assign(new Error('private database detail'), { code: '57014' });
        const row = proposals.find(row => row.id === p[3] && row.actor === p[4] && row.request_hash === p[5]);
        if (!row) throw Error('missing claim');
        row.request_hash = String(p[0]); row.envelope = JSON.parse(String(p[1])); row.expires = String(p[2]); return rows([]);
      }
      if (query.includes('FROM private.coach_action_proposals WHERE id=')) {
        const row = proposals.find(row => row.id === p[0] && row.actor === p[1]);
        if (!row) return rows([]);
        if (query.includes('AND subject_id=') && (row.subject !== p[2] || row.organization !== p[3] || row.conversation !== p[4])) return rows([]);
        if (query.includes('AND request_hash=') && row.request_hash !== p[2]) return rows([]);
        return rows([{ ...structuredClone(row), expired }]);
      }
      if (query.startsWith('SELECT r.result')) return rows(receipts.filter(row => row.actor === p[0] && row.subject === p[1] && row.organization === p[2] && row.conversation === p[3] && row.actionId === p[4]));
      if (query.startsWith('SELECT r.id')) return rows(receipts.filter(row => row.actor === p[0] && proposals.some(proposal => proposal.id === row.proposal_id && (proposal.id === p[2] || proposal.envelope.draftId === p[3]))));
      if (query.startsWith('INSERT INTO private.coach_action_receipts')) {
        if (failReceipt) throw Error('receipt unavailable');
        receipts.push({ actor: String(p[1]), subject: String(p[2]), organization: String(p[3]), conversation: String(p[4]), actionId: String(p[5]), proposal_id: String(p[6]), request_hash: String(p[7]), result: JSON.parse(String(p[9])) }); return rows([]);
      }
      if (query.startsWith('INSERT INTO public.audit_log')) { if (failAudit) throw Error('audit unavailable'); audits++; return rows([]); }
      throw Error(`Unexpected fixture query: ${query}`);
    },
    select() { return { from() { return { where() { return { async limit() { return cataloguePresent ? [{ kcalPer100g: 130, proteinPer100g: 2.7, carbPer100g: 28, fatPer100g: 0.3, fiberPer100g: 0.4, sugarPer100g: 0 }] : []; } }; } }; } }; },
    insert() { return { values(entry: Record<string, unknown>) { return { async returning() { foods.push(structuredClone(entry)); return [{ ...entry, ...(corrupt ? { calories: -1 } : {}) }]; } }; } }; },
  };
  let queue = Promise.resolve();
  const database = { async transaction<T>(callback: (value: typeof tx) => Promise<T>) {
    const previous = queue; let release!: () => void; queue = new Promise(resolve => { release = resolve; }); await previous;
    const saved = structuredClone({ proposals, receipts, foods, audits });
    try { return await callback(tx); } catch (error) { ({ proposals, receipts, foods, audits } = saved); throw error; } finally { release(); }
  } };
  const service = createTextFoodService(database as never, parser);
  const execute = (operation: unknown, overrides = {}) => service.execute({ ...scope, ...overrides, operation });
  const parseOp = { ...base, operation: 'text.food.parse', requestId: id(5), text: '100g rice', language: 'en' };
  async function parse() { const r = await execute(parseOp); if (!r.ok || !('draft' in r)) throw Error(JSON.stringify(r)); return r.draft; }
  async function propose(draft?: TextFoodDraft, grams = 150) {
    const d = draft ?? await parse();
    const r = await execute({ ...base, operation: 'text.food.propose', draftId: d.id, hash: d.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: [{ index: 0, grams }] } });
    if (!r.ok || !('proposal' in r)) throw Error(JSON.stringify(r)); return r.proposal;
  }
  const applyOp = (p: TextFoodProposal, actionId = id(6)) => ({ ...base, operation: 'text.food.apply', proposalId: p.id, hash: p.hash, actionId, reviewed: true });
  return { breakDraft: () => { failDraft = true; }, catalogueLocks, removeCatalogue: () => { cataloguePresent = false; }, parser, execute, parse, propose, parseOp, applyOp, state: () => ({ proposals, receipts, foods, audits }), revoke: () => { authorized = false; }, disconnect: () => { connected = false; }, expire: () => { expired = true; }, breakReceipt: () => { failReceipt = true; }, breakAudit: () => { failAudit = true; }, corrupt: () => { corrupt = true; }, abort: () => controller.abort() };
}
describe('actor-bound text Food review service — offline transactions', () => {
  it('parses once, scales a review with native Food rules, and writes only on confirmation', async () => {
    const f = fixture(), d = await f.parse(); expect(f.state().foods).toHaveLength(0);
    expect(await f.parse()).toEqual(d); expect(f.parser).toHaveBeenCalledTimes(1);
    const p = await f.propose(d); expect(p.items[0]).toMatchObject({ grams: 150, calories: 195 }); expect(f.state().foods).toHaveLength(0);
    expect(await f.execute(f.applyOp(p))).toMatchObject({ ok: true, receipt: { entryIds: p.entryIds, status: 'applied' }, refresh: 'refetch' });
    expect(f.state().foods[0]).toMatchObject({ source: 'natural_language', userId: id(1), loggedDate: '2026-09-12', mealType: 'lunch', calories: 195, qtyG: '150' });
    expect(f.state().audits).toBe(1); expect(f.parser).toHaveBeenCalledTimes(1);
  });
  it('stops before parser while SQL capability is on HOLD', async () => { const f = fixture(); f.disconnect(); expect(await f.execute(f.parseOp)).toEqual({ ok: false, error: 'not_connected' }); expect(f.parser).not.toHaveBeenCalled(); expect(f.state().proposals).toHaveLength(0); });
  it('blocks foreign actor and conversation without disclosing a draft', async () => { const f = fixture(), d = await f.parse(); expect(await f.execute({ ...base, operation: 'text.food.read', proposalId: d.id }, { subjectId: id(9) })).toMatchObject({ error: 'forbidden' }); expect(await f.execute({ ...base, conversationId: id(9), operation: 'text.food.read', proposalId: d.id })).toMatchObject({ error: 'not_found' }); });
  it('rechecks revoked authorization before confirm and receipt replay', async () => { const f = fixture(), p = await f.propose(); f.revoke(); expect(await f.execute(f.applyOp(p))).toMatchObject({ error: 'forbidden' }); expect(f.state().foods).toHaveLength(0); });
  it('rejects missing review, tampering, and expired proposals', async () => { const f = fixture(), p = await f.propose(); expect(await f.execute({ ...f.applyOp(p), reviewed: false })).toMatchObject({ error: 'invalid_input' }); expect(await f.execute({ ...f.applyOp(p), hash: 'a'.repeat(64) })).toMatchObject({ error: 'conflict' }); f.expire(); expect(await f.execute(f.applyOp(p))).toMatchObject({ error: 'expired' }); expect(f.state().foods).toHaveLength(0); });
  it('replays the same receipt after an ambiguous response, without another insert', async () => { const f = fixture(), p = await f.propose(); const first = await f.execute(f.applyOp(p)); expect(await f.execute(f.applyOp(p))).toEqual(first); expect(await f.execute({ ...base, operation: 'text.food.receipt', actionId: id(6) })).toEqual(first); expect(f.state().foods).toHaveLength(1); });
  it('prevents repeated apply with a different action and sibling proposal from same meal', async () => { const f = fixture(), d = await f.parse(), p = await f.propose(d), sibling = await f.propose(d, 100); await f.execute(f.applyOp(p)); expect(await f.execute(f.applyOp(p, id(7)))).toMatchObject({ error: 'conflict' }); expect(await f.execute(f.applyOp(sibling, id(8)))).toMatchObject({ error: 'conflict' }); expect(f.state().foods).toHaveLength(1); });
  it.each(['breakReceipt', 'breakAudit', 'corrupt'] as const)('rolls back the entire meal on %s', async method => { const f = fixture(), p = await f.propose(); f[method](); expect(await f.execute(f.applyOp(p))).toMatchObject({ ok: false }); expect(f.state().foods).toHaveLength(0); expect(f.state().receipts).toHaveLength(0); expect(f.state().audits).toBe(0); });
  it('does not repeat a parser attempt after a failed or concurrent claim', async () => { const f = fixture(); f.parser.mockRejectedValueOnce(Error('provider ambiguous')); expect(await f.execute(f.parseOp)).toMatchObject({ error: 'uncertain' }); expect(await f.execute(f.parseOp)).toMatchObject({ error: 'uncertain' }); expect(f.parser).toHaveBeenCalledTimes(1); });
  it('rejects request-id reuse with different content', async () => { const f = fixture(); await f.parse(); expect(await f.execute({ ...f.parseOp, text: '200g rice' })).toMatchObject({ error: 'conflict' }); expect(f.parser).toHaveBeenCalledTimes(1); });
  it('refuses duplicate indices and client macro injection', async () => { const f = fixture(), d = await f.parse(); const op = { ...base, operation: 'text.food.propose', draftId: d.id, hash: d.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: [{ index: 0, grams: 100 }, { index: 0, grams: 100 }] } }; expect(await f.execute(op)).toMatchObject({ error: 'invalid_input' }); expect(await f.execute({ ...op, after: { ...op.after, items: [{ index: 0, grams: 100, calories: 1 }] } })).toMatchObject({ error: 'invalid_input' }); });
  it('cancels before any interpretation or write', async () => { const f = fixture(); f.abort(); expect(await f.execute(f.parseOp)).toMatchObject({ ok: false }); expect(f.parser).not.toHaveBeenCalled(); expect(f.state().foods).toHaveLength(0); });
  it('requires clarification for an empty parse without creating a review', async () => {
    const f = fixture(); f.parser.mockResolvedValueOnce({ items: [], needs_clarification: true, clarification_question: 'What did you eat?' });
    const d = await f.parse(); expect(d.clarification).toBe('What did you eat?');
    expect(await f.execute({ ...base, operation: 'text.food.propose', draftId: d.id, hash: d.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: [{ index: 0, grams: 100 }] } })).toMatchObject({ error: 'clarification_required' });
    expect(f.state().foods).toHaveLength(0);
  });
  it('serializes concurrent parse claims and dispatches only once', async () => {
    const f = fixture(); let release!: (output: FoodParseOutput) => void;
    f.parser.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = f.execute(f.parseOp);
    await vi.waitFor(() => expect(f.parser).toHaveBeenCalledTimes(1));
    expect(await f.execute(f.parseOp)).toMatchObject({ error: 'uncertain' });
    release({ items: [rice] }); expect(await first).toMatchObject({ ok: true });
    expect(f.parser).toHaveBeenCalledTimes(1);
  });
  it('refuses a parser result after access is revoked, without saving it', async () => {
    const f = fixture(); f.parser.mockImplementationOnce(async () => { f.revoke(); return { items: [rice] }; });
    expect(await f.execute(f.parseOp)).toMatchObject({ error: 'forbidden' });
    expect(f.state().proposals[0].envelope.kind).toBe('parsing'); expect(f.state().foods).toHaveLength(0);
  });
  it('creates a full 12-item meal and returns a bounded receipt', async () => {
    const f = fixture(); f.parser.mockResolvedValueOnce({ items: Array.from({ length: 12 }, () => ({ ...rice })) });
    const d = await f.parse(); const r = await f.execute({ ...base, operation: 'text.food.propose', draftId: d.id, hash: d.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: d.items.map((_, index) => ({ index, grams: 100 })) } });
    expect(r).toMatchObject({ ok: true }); if (!r.ok || !('proposal' in r)) throw Error(JSON.stringify(r));
    const applied = await f.execute(f.applyOp(r.proposal)); expect(applied).toMatchObject({ ok: true });
    expect(f.state().foods).toHaveLength(12); expect(f.state().receipts).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(applied))).toBeLessThan(1024);
  });
  it('rolls back every item of a meal when receipt persistence fails', async () => {
    const f = fixture(); f.parser.mockResolvedValueOnce({ items: [rice, { ...rice }] });
    const d = await f.parse(); const r = await f.execute({ ...base, operation: 'text.food.propose', draftId: d.id, hash: d.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: [{ index: 0, grams: 100 }, { index: 1, grams: 200 }] } });
    if (!r.ok || !('proposal' in r)) throw Error(JSON.stringify(r));
    f.breakReceipt(); expect(await f.execute(f.applyOp(r.proposal))).toMatchObject({ ok: false }); expect(f.state().foods).toHaveLength(0);
  });
  it('detects persisted envelope tampering instead of writing client-supplied macros', async () => {
    const f = fixture(), p = await f.propose();
    const stored = f.state().proposals.find(row => row.id === p.id)!;
    (stored.envelope.items as ParsedFoodItem[])[0].calories = 1;
    expect(await f.execute(f.applyOp(p))).toMatchObject({ error: 'conflict' }); expect(f.state().foods).toHaveLength(0);
  });

  it('uses the native display-name mapping when localized and canonical names differ', async () => {
    const f = fixture(); f.parser.mockResolvedValueOnce({ items: [{ ...rice, food_name: ' Rice ', name_localized: 'Arroz' }] });
    const p = await f.propose(); expect(await f.execute(f.applyOp(p))).toMatchObject({ ok: true });
    expect(f.state().foods[0].foodName).toBe('Rice');
  });

  it('locks catalogue rows during review and apply and refuses a missing reference', async () => {
    const f = fixture(); f.parser.mockResolvedValueOnce({ items: [{ ...rice, db_food_id: id(20), source: 'local_db' }] });
    const p = await f.propose(); expect(f.catalogueLocks).toEqual([id(20)]);
    f.removeCatalogue(); expect(await f.execute(f.applyOp(p))).toMatchObject({ error: 'conflict' });
    expect(f.catalogueLocks).toEqual([id(20), id(20)]); expect(f.state().foods).toHaveLength(0);
  });
  it('does not create a proposal with a missing catalogue reference', async () => {
    const f = fixture(); f.parser.mockResolvedValueOnce({ items: [{ ...rice, db_food_id: id(20), source: 'local_db' }] });
    const d = await f.parse(); f.removeCatalogue();
    expect(await f.execute({ ...base, operation: 'text.food.propose', draftId: d.id, hash: d.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: [{ index: 0, grams: 100 }] } })).toMatchObject({ error: 'conflict' });
    expect(f.state().foods).toHaveLength(0);
  });

});

describe('post-parser failure boundary without provider calls', () => {
  it.each(['native-processing', 'invalid-contract', 'expired-claim', 'draft-transaction'] as const)('keeps %s failure non-writing and never replays the claimed parse', async scenario => {
    const f = fixture();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      f.parser.mockImplementationOnce(async () => {
        if (scenario === 'native-processing') throw Error('private meal processing detail');
        if (scenario === 'expired-claim') f.expire();
        if (scenario === 'draft-transaction') f.breakDraft();
        return { items: [{ ...rice, ...(scenario === 'invalid-contract' ? { confidence: 2 } : {}) }] };
      });
      expect(await f.execute(f.parseOp)).toMatchObject({ ok: false });
      expect(log.mock.calls[0]?.[1]).toMatchObject({ phase: scenario === 'native-processing' ? 'native_parser' : 'draft_validation' });
      expect(JSON.stringify(log.mock.calls)).not.toContain('private meal');
      expect(JSON.stringify(log.mock.calls)).not.toContain('private database');
      expect(f.state()).toMatchObject({ foods: [], receipts: [], audits: 0 });
      expect(f.state().proposals[0].envelope.kind).toBe('parsing');
      expect(await f.execute(f.parseOp)).toMatchObject({ ok: false });
      expect(f.parser).toHaveBeenCalledTimes(1);
      expect(f.state()).toMatchObject({ foods: [], receipts: [], audits: 0 });
    } finally { log.mockRestore(); }
  });
});
