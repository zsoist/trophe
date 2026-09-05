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
import { ATLAS_GEOMETRY } from '@/lib/workout/atlas-geometry';
import type { MuscleActivation } from '@/lib/workout/anatomy';

const benchActivations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
  { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'back', confidence: 'curated' },
  { id: 'rotator-cuff', label: 'Rotator cuff', role: 'stabilizer', view: 'back', confidence: 'curated' },
];

const ariaRoleActivations: MuscleActivation[] = [
  { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front', confidence: 'curated' },
  { id: 'middle-deltoid', label: 'Middle deltoid', role: 'secondary', view: 'front', confidence: 'curated' },
  { id: 'brachialis', label: 'Brachialis', role: 'stabilizer', view: 'front', confidence: 'curated' },
];

const allActivations: MuscleActivation[] = [
  ['pectoralis-major', 'front'], ['serratus-anterior', 'front'], ['anterior-deltoid', 'front'], ['middle-deltoid', 'front'],
  ['posterior-deltoid', 'back'], ['rotator-cuff', 'back'], ['upper-trapezius', 'back'], ['lower-trapezius', 'back'],
  ['latissimus-dorsi', 'back'], ['rhomboids', 'back'], ['erector-spinae', 'back'], ['biceps-brachii', 'front'],
  ['triceps-brachii', 'back'], ['brachialis', 'front'], ['forearm-flexors', 'back'], ['forearm-extensors', 'back'],
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

    fireEvent.click(screen.getByTestId('atlas-region-pectoralis-major'));

    expect(onSelect).toHaveBeenCalledWith('pectoralis-major');
    expect(screen.getAllByText('Primary').length).toBeGreaterThan(0);
  });

  it('keeps an accessible front/back switch and named keyboard regions', () => {
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} />);

    const back = screen.getByRole('button', { name: /show back anatomy/i });
    fireEvent.click(back);

    expect(back.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('atlas-region-rotator-cuff').getAttribute('aria-label')).toMatch(/rotator cuff.*stabilizer/i);
  });

  it('keeps the compact story complete across sides and counts the full activation set', () => {
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} homeCompact />);

    fireEvent.click(screen.getByRole('button', { name: 'Show back anatomy' }));

    const roles = screen.getByRole('list', { name: 'Highlighted muscle roles' });
    expect(roles.textContent).toContain('Pectoralis major');
    expect(roles.textContent).toContain('Front');
    expect(roles.textContent).toContain('+2 more highlighted');
  });

  it('adds a non-interactive opposite-side companion for the wide home composition', () => {
    const { container } = render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={vi.fn()} homeCompact />);

    const pair = container.querySelector('[data-atlas-wide-pair="true"]');
    const companion = pair?.querySelector('[data-atlas-companion-view="back"]');
    expect(pair).toBeTruthy();
    expect(companion).toBeTruthy();
    expect(companion?.getAttribute('aria-hidden')).toBe('true');
    expect(companion?.querySelectorAll('.muscle-atlas__region').length).toBeGreaterThan(0);
  });

  it('exposes one complete semantic role list and switches sides when an opposite-side role is chosen', () => {
    const onSelect = vi.fn();
    render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={onSelect} />);

    const roles = screen.getByRole('list', { name: 'Highlighted muscle roles' });
    expect(roles.textContent).toContain('Pectoralis major');
    expect(roles.textContent).toContain('Triceps brachii');
    expect(roles.textContent).toContain('Rotator cuff');
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /triceps brachii.*secondary.*back/i }));
    expect(onSelect).toHaveBeenCalledWith('triceps-brachii');
    expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();
  });

  it('localizes atlas names, view controls, roles, summaries, and aria copy', () => {
    atlasLocale.value = 'es';
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} homeCompact />);

    expect(screen.getByRole('region', { name: 'Atlas de activación muscular' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pectoral mayor, músculo principal$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar anatomía posterior' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Funciones musculares destacadas' }).textContent).toContain('Pectoral mayor');
    expect(document.body.textContent).not.toMatch(/\b(?:Front|Back|Primary|Pectoralis|highlighted)\b/);
  });

  it.each([
    ['en', ['Pectoralis major, primary muscle', 'Middle deltoid, secondary muscle', 'Brachialis, stabilizer muscle']],
    ['es', ['Pectoral mayor, músculo principal', 'Deltoides medio, músculo secundario', 'Braquial, músculo estabilizador']],
    ['el', ['Μείζων θωρακικός, κύριος μυς', 'Μέσος δελτοειδής, δευτερεύων μυς', 'Βραχιόνιος, σταθεροποιητικός μυς']],
    ['de', ['Großer Brustmuskel, primärer Muskel', 'Mittlerer Deltamuskel, sekundärer Muskel', 'Armbeuger, stabilisierender Muskel']],
    ['fr', ['Grand pectoral, muscle principal', 'Deltoïde moyen, muscle secondaire', 'Brachial, muscle stabilisateur']],
    ['it', ['Grande pettorale, muscolo principale', 'Deltoide medio, muscolo secondario', 'Brachiale, muscolo stabilizzatore']],
    ['nl', ['Grote borstspier, primaire spier', 'Middelste deltaspier, secundaire spier', 'Brachialis, stabiliserende spier']],
    ['pt', ['Peitoral maior, músculo principal', 'Deltoide médio, músculo secundário', 'Braquial, músculo estabilizador']],
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
    const pectoralis = screen.getByTestId('atlas-region-pectoralis-major');

    fireEvent.focus(pectoralis);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(pectoralis, { key: 'Enter' });
    fireEvent.keyDown(pectoralis, { key: ' ' });
    fireEvent.click(pectoralis);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'pectoralis-major');
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('maps a real pointer coordinate through the SVG viewport to the nearest contour owner', () => {
    const onSelect = vi.fn();
    render(<MuscleAtlas activations={[
      { id: 'quadriceps', label: 'Quadriceps', role: 'primary', view: 'front', confidence: 'curated' },
      { id: 'adductors', label: 'Adductors', role: 'secondary', view: 'front', confidence: 'curated' },
    ]} selected={null} onSelect={onSelect} />);
    const svg = screen.getByRole('group', { name: 'Front anatomy map' });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 350, bottom: 930, width: 350, height: 930, toJSON: () => ({}),
    });

    fireEvent(svg, new MouseEvent('pointerup', { bubbles: true, clientX: 140, clientY: 480 }));

    expect(onSelect).toHaveBeenCalledWith('adductors');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('gives each side of a small bilateral region transparent 44px-equivalent hit geometry', () => {
    render(<MuscleAtlas activations={[{ id: 'brachialis', label: 'Brachialis', role: 'secondary', view: 'front', confidence: 'curated' }]} selected={null} onSelect={vi.fn()} />);
    const hitTargets = screen.getAllByTestId(/^atlas-hit-brachialis-/);

    expect(hitTargets).toHaveLength(2);
    for (const hitTarget of hitTargets) {
      expect(hitTarget.getAttribute('r')).toBe('7');
      expect(hitTarget.getAttribute('data-min-hit-target')).toBe('44');
    }
  });

  it.each([
    ['full', false, 296],
    ['home compact', true, 228],
  ] as const)('keeps every %s 44px target fully inside its actual atlas viewport', (_label, homeCompact, renderedHeight) => {
    render(<MuscleAtlas activations={allActivations} selected={null} onSelect={vi.fn()} homeCompact={homeCompact} />);

    for (const view of ['front', 'back'] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Show ${view} anatomy` }));
      const svg = screen.getByRole('group', { name: `${view === 'front' ? 'Front' : 'Back'} anatomy map` });
      const [viewBoxMinX, viewBoxMinY, viewBoxWidth, viewBoxHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);

      for (const hitTarget of screen.getAllByTestId(/^atlas-hit-/)) {
        const centerX = Number(hitTarget.getAttribute('cx'));
        const centerY = Number(hitTarget.getAttribute('cy'));
        const radius = Number(hitTarget.getAttribute('r'));
        expect(centerX - radius).toBeGreaterThanOrEqual(viewBoxMinX);
        expect(centerX + radius).toBeLessThanOrEqual(viewBoxMinX + viewBoxWidth);
        expect(centerY - radius).toBeGreaterThanOrEqual(viewBoxMinY);
        expect(centerY + radius).toBeLessThanOrEqual(viewBoxMinY + viewBoxHeight);
        expect((radius * 2 * renderedHeight) / viewBoxHeight).toBeGreaterThanOrEqual(44);
      }
      expect(svg.getAttribute('height')).toBe(String(renderedHeight));
    }
  });

  it('gives each published forearm contour exact ownership on both sides, independent of render order', () => {
    const onSelect = vi.fn();
    const forearms: MuscleActivation[] = [
      { id: 'forearm-flexors', label: 'Forearm flexors', role: 'primary', view: 'back', confidence: 'curated' },
      { id: 'forearm-extensors', label: 'Forearm extensors', role: 'secondary', view: 'back', confidence: 'curated' },
    ];
    const { rerender } = render(<MuscleAtlas activations={forearms} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show back anatomy' }));
    const svg = screen.getByRole('group', { name: 'Back anatomy map' });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 350, bottom: 930, width: 350, height: 930, toJSON: () => ({}),
    });
    const [viewBoxMinX, viewBoxMinY, viewBoxWidth, viewBoxHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const interactionPlane = svg.querySelector('.muscle-atlas__interaction-plane')!;

    for (const [pathId, owner] of [
      ['forearm-flexors-left', 'forearm-flexors'],
      ['forearm-flexors-right', 'forearm-flexors'],
      ['forearm-extensors-left', 'forearm-extensors'],
      ['forearm-extensors-right', 'forearm-extensors'],
    ] as const) {
      const path = document.querySelector(`[data-source-path-id="${pathId}"]`)!;
      expect(path.getAttribute('pointer-events')).toBeNull();
      expect(path.getAttribute('data-atlas-hit-owner')).toBe(owner);
      const svgPoint = pathId.endsWith('left') ? (pathId.includes('extensors') ? [39, 35] : [41, 35]) : (pathId.includes('extensors') ? [66, 35] : [64, 35]);
      const pointer = {
        bubbles: true,
        clientX: ((svgPoint[0] - viewBoxMinX) / viewBoxWidth) * 350,
        clientY: ((svgPoint[1] - viewBoxMinY) / viewBoxHeight) * 930,
      };

      // The SVG coordinate resolver owns the same published interior point
      // when the browser targets the surrounding interaction plane.
      fireEvent(interactionPlane, new MouseEvent('pointerup', pointer));
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(owner);
      onSelect.mockClear();

      // On the painted contour, pointer-up defers to the exact source owner and
      // its ensuing click selects once (no approximate duplicate callback).
      fireEvent(path, new MouseEvent('pointerup', pointer));
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.click(path);
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(owner);
      onSelect.mockClear();
    }

    rerender(<MuscleAtlas activations={[...forearms].reverse()} selected={null} onSelect={onSelect} />);
    for (const [pathId, owner] of [
      ['forearm-flexors-left', 'forearm-flexors'],
      ['forearm-flexors-right', 'forearm-flexors'],
      ['forearm-extensors-left', 'forearm-extensors'],
      ['forearm-extensors-right', 'forearm-extensors'],
    ] as const) {
      const path = document.querySelector(`[data-source-path-id="${pathId}"]`)!;
      fireEvent.click(path);
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(owner);
      onSelect.mockClear();
    }
  });

  it('renders all 23 licensed contours and three explicit deep-location guides', async () => {
    const { rerender } = render(<MuscleAtlas activations={allActivations} selected="rotator-cuff" onSelect={vi.fn()} />);
    const licensedSurfaceIds = [
      'pectoralis-major', 'serratus-anterior', 'anterior-deltoid', 'middle-deltoid', 'posterior-deltoid',
      'upper-trapezius', 'lower-trapezius', 'latissimus-dorsi', 'erector-spinae', 'biceps-brachii',
      'triceps-brachii', 'forearm-flexors', 'forearm-extensors', 'rectus-abdominis', 'obliques',
      'gluteus-maximus', 'gluteus-medius', 'quadriceps', 'hamstrings', 'adductors', 'gastrocnemius',
      'soleus', 'tibialis-anterior',
    ];

    for (const view of ['front', 'back'] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Show ${view} anatomy` }));
      for (const activation of allActivations.filter((item) => ATLAS_GEOMETRY[item.id].view === view && licensedSurfaceIds.includes(item.id))) {
        expect(screen.getByTestId(`atlas-region-${activation.id}`).getAttribute('data-anatomy-source')).toBe('licensed-surface');
      }
    }

    expect(screen.getByTestId('atlas-region-rotator-cuff').getAttribute('data-anatomy-depth')).toBe('deep-guide');
    expect(screen.getByTestId('atlas-region-rhomboids').getAttribute('data-anatomy-depth')).toBe('deep-guide');
    rerender(<MuscleAtlas activations={allActivations} selected="brachialis" onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('atlas-region-brachialis').getAttribute('data-anatomy-depth')).toBe('deep-guide'));
    expect(screen.getAllByText(/deep location/i).length).toBeGreaterThan(0);
  });

  it('explains a selected front structure when the user explicitly chooses the back view', () => {
    render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show back anatomy' }));
    expect(screen.getByText('This selection is on the other view. Use its muscle action to show it.')).toBeTruthy();
  });

  it('changes to the selected muscle view when controlled selection crosses sides', async () => {
    const { rerender } = render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={vi.fn()} />);

    rerender(<MuscleAtlas activations={benchActivations} selected="rotator-cuff" onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /show back anatomy/i }).getAttribute('aria-pressed')).toBe('true');
    });
  });

  it.each([
    ['en', 'Front view · visible muscle roles: 1 of 3.', 'Back view · visible muscle roles: 2 of 3.', 'Deep location. Rotator cuff is shown as a location guide, not a precise surface contour.'],
    ['es', 'Vista frontal · funciones musculares visibles: 1 de 3.', 'Vista posterior · funciones musculares visibles: 2 de 3.', 'Ubicación profunda. Manguito rotador: guía orientativa, no un contorno superficial preciso.'],
    ['el', 'Μπροστινή όψη · ορατοί μυϊκοί ρόλοι: 1 από 3.', 'Πίσω όψη · ορατοί μυϊκοί ρόλοι: 2 από 3.', 'Βαθιά θέση. Στροφικό πέταλο: ενδεικτικός οδηγός θέσης, όχι ακριβές επιφανειακό περίγραμμα.'],
    ['de', 'Vorderansicht · sichtbare Muskelrollen: 1 von 3.', 'Rückansicht · sichtbare Muskelrollen: 2 von 3.', 'Tiefe Lage. Rotatorenmanschette: Orientierungshilfe, keine präzise Oberflächenkontur.'],
    ['fr', 'Vue avant · rôles musculaires visibles : 1 sur 3.', 'Vue arrière · rôles musculaires visibles : 2 sur 3.', 'Localisation profonde. Coiffe des rotateurs : repère indicatif, pas un contour de surface précis.'],
    ['it', 'Vista anteriore · ruoli muscolari visibili: 1 su 3.', 'Vista posteriore · ruoli muscolari visibili: 2 su 3.', 'Posizione profonda. Cuffia dei rotatori: guida indicativa, non un contorno superficiale preciso.'],
    ['nl', 'Vooraanzicht · zichtbare spierrollen: 1 van 3.', 'Achteraanzicht · zichtbare spierrollen: 2 van 3.', 'Diepe ligging. Rotatorenmanchet: plaatsaanduiding, geen precieze oppervlaktecontour.'],
    ['pt', 'Vista frontal · papéis musculares visíveis: 1 de 3.', 'Vista posterior · papéis musculares visíveis: 2 de 3.', 'Localização profunda. Manguito rotador: guia de referência, não um contorno superficial preciso.'],
  ])('renders grammatical front/back summaries and stable deep-location copy in %s', async (locale, frontSummary, backSummary, deepCopy) => {
    atlasLocale.value = locale;
    const { rerender } = render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText(frontSummary)).toBeTruthy();

    fireEvent.click(document.querySelector('.muscle-atlas__views button:last-child')!);
    expect(screen.getByText(backSummary)).toBeTruthy();

    rerender(<MuscleAtlas activations={benchActivations} selected="rotator-cuff" onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(deepCopy)).toBeTruthy());
  });

  it.each([
    ['en', 'Show Pectoralis major, primary muscle, in front view', 'Show Triceps brachii, secondary muscle, in back view'],
    ['es', 'Mostrar Pectoral mayor, músculo principal, en vista frontal', 'Mostrar Tríceps braquial, músculo secundario, en vista posterior'],
    ['el', 'Εμφάνιση στην μπροστινή όψη: Μείζων θωρακικός, κύριος μυς', 'Εμφάνιση στην πίσω όψη: Τρικέφαλος βραχιόνιος, δευτερεύων μυς'],
    ['de', 'Großer Brustmuskel, primärer Muskel, in der Vorderansicht anzeigen', 'Trizeps, sekundärer Muskel, in der Rückansicht anzeigen'],
    ['fr', 'Afficher Grand pectoral, muscle principal, en vue avant', 'Afficher Triceps brachial, muscle secondaire, en vue arrière'],
    ['it', 'Mostra Grande pettorale, muscolo principale, nella vista anteriore', 'Mostra Tricipite brachiale, muscolo secondario, nella vista posteriore'],
    ['nl', 'Toon Grote borstspier, primaire spier, in vooraanzicht', 'Toon Triceps, secundaire spier, in achteraanzicht'],
    ['pt', 'Mostrar Peitoral maior, músculo principal, na vista frontal', 'Mostrar Tríceps braquial, músculo secundário, na vista posterior'],
  ])('renders complete front and back role actions in %s', (locale, frontAction, backAction) => {
    atlasLocale.value = locale;
    render(<MuscleAtlas activations={benchActivations} selected={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: frontAction })).toBeTruthy();
    expect(screen.getByRole('button', { name: backAction })).toBeTruthy();
  });
});
