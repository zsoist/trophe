'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { textFoodPortionsSchema, textFoodResultSchema, type TextFoodDraft, type TextFoodOperation, type TextFoodProposal, type TextFoodReceipt } from '@/agents/coach-assistant/text-food-contract';
import { localToday } from '@/lib/utils/dates';
import { selectFoodDisplayName } from '@/lib/food/display-name';
import type { TextFoodTransport } from './text-food-client';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import { readTextFoodRecovery, saveTextFoodRecovery, clearTextFoodRecovery } from './text-food-recovery';
import styles from './GlobalCoach.module.css';

/** Functional contract for the approved visual implementation: all nutrition
 * comes from a server draft/proposal; only a confirmed receipt means saved. */
/**
 * Parent-visible lifecycle of the canonical write this review owns.
 * `pending`/`unknown` mean an apply may still be in flight or may already have committed, so a
 * host must never replace or unmount this review (or prepare another action) until it resolves.
 */
export type TextFoodApplyState = 'idle' | 'pending' | 'unknown' | 'applied';
function initialMeal(rawText: string): TextFoodProposal['after']['mealType'] {
  // Only explicit meal language seeds the editable review; never use the clock.
  const text = rawText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mentions = [
    ['breakfast', /\b(?:breakfast|desayuno|desayune)\b/],
    ['lunch', /\b(?:lunch|almuerzo|almorce)\b/],
    ['dinner', /\b(?:dinner|cena|cene|cenar)\b/],
    ['snack', /\b(?:snack|merienda|merende)\b/],
    ['pre_workout', /\b(?:pre[ -]?workout|preentreno)\b/],
    ['post_workout', /\b(?:post[ -]?workout|postentreno)\b/],
  ] as const;
  const matches = mentions.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : 'lunch';
}
export interface TextFoodReviewProps {
  draft: TextFoodDraft;
  conversationId: string;
  transport: TextFoodTransport;
  onReceipt: (receipt: TextFoodReceipt) => void;
  onDismiss?: () => void;
  savedReceipt?: TextFoodReceipt;
  /** Reports the real apply lifecycle so a parent can gate destructive replacement on it. */
  onApplyState?: (state: TextFoodApplyState) => void;
}
export function TextFoodReview({ draft, conversationId, transport, onReceipt, onDismiss, savedReceipt, onApplyState }: TextFoodReviewProps) {
  const { t } = useGlobalCoachI18n();
  const [grams, setGrams] = useState(() => draft.items.map(item => String(item.grams)));
  const [date, setDate] = useState(localToday), [meal, setMeal] = useState<TextFoodProposal['after']['mealType']>(() => initialMeal(draft.rawText));
  const [proposal, setProposal] = useState<TextFoodProposal | null>(null), [receipt, setReceipt] = useState<TextFoodReceipt | null>(savedReceipt ?? null);
  const [recovery]=useState(()=>{const value=readTextFoodRecovery(conversationId);return value?.draftId===draft.id&&value.draftHash===draft.hash?value:null;});
  const expectedEntries=useRef<string[]|null>(recovery?.entryIds??null);
  const [submitted,setSubmitted]=useState(Boolean(recovery));
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(Boolean(recovery)), [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null), apply = useRef<Extract<TextFoodOperation, { operation: 'text.food.apply' }> | null>(recovery?.operation.operation==='text.food.apply'?recovery.operation:null);
  const received = useRef<string | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const applyState: TextFoodApplyState = receipt ? 'applied' : submitted ? (pending ? 'pending' : 'unknown') : 'idle';
  const reportApplyState = useRef(onApplyState);
  useEffect(() => { reportApplyState.current = onApplyState; }, [onApplyState]);
  useEffect(() => { onApplyState?.(applyState); }, [applyState, onApplyState]);
  useEffect(() => () => { reportApplyState.current?.('idle'); }, []);
  const base = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: crypto.randomUUID() });
  const after = textFoodPortionsSchema.safeParse({ loggedDate: date, mealType: meal, items: grams.map((value, index) => ({ index, grams: Number(value) })) });
  async function run(operation: TextFoodOperation) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setPending(true); setError(null);
    try {
      const result = textFoodResultSchema.parse(await transport(operation, controller.signal));
      if (controller.signal.aborted) return;
      if (!result.ok) { setError(result.error); if (apply.current) setUncertain(true); return; }
      if (operation.operation === 'text.food.propose' && 'proposal' in result) {
        const p = result.proposal;
        if (p.draftId !== draft.id || p.draftHash !== draft.hash || JSON.stringify(p.after) !== JSON.stringify(operation.after)) throw Error('invalid_result');
        setProposal(p);
      } else if ('receipt' in result && apply.current) {
        const r = result.receipt;
        if (r.actionId !== apply.current.actionId || r.proposalId !== apply.current.proposalId || r.hash !== apply.current.hash || JSON.stringify(r.entryIds) !== JSON.stringify(expectedEntries.current)) throw Error('invalid_result');
        setReceipt(r); setUncertain(false);clearTextFoodRecovery(conversationId);
        if (received.current !== r.actionId) { received.current = r.actionId; onReceipt(r); }
      } else throw Error('invalid_result');
    } catch { if (!controller.signal.aborted) { setError('uncertain'); setUncertain(Boolean(apply.current)); } }
    finally { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setPending(false); } }
  }
  const edit = () => { if (!apply.current) { setProposal(null); setError(null); } };
  const values = proposal?.items ?? draft.items;
  return <section className={styles.foodReview} aria-label={t('global_coach.text_food_title')}>
    <h3>{t('global_coach.text_food_title')}</h3>
    {onDismiss&&<button type="button" disabled={pending||submitted&&!receipt} onClick={onDismiss}>{t(receipt?'global_coach.food_done':'general.cancel')}</button>}
    {receipt
      ? <div className={styles.receipt}><p role="status">{t('global_coach.text_food_saved')}</p></div>
      : <p>{t('global_coach.text_food_estimate')}</p>}
    {draft.clarification && <p role="status">{draft.clarification}</p>}
    {!draft.clarification && !receipt && <>
      <fieldset disabled={pending || submitted}>
        {values.map((item, index) => <label key={index}>{selectFoodDisplayName(item)} · {item.calories} kcal · {item.protein_g} g {t('global_coach.food_proteinG')}
          <input aria-label={`${selectFoodDisplayName(item)} — ${t('global_coach.food_grams')}`} type="number" min="0.01" max="10000" step="0.01" value={grams[index]} onChange={event => { edit(); setGrams(current => current.map((value, i) => i === index ? event.target.value : value)); }} />
        </label>)}
        <label>{t('global_coach.photo_food_date')}<input type="date" value={date} onChange={event => { edit(); setDate(event.target.value); }} /></label>
        <label>{t('global_coach.photo_food_meal')}<select value={meal} onChange={event => { edit(); setMeal(event.target.value as typeof meal); }}>{(['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'] as const).map(value => <option key={value} value={value}>{t(`global_coach.photo_food_${value === 'pre_workout' ? 'pre' : value === 'post_workout' ? 'post' : value}`)}</option>)}</select></label>
      </fieldset>
      {!receipt && !uncertain && !submitted && (proposal ? <button type="button" disabled={pending} onClick={() => {
        if (active.current || apply.current) return;
        if(Date.parse(proposal.expiresAt)<=Date.now()){setError('expired');return;}
        const operation:Extract<TextFoodOperation,{operation:'text.food.apply'}> = { ...base(), operation: 'text.food.apply', proposalId: proposal.id, hash: proposal.hash, actionId: crypto.randomUUID(), reviewed: true };
        try{saveTextFoodRecovery({operation,draftId:draft.id,draftHash:draft.hash,entryIds:proposal.entryIds});}catch{setError('uncertain');return;}
        expectedEntries.current=proposal.entryIds;apply.current=operation;setSubmitted(true);void run(operation);
      }}>{t('global_coach.photo_food_confirm')}</button> : <button type="button" disabled={pending || !after.success} onClick={() => { if(Date.parse(draft.expiresAt)<=Date.now()){setError('expired');return;} if (after.success) void run({ ...base(), operation: 'text.food.propose', draftId: draft.id, hash: draft.hash, after: after.data }); }}>{t('global_coach.photo_food_review')}</button>)}
    </>}
    {uncertain && <button type="button" disabled={pending} onClick={() => { if (apply.current) void run({ ...base(), operation: 'text.food.receipt', actionId: apply.current.actionId }); }}>{t('global_coach.food_check')}</button>}
    {pending && <p role="status">{t('global_coach.pending')}</p>}
    {error && <p role="status">{t(error === 'expired' ? 'global_coach.photo_food_expired' : 'global_coach.photo_food_error')}</p>}
    <Link href="/dashboard/log">{t('global_coach.photo_food_open_log')}</Link>
  </section>;
}

