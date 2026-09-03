// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const atlasLocale = vi.hoisted(() => ({ value: 'en' }));

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  const [{ de }, { fr }, { it }, { nl }, { pt }] = await Promise.all([
    import('@/lib/locales/de'),
    import('@/lib/locales/fr'),
    import('@/lib/locales/it'),
    import('@/lib/locales/nl'),
    import('@/lib/locales/pt'),
  ]);
  const overlays: Record<string, Record<string, string>> = { de, fr, it, nl, pt };
  return {
    ...actual,
    useI18n: () => ({
      lang: atlasLocale.value,
      t: (key: string, params?: Record<string, string | number>) => {
        const language = atlasLocale.value;
        const core = language === 'en' || language === 'es' || language === 'el' ? language : null;
        const source = (core ? actual.translations[key]?.[core] : overlays[language]?.[key]) ?? actual.translations[key]?.en ?? key;
        return Object.entries(params ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          source,
        );
      },
    }),
  };
});
import { MuscleAtlas } from '@/components/workout/MuscleAtlas';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const benchActivations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front' },
  { id: 'rotator-cuff', label: 'Rotator cuff', role: 'stabilizer', view: 'back' },
];

const ariaRoleActivations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front' },
  { id: 'brachialis', label: 'Brachialis', role: 'stabilizer', view: 'front' },
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
    expect(screen.getByRole('button', { name: /Pectoral mayor, músculo principal/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tríceps braquial, músculo secundario' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar anatomía posterior' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Funciones musculares destacadas' }).textContent).toContain('Pectoral mayor');
    expect(document.body.textContent).not.toMatch(/\b(?:Front|Back|Primary|Pectoralis|highlighted)\b/);
  });

  it.each([
    ['en', ['Pectoralis major, Primary muscle', 'Triceps brachii, Secondary muscle', 'Brachialis, Stabilizer muscle']],
    ['es', ['Pectoral mayor, músculo principal', 'Tríceps braquial, músculo secundario', 'Braquial, músculo estabilizador']],
    ['el', ['Μείζων θωρακικός, Κύριος μυς', 'Τρικέφαλος βραχιόνιος, Δευτερεύων μυς', 'Βραχιόνιος, Σταθεροποιητικός μυς']],
    ['de', ['Großer Brustmuskel, Primärer Muskel', 'Trizeps, Sekundärer Muskel', 'Armbeuger, Stabilisierender Muskel']],
    ['fr', ['Grand pectoral, muscle principal', 'Triceps brachial, muscle secondaire', 'Brachial, muscle stabilisateur']],
    ['it', ['Grande pettorale, muscolo principale', 'Tricipite brachiale, muscolo secondario', 'Brachiale, muscolo stabilizzatore']],
    ['nl', ['Grote borstspier, Primaire spier', 'Triceps, Secundaire spier', 'Brachialis, Stabiliserende spier']],
    ['pt', ['Peitoral maior, músculo principal', 'Tríceps braquial, músculo secundário', 'Braquial, músculo estabilizador']],
  ])('composes grammatically complete %s region aria labels for every role', (locale, expectedLabels) => {
    atlasLocale.value = locale;
    render(<MuscleAtlas activations={ariaRoleActivations} selected={null} onSelect={vi.fn()} />);

    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
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
