'use client';
import { useEffect, useRef, useState } from 'react';
import type { PhotoFoodTransport } from './photo-food-client';
import { PhotoFoodController, type PhotoFoodState } from './photo-food-state';
import { useGlobalCoachI18n } from './useGlobalCoachI18n';
import styles from './GlobalCoach.module.css';

const today=()=>new Date().toISOString().slice(0,10);
export function PhotoFoodPanel({controller,state,transport,onReceipt}:{controller:PhotoFoodController;state:PhotoFoodState;transport:PhotoFoodTransport;onReceipt?:(entryId:string)=>void}){
 const {t}=useGlobalCoachI18n();const selected=state.snapshot?.items.find(item=>item.index===state.itemIndex);const [grams,setGrams]=useState('');const [date,setDate]=useState(today());const [meal,setMeal]=useState<'breakfast'|'lunch'|'dinner'|'snack'|'pre_workout'|'post_workout'>('lunch');const proposal=state.proposal;
 const delivered=useRef<string|null>(null);useEffect(()=>{if(!state.receipt||!state.refreshEntryId||delivered.current===state.receipt.id)return;delivered.current=state.receipt.id;onReceipt?.(state.refreshEntryId);},[onReceipt,state.receipt,state.refreshEntryId]);
 return <section className={styles.foodReview} aria-label={t('global_coach.photo_food_title')}>
  <h3>{t('global_coach.photo_food_title')}</h3>
  {state.snapshot&&<><p>{t(state.snapshot.source==='offline_fixture'?'global_coach.photo_food_offline':'global_coach.photo_food_observation')}</p><p>{t('global_coach.photo_food_estimate')}</p>
   {state.snapshot.items.map(item=><button key={item.index} type="button" aria-pressed={item.index===state.itemIndex} onClick={()=>controller.choose(item.index)}>{item.foodName} · {item.estimatedGrams} g · {item.estimatedCalories} kcal</button>)}
  </>}
  {state.receipt?<><p role="status">{t('global_coach.photo_food_saved')}</p><button type="button" onClick={()=>controller.dismiss()}>{t('global_coach.food_done')}</button></>:state.uncertain?<button type="button" disabled={state.pending} onClick={()=>void controller.check(transport)}>{t('global_coach.food_check')}</button>:proposal?<>
   <table><caption>{t('global_coach.photo_food_review')}</caption><thead><tr><th scope="col">{t('global_coach.food_value')}</th><th scope="col">{t('global_coach.food_before')}</th><th scope="col">{t('global_coach.food_after')}</th></tr></thead><tbody>
    <tr><th scope="row">{t('global_coach.food_grams')}</th><td>{selected?.estimatedGrams??'—'}</td><td>{proposal.after.grams}</td></tr><tr><th scope="row">{t('global_coach.food_calories')}</th><td>{selected?.estimatedCalories??'—'}</td><td>{proposal.after.calories}</td></tr><tr><th scope="row">{t('global_coach.food_proteinG')}</th><td>—</td><td>{proposal.after.proteinG}</td></tr><tr><th scope="row">{t('global_coach.food_carbsG')}</th><td>—</td><td>{proposal.after.carbsG}</td></tr><tr><th scope="row">{t('global_coach.food_fatG')}</th><td>—</td><td>{proposal.after.fatG}</td></tr>
   </tbody></table><button type="button" disabled={state.pending} onClick={()=>void controller.apply(transport)}>{t('global_coach.photo_food_confirm')}</button><button type="button" disabled={state.pending} onClick={()=>controller.discard()}>{t('general.cancel')}</button>
  </>:selected&&!state.pending?<><label>{t('global_coach.food_grams')}<input type="number" min="0.1" max="10000" step="0.1" value={grams} onChange={e=>setGrams(e.target.value)}/></label><label>{t('global_coach.photo_food_date')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{t('global_coach.photo_food_meal')}<select value={meal} onChange={e=>setMeal(e.target.value as typeof meal)}><option value="breakfast">{t('global_coach.photo_food_breakfast')}</option><option value="lunch">{t('global_coach.photo_food_lunch')}</option><option value="dinner">{t('global_coach.photo_food_dinner')}</option><option value="snack">{t('global_coach.photo_food_snack')}</option><option value="pre_workout">{t('global_coach.photo_food_pre')}</option><option value="post_workout">{t('global_coach.photo_food_post')}</option></select></label><button type="button" disabled={!Number.isFinite(Number(grams))||Number(grams)<.1||Number(grams)>10000} onClick={()=>void controller.propose({loggedDate:date,mealType:meal,grams:Number(grams)},transport)}>{t('global_coach.photo_food_review')}</button></>:null}
  {state.pending&&<p role="status">{t('global_coach.pending')}</p>}{state.error&&!state.uncertain&&<p role="status">{t('global_coach.photo_food_error')}</p>}
 </section>;
}
