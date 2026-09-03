// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const benchActivations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front' },
  { id: 'rotator-cuff', label: 'Rotator cuff', role: 'stabilizer', view: 'back' },
];

afterEach(cleanup);

describe('MuscleAtlas', () => {
  it('selects named regions and exposes their role in text', () => {
    const onSelect = vi.fn();
    render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /pectoralis major.*primary/i }));

    expect(onSelect).toHaveBeenCalledWith('pectoralis-major');
    expect(screen.getByText('Primary')).toBeTruthy();
  });

  it('keeps an accessible front/back switch and named keyboard regions', () => {
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} />);

    const back = screen.getByRole('button', { name: /show back anatomy/i });
    fireEvent.click(back);

    expect(back.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /rotator cuff.*stabilizer/i })).toBeTruthy();
  });
});
