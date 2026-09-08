'use client';
import { createContext } from 'react';
import type { AuthoredSupplement } from '@/lib/anatomy/authored';
/** Explicit review source; absent on product routes until the public release gate opens. */
export const WorkoutAnatomySource = createContext<{ manifestUrl: string; authoredSupplement?: AuthoredSupplement } | null>(null);
