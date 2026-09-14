import { describe, expect, it } from 'vitest';
import { evidenceMatchesScope, selectConversationScope } from './conversation-scope';
import type { CoachConversationRequest } from './contracts';
const base:CoachConversationRequest={version:'coach-assistant.v2',conversationId:'fixture',turnId:'fixture',message:'',context:{surface:'food',includeScreen:true},history:[{role:'user',text:'Show my workout today'}]};
describe('explicit conversation domain precedence',()=>{
  it.each(['lunch','breakfast','dinner','snack','almuerzo','desayuno','cena','merienda'])('new %s question wins over workout history',meal=>{
    expect(selectConversationScope({...base,message:`What about ${meal}?`})).toMatchObject({domain:'food',intent:'today'});
  });
  it('keeps both domains when explicitly requested in the new message',()=>{
    expect(selectConversationScope({...base,message:'What about lunch and workout?'}).domain).toBe('both');
  });
  it('uses prior domain only for a follow-up without a new explicit domain',()=>{
    expect(selectConversationScope({...base,message:'What about today?'}).domain).toBe('workout');
  });
  it('keeps Progress as its own context instead of inheriting Food or Workout history',()=>{
    const selected=selectConversationScope({...base,message:'¿Y aquí?',context:{surface:'progress',includeScreen:true},history:[{role:'user',text:'Muéstrame la comida'},{role:'assistant',text:'Revisa tus datos'},{role:'user',text:'Ahora el entrenamiento'}]});
    expect(selected.domain).toBe('progress');
    expect(['nutrition','workout','plan','exercise'].some(source=>evidenceMatchesScope(source as 'nutrition'|'workout'|'plan'|'exercise',selected.domain))).toBe(false);
  });
});
