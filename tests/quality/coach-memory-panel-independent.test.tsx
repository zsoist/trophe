// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,fireEvent,screen} from '@testing-library/react';
import {MemoryPanel} from '@/components/assistant/MemoryPanel';
import {MemoryController,type MemoryState} from '@/components/assistant/memory-state';
vi.mock('@/components/assistant/useGlobalCoachI18n',()=>({useGlobalCoachI18n:()=>({t:(s:string)=>s})}));
it('clears the old correction target after receipt and refreshed memory arrive',()=>{
 const card={id:'22222222-2222-4222-8222-222222222222',text:'Morning',version:'0',conversationId:'11111111-1111-4111-8111-111111111111',createdAt:new Date().toISOString(),confirmation:'confirmed' as const,source:'user_input' as const,retention:'persistent' as const};
 const controller=new MemoryController(card.conversationId);
 const state:MemoryState={memories:[card],loaded:true,proposal:null,receipt:null,pending:false,uncertain:false,error:null};
 const transport=vi.fn();const view=render(<MemoryPanel controller={controller} state={state} transport={transport}/>);
 fireEvent.click(screen.getByRole('button',{name:'global_coach.memory_correct'}));
 view.rerender(<MemoryPanel controller={controller} transport={transport} state={{...state,memories:[{...card,version:'1',text:'Evening'}],receipt:{id:card.id,actionId:card.id,proposalId:card.id,status:'applied',resourceVersion:'1',recordedAt:card.createdAt}}}/>);
 expect(screen.queryByLabelText('global_coach.memory_text')).toBeNull();
 expect((screen.getByLabelText('global_coach.memory_new') as HTMLTextAreaElement).value).toBe('');
});
