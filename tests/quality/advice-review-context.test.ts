import {expect,it} from 'vitest';
import {suggestedMeal} from '@/components/assistant/suggested-meal';
import {conversationLanguage} from '@/agents/coach-assistant/nutrition-intent';
it('preserves dinner through neutral choice and protein followups',()=>expect(suggestedMeal(['Qué debería comer de cenar','Dame sugerencias con proteína','Mi perfil','Prefiero carne','La 1'])).toBe('dinner'));
it('uses latest explicit meal and does not guess ambiguous meals',()=>{
 expect(suggestedMeal(['Dinner','For breakfast','La 1'])).toBe('breakfast');
 expect(suggestedMeal(['dinner','Breakfast or lunch','La 1'])).toBeUndefined();
 expect(suggestedMeal(['La 1'])).toBeUndefined();
});
it('keeps the conversation language on neutral selection, while accepting explicit language switches',()=>{
 const history=[{role:'user' as const,text:'Dame sugerencias con proteína'}];
 expect(conversationLanguage('La 1','en',history)).toBe('es');
 expect(conversationLanguage('What about dinner?','es',history)).toBe('en');
});
