import { describe, expect, it } from 'vitest';
import { selectConversationScope } from './conversation-scope';
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
});
