import { z } from 'zod';
/** Exact existing /api/client/message validation: trim BEFORE min/max. */
export const clientMessageBodySchema=z.object({message:z.string().trim().min(1).max(2000)}).strict();
export const parseClientMessageBody=(value:unknown)=>clientMessageBodySchema.parse(value);
