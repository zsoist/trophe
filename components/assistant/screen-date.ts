'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export interface CoachScreenDate { path:string; date:string }
let current:CoachScreenDate|null=null;
let owner:symbol|null=null;
const listeners=new Set<()=>void>();
export const subscribeScreenDate=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const screenDateSnapshot=()=>current;
export const emptyScreenDate=()=>null;
export function publishScreenDate(value:CoachScreenDate|null){
  const token=Symbol();owner=token;current=value?structuredClone(value):null;listeners.forEach(listener=>listener());
  return()=>{if(owner!==token)return;owner=null;current=null;listeners.forEach(listener=>listener());};
}
export function acceptedScreenDate(value:CoachScreenDate|null,path:string){return value?.path===path?value.date:null;}
export function useCoachScreenDate(date:string){
  const path=usePathname();
  useEffect(()=>publishScreenDate({path,date}),[date,path]);
}
