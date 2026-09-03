// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const atlasLocale = vi.hoisted(() => ({ value: 'en' }));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: atlasLocale.value,
    t: (key: string, params?: Record<string, string | number>) => {
      const english: Record<string, string> = {
        'workout.atlas_label': 'Muscle activation atlas',
        'workout.atlas_focus_title': 'Muscle focus',
        'workout.atlas_focus_hint': 'Choose a highlighted region to inspect its role.',
        'workout.atlas_view_label': 'Anatomy view',
        'workout.atlas_front': 'Front',
        'workout.atlas_back': 'Back',
        'workout.atlas_show_front': 'Show front anatomy',
        'workout.atlas_show_back': 'Show back anatomy',
        'workout.atlas_front_map': 'Front anatomy map',
        'workout.atlas_back_map': 'Back anatomy map',
        'workout.atlas_roles_label': 'Highlighted muscle roles',
        'workout.atlas_region_label': '{muscle}, {role} muscle',
        'workout.atlas_more_highlighted': '+{n} more highlighted',
        'workout.info_primary': 'Primary',
        'workout.info_secondary': 'Secondary',
        'workout.info_stabilizer': 'Stabilizer',
        'workout.atlas_muscle_pectoralis_major': 'Pectoralis major',
        'workout.atlas_muscle_triceps_brachii': 'Triceps brachii',
        'workout.atlas_muscle_rotator_cuff': 'Rotator cuff',
        'workout.atlas_muscle_brachialis': 'Brachialis',
      };
      const spanish: Record<string, string> = {
        'workout.atlas_label': 'Atlas de activación muscular',
        'workout.atlas_focus_title': 'Enfoque muscular',
        'workout.atlas_focus_hint': 'Elige una zona destacada para ver su función.',
        'workout.atlas_view_label': 'Vista anatómica',
        'workout.atlas_front': 'Frente',
        'workout.atlas_back': 'Espalda',
        'workout.atlas_show_front': 'Mostrar anatomía frontal',
        'workout.atlas_show_back': 'Mostrar anatomía posterior',
        'workout.atlas_front_map': 'Mapa anatómico frontal',
        'workout.atlas_back_map': 'Mapa anatómico posterior',
        'workout.atlas_roles_label': 'Funciones musculares destacadas',
        'workout.atlas_region_label': '{muscle}, músculo {role}',
        'workout.atlas_more_highlighted': '+{n} más destacados',
        'workout.info_primary': 'Principal',
        'workout.info_secondary': 'Secundario',
        'workout.info_stabilizer': 'Estabilizador',
        'workout.atlas_muscle_pectoralis_major': 'Pectoral mayor',
        'workout.atlas_muscle_triceps_brachii': 'Tríceps braquial',
        'workout.atlas_muscle_rotator_cuff': 'Manguito rotador',
      };
      const copy = atlasLocale.value === 'es' ? { ...english, ...spanish } : english;
      return Object.entries(params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        copy[key] ?? key,
      );
    },
  }),
}));
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const benchActivations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front' },
  { id: 'rotator-cuff', label: 'Rotator cuff', role: 'stabilizer', view: 'back' },
];

const allActivations: MuscleActivation[] = [
  ['pectoralis-major', 'front'], ['serratus-anterior', 'front'], ['anterior-deltoid', 'front'], ['middle-deltoid', 'front'],
  ['posterior-deltoid', 'back'], ['rotator-cuff', 'back'], ['upper-trapezius', 'back'], ['lower-trapezius', 'back'],
  ['latissimus-dorsi', 'back'], ['rhomboids', 'back'], ['erector-spinae', 'back'], ['biceps-brachii', 'front'],
  ['triceps-brachii', 'back'], ['brachialis', 'front'], ['forearm-flexors', 'front'], ['forearm-extensors', 'back'],
  ['rectus-abdominis', 'front'], ['obliques', 'front'], ['gluteus-maximus', 'back'], ['gluteus-medius', 'back'],
  ['quadriceps', 'front'], ['hamstrings', 'back'], ['adductors', 'front'], ['gastrocnemius', 'back'], ['soleus', 'back'],
  ['tibialis-anterior', 'front'],
].map(([id, view]) => ({ id, label: id, role: 'primary', view } as MuscleActivation));

afterEach(() => {
  cleanup();
  atlasLocale.value = 'en';
});

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

  it('derives the compact back legend and summary from back-visible activations only', () => {
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} homeCompact />);

    fireEvent.click(screen.getByRole('button', { name: 'Show back anatomy' }));

    const roles = screen.getByRole('list', { name: 'Highlighted muscle roles' });
    expect(roles.textContent).toContain('Rotator cuff');
    expect(roles.textContent).not.toContain('Pectoralis major');
    expect(roles.textContent).not.toContain('+2 more highlighted');
  });

  it('localizes atlas names, view controls, roles, summaries, and aria copy', () => {
    atlasLocale.value = 'es';
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} homeCompact />);

    expect(screen.getByRole('region', { name: 'Atlas de activación muscular' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pectoral mayor, músculo Principal/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar anatomía posterior' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Funciones musculares destacadas' }).textContent).toContain('Pectoral mayor');
    expect(document.body.textContent).not.toMatch(/\b(?:Front|Back|Primary|Pectoralis|highlighted)\b/);
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

  it('keeps every rendered 44px target fully inside the atlas viewport', () => {
    render(<MuscleAtlas activations={allActivations} selected={null} onSelect={vi.fn()} />);

    for (const view of ['front', 'back'] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Show ${view} anatomy` }));
      const svg = screen.getByRole('group', { name: `${view === 'front' ? 'Front' : 'Back'} anatomy map` });
      const [, , viewBoxWidth, viewBoxHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      const renderedHeight = 296;

      for (const hitTarget of screen.getAllByTestId(/^atlas-hit-/)) {
        const centerX = Number(hitTarget.getAttribute('cx'));
        const centerY = Number(hitTarget.getAttribute('cy'));
        const radius = Number(hitTarget.getAttribute('r'));
        expect(centerX - radius).toBeGreaterThanOrEqual(0);
        expect(centerX + radius).toBeLessThanOrEqual(viewBoxWidth);
        expect(centerY - radius).toBeGreaterThanOrEqual(0);
        expect(centerY + radius).toBeLessThanOrEqual(viewBoxHeight);
        expect((radius * 2 * renderedHeight) / viewBoxHeight).toBeGreaterThanOrEqual(44);
      }
      expect(svg.getAttribute('height')).toBe(String(renderedHeight));
    }
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
