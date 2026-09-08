// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@/components/shared/Providers', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/lib/trpc/provider', () => ({ TRPCProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/shared/AppHeader', () => ({ AppHeader: () => <header /> }));
vi.mock('@/components/shared/FeedbackWidget', () => ({ default: () => null }));
vi.mock('@/components/assistant/GlobalCoachEntry', () => ({ GlobalCoachEntry: ({ professional }: { professional?: boolean }) => <button data-testid="professional-coach-entry">{String(professional)}</button> }));

it('mounts exactly one professional Ask Trophē entry from the shared coach layout', async () => {
 const { default: CoachLayout } = await import('@/app/coach/layout');
 render(<CoachLayout><main>Coach route</main></CoachLayout>);
 expect(screen.getAllByTestId('professional-coach-entry')).toHaveLength(1);
 expect(screen.getByTestId('professional-coach-entry').textContent).toBe('true');
});
