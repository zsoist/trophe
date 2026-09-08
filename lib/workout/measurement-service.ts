import { z } from 'zod';
import type { db } from '@/db/client';
import { measurements } from '@/db/schema/measurements';

type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
const positiveReal=z.number().finite().positive().refine(value=>Number.isFinite(Math.fround(value))&&Math.fround(value)>0,'Outside PostgreSQL real representation');
/** Explicit canonical units only. No coercion, date/default inference, notes or image values. */
export const measurementValuesSchema=z.object({
 measuredDate:z.string().date(),weightKg:positiveReal,
 bodyFatPct:z.number().finite().min(0).max(100).refine(value=>value===0||Math.fround(value)>0,'Outside PostgreSQL real representation').nullable(),waistCm:positiveReal.nullable(),
}).strict();
export const parseMeasurementValues=(input:unknown)=>measurementValuesSchema.parse(input);
/** The caller authenticates and owns the transaction, CAS, review and receipt.
 * Never opens/commits another transaction or overwrites an existing measurement.
 */
export async function insertReviewedMeasurement(tx:Transaction,identity:{id:string;ownerUserId:string},input:unknown){
 const ids=z.object({id:z.string().uuid(),ownerUserId:z.string().uuid()}).strict().parse(identity);
 const values=parseMeasurementValues(input);
 const [created]=await tx.insert(measurements).values({id:ids.id,userId:ids.ownerUserId,...values}).returning();
 if(!created)throw new Error('measurement_insert_missing');
 return created;
}
