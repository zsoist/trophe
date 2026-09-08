import { describe,it,expect } from 'vitest';
import { z } from 'zod';
import { parseClientMessageBody } from '../lib/chat/client-message-contract';
import { insertReviewedClientMessage } from '../lib/chat/client-message-service';
import { PgDialect } from 'drizzle-orm/pg-core';
describe('prepared shared client message writer',()=>{
 it('preserves existing route validation, including trim-before-length and controls',()=>{
 const original=z.object({message:z.string().trim().min(1).max(2000)}).strict();
 for(const message of ['', ' ', ' x ', 'x'.repeat(2000)+' ', 'x'.repeat(2001), '\u0000ok', null]){const expected=original.safeParse({message});if(expected.success)expect(parseClientMessageBody({message})).toEqual(expected.data);else expect(()=>parseClientMessageBody({message})).toThrow();}
 });
 it('binds message identity, exact body, recipient, self and org without attachments',async()=>{
 let query:ReturnType<PgDialect['sqlToQuery']>|undefined;
 const tx={execute:async(q:Parameters<PgDialect['sqlToQuery']>[0])=>{query=new PgDialect().sqlToQuery(q);return {rows:[{id:'message'}]};}} as unknown as Parameters<typeof insertReviewedClientMessage>[0];
 const input={messageId:'message',actorId:'self',subjectId:'self',organizationId:'org',coachId:'coach',message:'Exact'};
 expect(await insertReviewedClientMessage(tx,input)).toEqual({messageId:'message',status:'stored'});expect(query!.params).toEqual(['message','Exact','self','coach','org']);expect(query!.sql).not.toContain('attachment');await expect(insertReviewedClientMessage(tx,{...input,message:' Exact '})).rejects.toThrow('invalid_input');
 });
});
