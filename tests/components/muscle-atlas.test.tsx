// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('does not select on focus, but selects on Enter, Space, and click', () => {
    const onSelect = vi.fn();
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={onSelect} />);
    const pectoralis = screen.getByRole('button', { name: /pectoralis major.*primary/i });

    fireEvent.focus(pectoralis);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(pectoralis, { key: 'Enter' });
    fireEvent.keyDown(pectoralis, { key: ' ' });
    fireEvent.click(pectoralis);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'pectoralis-major');
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('gives small muscle regions transparent 44px-equivalent hit geometry', () => {
    render(<MuscleAtlas activations={[{ id: 'brachialis', label: 'Brachialis', role: 'secondary', view: 'front' }]} selected={null} onSelect={vi.fn()} />);
    const hitTarget = screen.getByTestId('atlas-hit-brachialis');

    expect(hitTarget.getAttribute('r')).toBe('23');
    expect(hitTarget.getAttribute('data-min-hit-target')).toBe('44');
  });

  it('changes to the selected muscle view when controlled selection crosses sides', async () => {
    const { rerender } = render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={vi.fn()} />);

    rerender(<MuscleAtlas activations={benchActivations} selected="rotator-cuff" onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /show back anatomy/i }).getAttribute('aria-pressed')).toBe('true');
    });
  });
});
