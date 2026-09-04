// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MuscleActivation } from '@/lib/workout/anatomy';

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: 'es',
      t: (key: string, params?: Record<string, string | number>) => {
        const source = actual.translations[key]?.es ?? actual.translations[key]?.en ?? key;
        return Object.entries(params ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          source,
        );
      },
    }),
  };
});

import { WorkoutAtlasHome } from '@/components/workout/workspace/WorkoutAtlasHome';

const activations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front', confidence: 'curated' },
];

afterEach(cleanup);

describe('WorkoutAtlasHome localization', () => {
  it('uses production locale copy for the heading, anatomy names, roles, and selected status', () => {
    render(<WorkoutAtlasHome activations={activations} targetLabel="Pecho" />);

    expect(screen.getByRole('heading', { name: 'Objetivo de hoy' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Pectoral mayor · Objetivo principal');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar anatomía posterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tríceps braquial, músculo secundario' }));
    expect(screen.getByRole('status').textContent).toBe('Tríceps braquial · Objetivo de apoyo');
    expect(document.body.textContent).not.toMatch(/Today|Pectoralis|Primary target|Supporting target/);
  });

  it('localizes the cardio empty state instead of accepting English consumer copy', () => {
    render(<WorkoutAtlasHome activations={[]} targetLabel="Sesión de cardio · sin objetivo muscular" emptyState="cardio" />);

    expect(screen.getByText('El cardio se registra por actividad, duración, distancia y esfuerzo.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Add strength exercises|Cardio is tracked/);
  });
});
