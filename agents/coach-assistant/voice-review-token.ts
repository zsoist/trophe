import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {CoachVoiceScope} from './voice-contract';

const secret=randomBytes(32),uuid=z.string().uuid();
const payloadSchema=z.object({actorId:uuid,organizationId:uuid,conversationId:uuid,turnId:uuid,locale:z.string().min(2).max(16),transcriptHash:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.number().int().positive()}).strict();
type Payload=z.infer<typeof payloadSchema>;
export const voiceTranscriptHash=(text:string)=>createHash('sha256').update(text).digest('hex');
const signature=(encoded:string)=>createHmac('sha256',secret).update(encoded).digest();

/** Ephemeral process-bound proof. It stores no audio or transcript server-side. */
export function issueVoiceReviewToken(input:CoachVoiceScope&{turnId:string;locale:string;transcript:string},now=Date.now()):{token:string;expiresAt:string}{
 const payload:Payload={actorId:input.actorId,organizationId:input.organizationId,conversationId:input.conversationId,turnId:input.turnId,locale:input.locale,transcriptHash:voiceTranscriptHash(input.transcript),expiresAt:now+5*60_000};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'),mac=signature(encoded).toString('base64url');
 return {token:`${encoded}.${mac}`,expiresAt:new Date(payload.expiresAt).toISOString()};
}
export function verifyVoiceReviewToken(token:string,expected:CoachVoiceScope&{turnId:string;locale:string;transcript:string},now=Date.now()):boolean{
 const [encoded,rawMac,...extra]=token.split('.');if(!encoded||!rawMac||extra.length)return false;
 let supplied:Buffer,payload:Payload;try{supplied=Buffer.from(rawMac,'base64url');payload=payloadSchema.parse(JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')));}catch{return false;}
 const mac=signature(encoded);if(supplied.length!==mac.length||!timingSafeEqual(supplied,mac)||payload.expiresAt<=now)return false;
 return payload.actorId===expected.actorId&&payload.organizationId===expected.organizationId&&payload.conversationId===expected.conversationId&&payload.turnId===expected.turnId&&payload.locale===expected.locale&&payload.transcriptHash===voiceTranscriptHash(expected.transcript);
}
