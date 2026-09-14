import { expect,it } from 'vitest';
import { nutritionIntent,conversationLanguage } from './nutrition-intent';
import { selectConversationScope } from './conversation-scope';
it.each(['Qué debería comer de cenar','Dame sugerencias con proteína','Con lo que me conoces de mi perfil','Qué puedo comer','Recomiéndame una cena','Ideas para desayunar','What should I eat for dinner?','Give me protein suggestions','With my profile, suggest dinner','Opciones para cenar'])('routes advice without a food parse: %s',message=>{expect(nutritionIntent({message})).toBe('advise');});
it('preserves four-turn dinner, protein, profile, meat context without adopting it as records',()=>{
 const history=['Qué debería comer de cenar','Dame sugerencias con proteína','Con lo que me conoces de mi perfil'].map(text=>({role:'user' as const,text}));
 expect(nutritionIntent({message:'Con carne',history})).toBe('advise');
 expect(selectConversationScope({version:'coach-assistant.v2',conversationId:'a',turnId:'b',message:'Con carne',history})).toMatchObject({domain:'food',intent:'today'});
 expect(nutritionIntent({message:'How many calories in 150 g chicken?',history})).toBe('analyze');
 expect(nutritionIntent({message:'I ate chicken',history})).toBe('log');
 expect(nutritionIntent({message:'What is the weather?',history})).toBe('chat');
});
it('uses the latest language over profile language',()=>{expect(conversationLanguage('Dame sugerencias con proteína','en')).toBe('es');expect(conversationLanguage('What should I eat?','es')).toBe('en');expect(conversationLanguage('Τι να φάω για βραδινό;','en')).toBe('el');expect(nutritionIntent({message:'Τι να φάω για βραδινό;'})).toBe('advise');});
