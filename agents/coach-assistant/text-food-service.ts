import { lockTextFoodCatalogue } from './text-food-catalogue';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '@/db/client';
import type { FoodParseOutput, ParsedFoodItem } from '@/agents/schemas/food-parse';
import { selectFoodDisplayName } from '@/lib/food/display-name';
import { deriveFoodLogEdit, type FoodLogRow } from '@/lib/food/log-edit-service';
import { insertReviewedTextFood, validateReviewedTextFood } from '@/lib/food/log-create-service';
import { textFoodOperationSchema, textFoodDraftSchema, textFoodProposalSchema, type TextFoodOperation, type TextFoodScope, type TextFoodResult, type TextFoodDraft, type TextFoodProposal } from './text-food-contract';

type Database = typeof db;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope = TextFoodScope & { operation: TextFoodOperation };
type Failure = Extract<TextFoodResult, { ok: false }>['error'];
type Envelope = TextFoodDraft | TextFoodProposal;
const action = 'food.text.create';
class Rejected extends Error { constructor(readonly code: Failure) { super(code); } }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const scopedHash = (s: Scope, value: unknown) => digest({ actor: s.actorId, subject: s.subjectId, organization: s.organizationId, conversation: s.operation.conversationId, value });
const envelopeHash = (s: Scope, p: Envelope) => scopedHash(s, { ...p, hash: '' });
// Match jsonb text spacing for the database envelope/receipt byte constraints.
function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => `${JSON.stringify(key)}: ${jsonbText(v)}`).join(', ')}}`;
  return JSON.stringify(value);
}
const size = (value: unknown) => Buffer.byteLength(jsonbText(value), 'utf8');
const fail = (error: Failure): TextFoodResult => ({ ok: false, error });

async function authorize(tx: Tx, s: Scope) {
  s.signal.throwIfAborted();
  const actor = await tx.execute(sql`SELECT actor.id FROM public.profiles actor JOIN public.client_profiles cp ON cp.user_id=actor.id JOIN public.organization_members member ON member.user_id=actor.id WHERE actor.id=${s.actorId}::uuid AND actor.id=${s.subjectId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${s.organizationId}::uuid FOR SHARE OF actor,cp,member`);
  if (actor.rows.length !== 1) throw new Rejected('forbidden');
  const thread = await tx.execute(sql`SELECT id FROM private.coach_chat_threads WHERE id=${s.operation.conversationId}::uuid AND actor_id=${s.actorId}::uuid AND subject_id=${s.subjectId}::uuid AND organization_id=${s.organizationId}::uuid AND actor_role='client' AND state='active' AND access_revoked=false FOR SHARE`);
  if (thread.rows.length !== 1) throw new Rejected('forbidden');
}
async function capacity(tx: Tx, s: Scope) {
  const found = await tx.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM private.coach_action_proposals WHERE actor_id=${s.actorId}::uuid AND expires_at>now()`);
  const count = Number(found.rows[0]?.count);
  if (!Number.isSafeInteger(count) || count < 0 || count >= 128) throw new Rejected('uncertain');
}
async function expiry(tx: Tx) {
  const clock = await tx.execute<{ expires: string }>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
  return new Date(clock.rows[0].expires).toISOString();
}
async function save(tx: Tx, s: Scope, p: Envelope) {
  if (size(p) > 8192) throw new Rejected('invalid_input');
  await capacity(tx, s);
  await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at) VALUES(${p.id}::uuid,${s.actorId}::uuid,${s.subjectId}::uuid,${s.organizationId}::uuid,${s.operation.conversationId}::uuid,${action},${p.hash},${p.kind === 'review' ? p.draftHash : p.hash},${JSON.stringify(p)}::jsonb,${p.expiresAt}::timestamptz)`);
}
async function load(tx: Tx, s: Scope, id: string): Promise<Envelope> {
  const found = await tx.execute<{ envelope: unknown; request_hash: string; expired: boolean }>(sql`SELECT envelope,request_hash,expires_at<=clock_timestamp() AS expired FROM private.coach_action_proposals WHERE id=${id}::uuid AND actor_id=${s.actorId}::uuid AND subject_id=${s.subjectId}::uuid AND organization_id=${s.organizationId}::uuid AND conversation_id=${s.operation.conversationId}::uuid AND action=${action} FOR UPDATE`);
  if (found.rows.length !== 1) throw new Rejected('not_found');
  const row = found.rows[0];
  if (row.expired) throw new Rejected('expired');
  const parsed = z.union([textFoodDraftSchema, textFoodProposalSchema]).safeParse(row.envelope);
  if (!parsed.success) throw new Rejected('uncertain');
  const p = parsed.data;
  if (p.id !== id || p.hash !== row.request_hash || envelopeHash(s, p) !== p.hash) throw new Rejected('conflict');
  return p;
}
async function reviewedItems(tx: Tx, draft: TextFoodDraft, after: TextFoodProposal['after']) {
  if (draft.clarification) throw new Rejected('clarification_required');
  if (new Set(after.items.map(item => item.index)).size !== after.items.length) throw new Rejected('invalid_input');
  try { await lockTextFoodCatalogue(tx, after.items.map(portion => draft.items[portion.index]?.db_food_id)); }
  catch (error) { if (error instanceof Error && error.message === 'food_catalogue_conflict') throw new Rejected('conflict'); throw error; }
  const result: ParsedFoodItem[] = [];
  for (const portion of after.items) {
    const item = draft.items[portion.index];
    if (!item || item.grams <= 0) throw new Rejected('invalid_input');
    const basis = { foodName: selectFoodDisplayName(item), foodId: item.db_food_id ?? null, quantity: item.quantity, qtyG: String(item.grams), calories: item.calories, proteinG: item.protein_g, carbsG: item.carbs_g, fatG: item.fat_g, fiberG: item.fiber_g, sugarG: item.sugar_g } as FoodLogRow;
    // An unchanged reviewed portion must retain its exact reference numbers.
    // Catalogue access is still locked above; edited grams keep the normal Food derivation.
    const scaled = portion.grams===item.grams?{calories:item.calories,proteinG:item.protein_g,carbsG:item.carbs_g,fatG:item.fat_g,fiberG:item.fiber_g,sugarG:item.sugar_g}:await deriveFoodLogEdit(tx, basis, { grams: portion.grams });
    const confirmed = { ...item, quantity: portion.grams, unit: 'g', grams: portion.grams, calories: scaled.calories!, protein_g: scaled.proteinG!, carbs_g: scaled.carbsG!, fat_g: scaled.fatG!, fiber_g: scaled.fiberG!, sugar_g: scaled.sugarG!, portion_explicit: true };
    validateReviewedTextFood(confirmed, after.loggedDate, after.mealType);
    result.push(confirmed);
  }
  return result;
}

/** The server composes this parser from parseTextFood and the shared governed
 * transport. It is never accepted from a request body. No model runs on apply.
 */
export type TextFoodParser = (input: { text: string; language: string }, scope: { actorId: string; requestId: string; signal: AbortSignal }) => Promise<FoodParseOutput>;
export function createTextFoodService(database: Database, parser: TextFoodParser) {
  async function transaction<T>(s: Scope, run: (tx: Tx) => Promise<T>) {
    return database.transaction(async tx => {
      await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${s.actorId + ':text-food'},0))`);
      await authorize(tx, s);
      const result = await run(tx);
      s.signal.throwIfAborted();
      return result;
    });
  }
  return { async execute(scope: TextFoodScope & { operation: unknown }): Promise<TextFoodResult> {
    const checked = textFoodOperationSchema.safeParse(scope.operation);
    if (!checked.success) return fail('invalid_input');
    if (!z.string().uuid().safeParse(scope.actorId).success || !z.string().uuid().safeParse(scope.organizationId).success || scope.actorId !== scope.subjectId) return fail('forbidden');
    const op = checked.data, s: Scope = { ...scope, operation: op };
    let phase = 'action';
    try {
      if (op.operation === 'text.food.parse') {
        phase = 'parse_claim';
        const requestHash = scopedHash(s, { text: op.text, language: op.language, requestId: op.requestId });
        const existing = await transaction(s, async tx => {
          // Fail before any paid parsing while the reviewed SQL extension is on HOLD.
          const capability = await tx.execute<{ enabled: boolean }>(sql`SELECT position('food.text.create' in pg_get_constraintdef(oid))>0 AS enabled FROM pg_constraint WHERE conrelid='private.coach_action_proposals'::regclass AND conname='coach_action_proposals_action_check'`);
          if (capability.rows[0]?.enabled !== true) throw new Rejected('not_connected');
          const prior = await tx.execute<{ envelope: unknown; resource_version: string }>(sql`SELECT envelope,resource_version FROM private.coach_action_proposals WHERE id=${op.requestId}::uuid AND actor_id=${s.actorId}::uuid AND subject_id=${s.subjectId}::uuid AND organization_id=${s.organizationId}::uuid AND conversation_id=${op.conversationId}::uuid AND action=${action} FOR UPDATE`);
          if (prior.rows.length) {
            if (prior.rows[0].resource_version !== requestHash) throw new Rejected('conflict');
            // A committed pending claim survives ambiguous/crashed provider attempts.
            // It cannot be retried using the same request id.
            const p = await load(tx, s, op.requestId);
            if (p.kind !== 'parsed') throw new Rejected('conflict');
            return p;
          }
          await capacity(tx, s);
          const expiresAt = await expiry(tx);
          await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at) VALUES(${op.requestId}::uuid,${s.actorId}::uuid,${s.subjectId}::uuid,${s.organizationId}::uuid,${op.conversationId}::uuid,${action},${requestHash},${requestHash},${JSON.stringify({ kind: 'parsing', requestHash })}::jsonb,${expiresAt}::timestamptz)`);
          return null;
        });
        if (existing) return { ok: true, draft: existing };
        phase = 'native_parser';
        const output = await parser({ text: op.text, language: op.language }, { actorId: s.actorId, requestId: op.requestId, signal: s.signal });
        phase = 'draft_validation';
        return await transaction(s, async tx => {
          const claim = await tx.execute<{ envelope: { kind?: string }; expired: boolean }>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired FROM private.coach_action_proposals WHERE id=${op.requestId}::uuid AND actor_id=${s.actorId}::uuid AND request_hash=${requestHash} AND action=${action} FOR UPDATE`);
          if (claim.rows.length !== 1 || claim.rows[0].envelope.kind !== 'parsing') throw new Rejected('conflict');
          if (claim.rows[0].expired) throw new Rejected('expired');
          if (output.needs_clarification && !output.clarification_question) throw new Rejected('clarification_required');
          const p = textFoodDraftSchema.parse({ kind: 'parsed', id: op.requestId, hash: '0'.repeat(64), action, rawText: op.text, items: output.items, clarification: output.needs_clarification ? output.clarification_question : null, warnings: output.warnings ?? [], expiresAt: await expiry(tx) });
          p.hash = envelopeHash(s, p);
          if (size(p) > 8192) throw new Rejected('invalid_input');
          await tx.execute(sql`UPDATE private.coach_action_proposals SET request_hash=${p.hash},envelope=${JSON.stringify(p)}::jsonb,expires_at=${p.expiresAt}::timestamptz WHERE id=${p.id}::uuid AND actor_id=${s.actorId}::uuid AND request_hash=${requestHash}`);
          return { ok: true, draft: p };
        });
      }
      return await transaction(s, async tx => {
        if ('actionId' in op) {
          const prior = await tx.execute<{ result: unknown; proposal_id: string; request_hash: string }>(sql`SELECT r.result,r.proposal_id,r.request_hash FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id WHERE r.actor_id=${s.actorId}::uuid AND r.subject_id=${s.subjectId}::uuid AND r.organization_id=${s.organizationId}::uuid AND r.conversation_id=${op.conversationId}::uuid AND r.action_id=${op.actionId}::uuid AND p.action=${action}`);
          if (prior.rows.length) {
            const row = prior.rows[0];
            if (op.operation === 'text.food.apply' && (row.proposal_id !== op.proposalId || row.request_hash !== op.hash)) throw new Rejected('conflict');
            const result = textReceiptResultSchema.parse(row.result);
            if (result.receipt.actionId !== op.actionId || result.receipt.proposalId !== row.proposal_id || result.receipt.hash !== row.request_hash) throw new Rejected('uncertain');
            return result;
          }
          if (op.operation === 'text.food.receipt') throw new Rejected('not_found');
        }
        if (op.operation === 'text.food.read') {
          const p = await load(tx, s, op.proposalId);
          return p.kind === 'parsed' ? { ok: true, draft: p } : { ok: true, proposal: p };
        }
        if (op.operation === 'text.food.propose') {
          const draft = await load(tx, s, op.draftId);
          if (draft.kind !== 'parsed' || draft.hash !== op.hash) throw new Rejected('conflict');
          const items = await reviewedItems(tx, draft, op.after);
          const p: TextFoodProposal = { kind: 'review', id: randomUUID(), hash: '', action, draftId: draft.id, draftHash: draft.hash, after: op.after, items, entryIds: items.map(() => randomUUID()), expiresAt: draft.expiresAt, reviewRequired: true };
          p.hash = envelopeHash(s, p);
          await save(tx, s, textFoodProposalSchema.parse(p));
          return { ok: true, proposal: p };
        }
        if (op.operation !== 'text.food.apply') throw new Rejected('invalid_input');
        const p = await load(tx, s, op.proposalId);
        if (p.kind !== 'review' || p.hash !== op.hash) throw new Rejected('conflict');
        const consumed = await tx.execute(sql`SELECT r.id FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id WHERE r.actor_id=${s.actorId}::uuid AND p.action=${action} AND (p.id=${p.id}::uuid OR p.envelope->>'draftId'=${p.draftId}) LIMIT 1`);
        if (consumed.rows.length) throw new Rejected('conflict');
        const draft = await load(tx, s, p.draftId);
        if (draft.kind !== 'parsed' || draft.hash !== p.draftHash) throw new Rejected('conflict');
        const items = await reviewedItems(tx, draft, p.after);
        if (canonical(items) !== canonical(p.items) || items.length !== p.entryIds.length || new Set(p.entryIds).size !== items.length) throw new Rejected('conflict');
        await authorize(tx, s);
        const live = await tx.execute<{ expired: boolean }>(sql`SELECT clock_timestamp()>=${p.expiresAt}::timestamptz AS expired`);
        if (live.rows[0]?.expired !== false) throw new Rejected('expired');
        for (let index = 0; index < items.length; index++) {
          s.signal.throwIfAborted();
          const created = await insertReviewedTextFood(tx, { entryId: p.entryIds[index], ownerUserId: s.subjectId, proposalId: p.id, itemIndex: index }, { date: p.after.loggedDate, mealType: p.after.mealType, item: items[index] });
          if (created.source !== 'natural_language' || created.sourceId !== `coach-text:${p.id}:${index}` || created.foodName !== selectFoodDisplayName(items[index]) || created.foodId !== (items[index].db_food_id ?? null) || created.unit !== 'g' || created.qtyInputUnit !== 'g' || Number(created.qtyInput) !== items[index].grams || created.loggedDate !== p.after.loggedDate || created.mealType !== p.after.mealType || Number(created.qtyG) !== items[index].grams) throw new Rejected('uncertain');
          for (const [actual, expected] of [[created.calories, items[index].calories], [created.proteinG, items[index].protein_g], [created.carbsG, items[index].carbs_g], [created.fatG, items[index].fat_g], [created.fiberG, items[index].fiber_g], [created.sugarG, items[index].sugar_g], [created.quantity, items[index].quantity], [created.parseConfidence, items[index].confidence]]) if (typeof actual !== 'number' || typeof expected !== 'number' || !Number.isFinite(actual) || Math.fround(actual) !== Math.fround(expected)) throw new Rejected('uncertain');
        }
        const clock = await tx.execute<{ recorded: string }>(sql`SELECT clock_timestamp()::text AS recorded`);
        const result = textReceiptResultSchema.parse({ ok: true, receipt: { actionId: op.actionId, proposalId: p.id, hash: p.hash, entryIds: p.entryIds, loggedDate: p.after.loggedDate, recordedAt: new Date(clock.rows[0].recorded).toISOString(), status: 'applied' }, refresh: 'refetch' });
        if (size(result) > 1024) throw new Rejected('invalid_input');
        await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result) VALUES(${randomUUID()}::uuid,${s.actorId}::uuid,${s.subjectId}::uuid,${s.organizationId}::uuid,${op.conversationId}::uuid,${op.actionId}::uuid,${p.id}::uuid,${p.hash},${p.draftHash},${JSON.stringify(result)}::jsonb)`);
        await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value) VALUES(${s.actorId}::uuid,'client'::user_role,'text_food_created','food_log',${p.entryIds[0]}::uuid,${JSON.stringify({ actionId: op.actionId, entryIds: p.entryIds })}::jsonb)`);
        return result;
      });
    } catch (error) {
      // Stage and schema paths only: never log meal content or native provider output.
      console.error('[text-food] operation failed', {
        phase,
        ...safeErrorMetadata(error),
        ...(error instanceof Rejected ? { code: error.code } : {}),
        ...(error instanceof z.ZodError ? { issues: error.issues.map(issue => ({ code: issue.code, path: issue.path })) } : {}),
      });
      if (error instanceof Rejected) return fail(error.code);
      if (error instanceof z.ZodError || error instanceof Error && error.message === 'invalid_input') return fail('invalid_input');
      return fail('uncertain');
    }
  } };
}
const textReceiptResultSchema = z.object({ ok: z.literal(true), receipt: z.object({ actionId: z.string().uuid(), proposalId: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/), entryIds: z.array(z.string().uuid()).min(1).max(12), loggedDate: z.iso.date(), recordedAt: z.string().datetime({ offset: true }), status: z.literal('applied') }).strict(), refresh: z.literal('refetch') }).strict();
