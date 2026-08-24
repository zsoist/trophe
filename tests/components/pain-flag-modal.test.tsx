// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
  useReducedMotion: () => true,
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'painflag.title': 'Pain flag', 'painflag.body_part_placeholder': 'Body part',
  'painflag.severity_prefix': 'Severity', 'painflag.notes_placeholder': 'Notes',
  'painflag.cancel': 'Cancel', 'painflag.save': 'Save', 'painflag.saving': 'Saving…',
  'painflag.save_failed': 'Pain note could not be saved. Try again.',
}[key] ?? key) }) }));

import PainFlagModal from '@/components/workout/PainFlagModal';

afterEach(cleanup);

describe('PainFlagModal durable save', () => {
  it('retains input and stays open with retry feedback when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(<PainFlagModal exerciseId="bench" onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Body part'), { target: { value: 'Shoulder' } });
    fireEvent.change(screen.getByPlaceholderText('Notes'), { target: { value: 'Pinch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Pain note could not be saved. Try again.');
    expect((screen.getByPlaceholderText('Body part') as HTMLInputElement).value).toBe('Shoulder');
    expect((screen.getByPlaceholderText('Notes') as HTMLTextAreaElement).value).toBe('Pinch');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes only after a verified save', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<PainFlagModal exerciseId="bench" onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Body part'), { target: { value: 'Shoulder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
