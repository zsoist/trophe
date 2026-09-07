/** Private composition of the production manual Food input. No account client. */
import { useSyncExternalStore } from 'react';
import QuickFoodInput from '../../../components/food/QuickFoodInput';
import { useGlobalCoachI18n } from '../../../components/assistant/useGlobalCoachI18n';
import { localToday } from '../../../lib/utils/dates';
import { REVIEW_USER } from './store';
import { subscribeFood, exampleFoodRows } from './food-store';
export function PrivateFood() {
  const { t } = useGlobalCoachI18n();
  const foods = useSyncExternalStore(subscribeFood, exampleFoodRows, exampleFoodRows);
  return <main className="mx-auto max-w-2xl space-y-6 px-4 pb-8 pt-6">
    <h1 className="text-2xl font-bold">{t('global_coach.food')}</h1>
    <p className="text-sm text-[var(--text-secondary)]">{t('global_coach.food_preview')}</p>
    <QuickFoodInput userId={REVIEW_USER} mealType="lunch" date={localToday()} manualOnly showCalories onLogged={() => {}} onSearchMode={() => {}} />
    {foods.length > 0 && <section aria-label={t('global_coach.food')} className="divide-y divide-[var(--border-default)]">{foods.map(food => <p key={food.id} className="py-3">{food.food_name}<span className="block text-sm text-[var(--text-secondary)]">{food.calories} kcal · {food.protein_g} g {t('general.protein')}</span></p>)}</section>}
  </main>;
}
