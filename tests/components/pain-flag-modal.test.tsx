// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
  useReducedMotion: () => true,
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'painflag.title': 'Report pain', 'painflag.body_part_placeholder': 'Body part',
  'painflag.exercise': 'Exercise', 'painflag.body_part_label': 'Body region',
  'painflag.coach_disclosure': 'This note is shared with your coach.',
  'painflag.severity_prefix': 'Severity', 'painflag.severity_mild': 'Mild', 'painflag.severity_moderate': 'Moderate', 'painflag.severity_stop': 'Stop', 'painflag.notes_placeholder': 'Notes',
  'painflag.notes_label': 'Notes', 'painflag.cancel': 'Cancel', 'painflag.save': 'Save pain note', 'painflag.saving': 'Saving…',
  'painflag.save_failed': 'Pain note could not be saved. Try again.',
  'painflag.region_biceps': 'Biceps area', 'painflag.region_prompt': 'Choose a body region',
}[key] ?? key) }) }));

import PainFlagModal from '@/components/workout/PainFlagModal';

afterEach(cleanup);

describe('PainFlagModal durable save', () => {
  it('identifies the exercise and uses native severity radios with coach visibility disclosure', () => {
    render(<PainFlagModal exerciseId="bench" exerciseName="Bench Press" suggestedBodyPart="Shoulder" onSave={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Report pain' })).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect((screen.getByLabelText('Body region') as HTMLInputElement).value).toBe('Shoulder');
    expect(screen.getByRole('radio', { name: '1 Mild' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '2' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '3 Moderate' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '4' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '5 Stop' })).toBeTruthy();
    expect(screen.getByText('This note is shared with your coach.')).toBeTruthy();
    expect(screen.getByRole('dialog').className).toContain('workout-dialog');
    expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-2rem)]');

    fireEvent.change(screen.getByLabelText('Body region'), { target: { value: 'Elbow' } });
    expect((screen.getByLabelText('Body region') as HTMLInputElement).value).toBe('Elbow');
  });

  it('retains input and stays open with retry feedback when save fails', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onClose = vi.fn();
    render(<PainFlagModal exerciseId="bench" onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Body part'), { target: { value: 'Shoulder' } });
    fireEvent.change(screen.getByPlaceholderText('Notes'), { target: { value: 'Pinch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pain note' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Pain note could not be saved. Try again.');
    expect((screen.getByPlaceholderText('Body part') as HTMLInputElement).value).toBe('Shoulder');
    expect((screen.getByPlaceholderText('Notes') as HTMLTextAreaElement).value).toBe('Pinch');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save pain note' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(onSave.mock.calls[1][1]).toBe(onSave.mock.calls[0][1]);
  });

  it('closes only after a verified save', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<PainFlagModal exerciseId="bench" onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Body part'), { target: { value: 'Shoulder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pain note' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('turns muscle-group tokens into human anatomical suggestions and never exposes generic tokens', () => {
    render(<PainFlagModal exerciseId="curl" exerciseName="Curl" suggestedBodyPart="biceps" onSave={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Body region') as HTMLInputElement).value).toBe('Biceps area');

    cleanup();
    render(<PainFlagModal exerciseId="bike" exerciseName="Bike" suggestedBodyPart="cardio" onSave={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Body region') as HTMLInputElement).value).toBe('Choose a body region');
    expect(screen.queryByDisplayValue('cardio')).toBeNull();
  });
});
