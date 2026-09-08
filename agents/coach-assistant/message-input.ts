import { z } from 'zod';

/** Shared request and reviewed-transcript validation; raw length is checked before sanitizing. */
export const coachMessageInputSchema = z.string().min(1).max(2000).transform(value =>
    value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .pipe(z.string().min(1));
