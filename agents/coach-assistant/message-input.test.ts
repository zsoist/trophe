import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coachMessageInputSchema } from './message-input';
import { requestSchema } from './schema';
import { prepareReviewedVoiceMessage, type CoachVoiceResult } from './voice-contract';
import { COACH_AUDIO_LIMITS } from './voice-capture';
import { readFileSync } from 'node:fs';

// Frozen prior rule: protects raw-length-before-normalization and exact control-character handling.
const original = z.string().min(1).max(2000).transform(value =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
  .pipe(z.string().min(1));
const scope = { actorId:'actor', organizationId:'org', conversationId:'conversation' };
const result:CoachVoiceResult = {version:'coach-assistant.voice.v1',ok:true,status:'review_required',scope,turnId:'turn',transcript:{text:'original',locale:'es',languages:['es'],source:'synthetic_fixture',trust:'untrusted_transcript'},review:{token:'fixture',expiresAt:new Date(Date.now()+1000).toISOString(),editable:true,audioRetention:'discarded_after_transcription'},durationMs:100};
describe('shared message validation and isolated capture imports',()=>{
  it('preserves the original validator in requests and reviewed transcripts',()=>{
    expect(requestSchema.shape.message).toBe(coachMessageInputSchema);
    const inputs:unknown[] = ['', ' ', '\u0000\u007f', '  hola\u0000 mundo  ', 'a\tb\nc\rd', 'x'.repeat(2000), 'x'.repeat(2001), ' '+ 'x'.repeat(2000), 'x'.repeat(2000)+'\u0000', null, 12];
    for(let code=0;code<=127;code++)inputs.push(`a${String.fromCharCode(code)}b`);
    for(const input of inputs){
      const expected=original.safeParse(input);const actual=coachMessageInputSchema.safeParse(input);
      expect(actual.success).toBe(expected.success);
      if(expected.success&&actual.success)expect(actual.data).toBe(expected.data);
      if(typeof input==='string')expect(prepareReviewedVoiceMessage(result,scope,input,true)).toEqual(expected.success?{ok:true,message:expected.data}:{ok:false,error:'invalid_input'});
    }
    expect(prepareReviewedVoiceMessage(result,scope,'valid',false)).toEqual({ok:false,error:'review_required'});
    expect(prepareReviewedVoiceMessage(result,{...scope,organizationId:'other'},'valid',true)).toEqual({ok:false,error:'forbidden'});
  });
  it('keeps capture on the standalone microphone module without schema or workspace dependencies',()=>{
    expect(COACH_AUDIO_LIMITS).toEqual({durationMs:30000,fileBytes:2097152});
    const capture=readFileSync(new URL('./voice-capture.ts',import.meta.url),'utf8');
    expect(capture.match(/from ['"][^'"]+['"]/g)).toEqual(["from '@/lib/microphone/recording-session'"]);
    const microphone=readFileSync(new URL('../../lib/microphone/recording-session.ts',import.meta.url),'utf8');
    expect(microphone).not.toMatch(/\bimport\s|\brequire\(/);
    const review=readFileSync(new URL('./voice-contract.ts',import.meta.url),'utf8');
    expect(review).not.toMatch(/from ['"]\.\/schema['"]/);
  });
});
