// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import {I18nProvider} from '@/lib/i18n';
import type {CoachVoiceResult} from '@/agents/coach-assistant/voice-contract';
import type {ReviewedVoiceTransport} from '@/components/assistant/voice-client';
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard'}));
let deliver: (result: Extract<CoachVoiceResult,{ok:true}>)=>void;
vi.mock('@/components/assistant/VoiceCapture',()=>({VoiceCapture:(props:{onTranscript:typeof deliver})=>{deliver=props.onTranscript;return null;}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses one editable composer and a single reviewed voice request with the original proof turn ID',async()=>{
 window.scrollTo=vi.fn(); HTMLElement.prototype.scrollTo=vi.fn();
 const transport=vi.fn<ReviewedVoiceTransport>(async input=>({ok:true,status:'answered',transcript:{...input.voice.transcript,text:input.editedText,trust:'untrusted_user_reviewed_data'},speech:null,response:{version:'coach-assistant.v2',conversationId:input.request.conversationId,turnId:input.request.turnId,ok:true,evidence:[],output:{answer:'Answer',limitations:[],evidenceRefs:[]}}} as unknown as Awaited<ReturnType<ReviewedVoiceTransport>>));
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} example={vi.fn()} reviewedVoiceTransport={transport}/></I18nProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Ask Trophē'}));
 const id=crypto.randomUUID();
 const {act}=await import('@testing-library/react');
 act(()=>deliver({version:'coach-assistant.voice.v1',ok:true,status:'review_required',scope:{actorId:'actor',organizationId:'org',conversationId:'fixture'},turnId:id,transcript:{text:'Lunch ideas',locale:'en',languages:['en'],source:'synthetic_fixture',trust:'untrusted_transcript'},review:{token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString(),editable:true,audioRetention:'discarded_after_transcription'},durationMs:1000}));
 expect(screen.getAllByRole('textbox')).toHaveLength(1);
 expect(transport).not.toHaveBeenCalled();
 const textbox=screen.getByRole('textbox',{name:'Your question'});
 fireEvent.change(textbox,{target:{value:'Lunch with more protein'}});
 fireEvent.submit(textbox.closest('form')!);fireEvent.submit(textbox.closest('form')!);
 await waitFor(()=>expect(transport).toHaveBeenCalledTimes(1));
 expect(transport.mock.calls[0][0]).toMatchObject({editedText:'Lunch with more protein',reviewed:true,request:{turnId:id}});
});
it('locks the underlying page and restores its exact position and inline styles on close',()=>{
 const scroll=vi.fn();window.scrollTo=scroll;
 Object.defineProperty(window,'scrollY',{configurable:true,value:380});
 document.body.style.overflow='auto';
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} example={vi.fn()}/></I18nProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Ask Trophē'}));
 expect(document.body.style.position).toBe('fixed');expect(document.body.style.top).toBe('-380px');
 expect(document.activeElement).toBe(screen.getByRole('dialog'));
 fireEvent.click(screen.getByRole('button',{name:'Close Ask Trophē'}));
 expect(document.body.style.position).toBe('');expect(document.body.style.overflow).toBe('auto');
 expect(scroll).toHaveBeenCalledWith({left:0,top:380,behavior:'instant'});
});

it('does not send a transcript through ordinary conversation when reviewed voice is unavailable',async()=>{
 window.scrollTo=vi.fn(); HTMLElement.prototype.scrollTo=vi.fn();
 const ordinary=vi.fn();
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} example={ordinary}/></I18nProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Ask Trophē'}));
 const {act}=await import('@testing-library/react');
 act(()=>deliver({version:'coach-assistant.voice.v1',ok:true,status:'review_required',scope:{actorId:'actor',organizationId:'org',conversationId:'fixture'},turnId:crypto.randomUUID(),transcript:{text:'Lunch ideas',locale:'en',languages:['en'],source:'synthetic_fixture',trust:'untrusted_transcript'},review:{token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString(),editable:true,audioRetention:'discarded_after_transcription'},durationMs:1000}));
 expect((screen.getByRole('textbox',{name:'Your question'}) as HTMLTextAreaElement).value).toBe('');
 expect(screen.getByRole('alert')).toBeTruthy();
 fireEvent.submit(screen.getByRole('textbox',{name:'Your question'}).closest('form')!);
 expect(ordinary).not.toHaveBeenCalled();
});
