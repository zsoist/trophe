import {describe,expect,it} from 'vitest';
import {photoFoodResultSchema} from './photo-food-actions';
import {readPhotoFoodResult} from './photo-food-result-reader';

const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64),evaluation={mode:'isolated_authorized_fixture',observation:'offline_fixture',visionVerified:false,paidApiCalls:0} as const;
const snapshot={version:'coach-assistant.v2',storage:'offline_fixture',ok:true,snapshot:{observationId:id,attachmentId:id,source:'offline_fixture',trust:'untrusted_image_data',reviewRequired:true,items:[{index:0,version:hash,foodName:'Rice',estimatedGrams:100,estimatedCalories:130,confidence:.7,accuracyNote:'Confirm portion.'}]}} as const;
const proposal={version:'coach-assistant.v2',storage:'database',ok:true,proposal:{id,hash,action:'food.photo.create',resource:{kind:'food_entry',id,version:hash},before:null,after:{loggedDate:'2026-09-08',mealType:'lunch',grams:150,foodName:'Rice',calories:195,proteinG:4,carbsG:42,fatG:.5,fiberG:.6,sugarG:0,confidence:.7,source:'photo_ai',nutrition:'estimated',portion:'explicit_user'},evidence:{observationId:id,observationRevision:id,attachmentId:id,imageDigest:hash,itemIndex:0,source:'validated_photo_analysis',trust:'untrusted_image_data'},precondition:hash,expiresAt:'2026-09-08T14:00:00Z',reviewRequired:true}} as const;
const receipt={version:'coach-assistant.v2',storage:'isolated_database_fixture',ok:true,evaluation,receipt:{id,actionId:id,proposalId:id,status:'applied',action:'food.photo.create',resourceVersion:'1',recordedAt:'2026-09-08T13:00:00Z'},refresh:{entryId:id,loggedDate:'2026-09-08',previousVersion:hash,version:'1',strategy:'refetch'}} as const;

describe('photo food browser result reader',()=>{
 it('matches the server schema for each result family',()=>{for(const value of [snapshot,proposal,receipt,{version:'coach-assistant.v2',storage:'database',ok:false,error:'expired'}]){expect(readPhotoFoodResult(value)).toEqual(value);expect(photoFoodResultSchema.safeParse(value).success).toBe(true);}});
 it('rejects extra, malformed and mismatched fixture data',()=>{for(const value of [{...snapshot,extra:true},{...snapshot,snapshot:{...snapshot.snapshot,items:[]}},{...proposal,proposal:{...proposal.proposal,after:{...proposal.proposal.after,grams:150.001}}},{...receipt,evaluation:undefined},{...snapshot,storage:'isolated_database_fixture'}]){expect(readPhotoFoodResult(value)).toBeNull();expect(photoFoodResultSchema.safeParse(value).success).toBe(false);}});
});
