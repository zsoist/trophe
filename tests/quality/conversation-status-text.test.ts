import {expect,it} from 'vitest';
import {conversationStatusText} from '@/components/assistant/conversation-status-text';
it('uses Spanish for the failed question despite an English account',()=>expect(conversationStatusText('global_coach.failed','Qué debería comer de cenar','en')).toMatch(/^No se pudo/));
it('uses Greek for Greek input',()=>expect(conversationStatusText('global_coach.failed','Τι να φάω','en')).toMatch(/^Το αίτημα/));
it('keeps English and uses account language for ambiguous input',()=>{
 expect(conversationStatusText('global_coach.failed','What should I eat','es')).toMatch(/^This request/);
 expect(conversationStatusText('global_coach.failed','ok','es')).toMatch(/^No se pudo/);
});
