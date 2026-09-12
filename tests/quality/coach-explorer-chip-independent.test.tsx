// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import fixture from '@/tests/anatomy/catalogue.fixture.json';
import AnatomyExplorer from '@/components/anatomy/AnatomyExplorer';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import {I18nProvider} from '@/lib/i18n';
import {screenSelectionSnapshot} from '@/components/assistant/screen-selection';
import type {CanvasProps} from '@/components/anatomy/AtlasCanvas';
const state=vi.hoisted(()=>({path:'/dashboard/workout/atlas'}));
vi.mock('next/navigation',()=>({usePathname:()=>state.path}));
// Only GPU picking/rendering is replaced: Explorer handles the actual onPick callback.
vi.mock('next/dynamic',()=>({default:()=>function CanvasDouble(p:CanvasProps){return <button onClick={()=>p.onPick('FJ3259')}>Fixture mesh pick</button>;}}));
vi.mock('@/lib/anatomy/validation',()=>({fetchAtlasManifest:vi.fn()}));
import {fetchAtlasManifest} from '@/lib/anatomy/validation';
Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
Object.defineProperty(HTMLElement.prototype,'scrollTo',{configurable:true,value:vi.fn()});
Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});
Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});
afterEach(()=>{cleanup();vi.unstubAllEnvs();state.path='/dashboard/workout/atlas';});
async function mount(mappings:string[]){
 vi.stubEnv('NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED','1');
 const source=structuredClone(fixture);
 for(const id of mappings)Object.assign(source.concepts,{[id]:{...source.concepts.FMA24475,id,elements:['FJ3259']}});
 vi.mocked(fetchAtlasManifest).mockResolvedValueOnce(source as unknown as CanvasProps['manifest']);
 const transport=vi.fn();
 const view=render(<I18nProvider defaultLang="en"><AnatomyExplorer workout initialGroup="chest" manifestUrl="/fixture-manifest.json"/><GlobalCoach identity="fixture-actor" example={transport}/></I18nProvider>);
 await screen.findByRole('button',{name:'Fixture mesh pick'});
 fireEvent.click(screen.getByRole('button',{name:'Ask Trophē'}));
 return {view,transport};
}
it('links real Explorer controls to emitted selection and the real removable chip, then clears whole body',async()=>{
 const {transport}=await mount(['FMA13397']);
 const serratus=await screen.findByRole('button',{name:'Serratus anterior'});
 await waitFor(()=>expect((serratus as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(serratus);
 expect(screenSelectionSnapshot()?.anatomy).toMatchObject({group:'chest',subgroup:'serratus-anterior'});
 const chip=screen.getByRole('button',{name:'Remove screen selection: Serratus anterior'});expect(chip).toBeTruthy();
 fireEvent.click(chip);
 expect(screen.queryByRole('button',{name:'Remove screen selection: Serratus anterior'})).toBeNull();
 expect(screen.getByRole('button',{name:'Include this screen'})).toBeTruthy();
 expect(transport).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Include this screen'}));
 fireEvent.click(screen.getByRole('button',{name:'Groups'}));fireEvent.click(screen.getByRole('button',{name:'Whole body'}));
 expect(screenSelectionSnapshot()).toBeNull();expect(screen.getByRole('button',{name:'Remove screen selection: Muscle Atlas'})).toBeTruthy();
});
it.each([{mappings:[]},{mappings:['FMA13397','FMA34687']}])('clears emitted hint and chip when mesh callback resolves zero or multiple muscles: %j',async ({mappings})=>{
 const {transport}=await mount(mappings);
 expect(screen.getByRole('button',{name:'Remove screen selection: Chest'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Fixture mesh pick'}));
 await waitFor(()=>expect(screenSelectionSnapshot()).toBeNull());
 expect(screen.getByRole('button',{name:'Remove screen selection: Muscle Atlas'})).toBeTruthy();
 expect(transport).not.toHaveBeenCalled();
});