/** Reopening the same chat after a reload offers receipt recovery, never reapply. */
export function TextFoodRecoveryNotice({ conversationId, transport, onReceipt }: Pick<TextFoodReviewProps, 'conversationId' | 'transport' | 'onReceipt'>) {
  const { t } = useGlobalCoachI18n();
  const [saved] = useState(() => readTextFoodRecovery(conversationId));
  const [pending,setPending]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(false);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  if(!saved||done||saved.operation.operation!=='text.food.apply')return null;
  return <section className={styles.foodReview} aria-label={t('global_coach.text_food_recovery')}>
    <p>{t('global_coach.text_food_recovery')}</p>
    <button type="button" disabled={pending} onClick={async()=>{
      if(active.current||saved.operation.operation!=='text.food.apply')return;
      const controller=new AbortController();active.current=controller;setPending(true);setError(false);
      try{
        const result=textFoodResultSchema.parse(await transport({version:'coach-assistant.v2',operation:'text.food.receipt',conversationId,turnId:crypto.randomUUID(),actionId:saved.operation.actionId},controller.signal));
        if(controller.signal.aborted)return;
        if(!result.ok||!('receipt'in result)||result.receipt.actionId!==saved.operation.actionId||result.receipt.proposalId!==saved.operation.proposalId||result.receipt.hash!==saved.operation.hash||JSON.stringify(result.receipt.entryIds)!==JSON.stringify(saved.entryIds))throw Error('unconfirmed');
        clearTextFoodRecovery(conversationId);setDone(true);onReceipt(result.receipt);
      }catch{if(!controller.signal.aborted)setError(true);}finally{active.current=null;if(!controller.signal.aborted)setPending(false);}
    }}>{t('global_coach.food_check')}</button>
    {error&&<p role="status">{t('global_coach.photo_food_error')}</p>}
  </section>;
}
