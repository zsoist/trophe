// @vitest-environment jsdom

import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileHover']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    (props, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      'data-motion-initial': props.initial === undefined ? undefined : JSON.stringify(props.initial),
      'data-motion-animate': props.animate === undefined ? undefined : JSON.stringify(props.animate),
      'data-motion-exit': props.exit === undefined ? undefined : JSON.stringify(props.exit),
      'data-motion-while-hover': props.whileHover === undefined ? undefined : JSON.stringify(props.whileHover),
      ref,
    }, props.children as React.ReactNode),
  );
  const elementCache = new Map<string, ReturnType<typeof element>>();
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: new Proxy({}, { get: (_, tag) => {
      const name = String(tag);
      const cached = elementCache.get(name);
      if (cached) return cached;
      const created = element(name);
      elementCache.set(name, created);
      return created;
    } }),
    useReducedMotion: () => motionPreference.reduced,
  };
});

import BatchHabitAssign from '@/components/coach/BatchHabitAssign';
import CoachAchievements from '@/components/coach/CoachAchievements';
import CoachLoadingSkeletons from '@/components/coach/CoachLoadingSkeletons';
import CoachingRoadmap from '@/components/coach/CoachingRoadmap';
import CoachingStreak from '@/components/coach/CoachingStreak';
import { FoodSharingSwitch } from '@/components/coach/FoodSharingSwitch';
import MacroRollupModal from '@/components/coach/MacroRollupModal';
import MealSuggestPicker from '@/components/coach/MealSuggestPicker';
import QuickActionsBar from '@/components/coach/QuickActionsBar';
import ShoppingListModal from '@/components/coach/ShoppingListModal';
import { useCoachDialogFocus } from '@/components/coach/useCoachDialogFocus';
import { Trophy } from 'lucide-react';

const ROUTE_SOURCES = [
  'app/coach/calendar/page.tsx',
  'app/coach/foods/page.tsx',
  'app/coach/habits/page.tsx',
  'app/coach/inbox/page.tsx',
  'app/coach/inbox/[clientId]/page.tsx',
  'app/coach/invite/page.tsx',
  'app/coach/protocols/page.tsx',
  'app/coach/questionnaires/page.tsx',
  'app/coach/templates/page.tsx',
] as const;

const EXCLUDED_COMPONENTS = new Set([
  'ClientFoodHeatmap.tsx',
  'ClientViewSettings.tsx',
  'CoachInsightPanel.tsx',
  'CoachNav.tsx',
  'CustomizePanelsBar.tsx',
  'MealPatternView.tsx',
]);

const COMPONENT_SOURCES = readdirSync(join(process.cwd(), 'components/coach'))
  .filter((file) => file.endsWith('.tsx') && !EXCLUDED_COMPONENTS.has(file))
  .sort()
  .map((file) => `components/coach/${file}`);

const OWNED_SOURCES = [...ROUTE_SOURCES, ...COMPONENT_SOURCES];
const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

function inventory(patterns: readonly RegExp[]) {
  return OWNED_SOURCES.flatMap((file) => patterns.flatMap((pattern) =>
    (source(file).match(pattern) ?? []).map((match) => `${file}: ${match}`),
  ));
}

function jsxElements(file: string, tag: string) {
  const value = source(file);
  const ast = ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Array<{ text: string; node: ts.JsxElement | ts.JsxSelfClosingElement }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(ast) === tag) found.push({ text: node.getText(ast), node });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

function hasVisibleContent(node: ts.Node): boolean {
  if (ts.isJsxText(node)) return node.text.trim().length > 0;
  if (ts.isJsxExpression(node) && node.expression) return !ts.isJsxElement(node.expression) && !ts.isJsxSelfClosingElement(node.expression);
  if (ts.isJsxElement(node)) return node.children.some(hasVisibleContent);
  return false;
}

function motionNodes(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-motion-initial], [data-motion-animate], [data-motion-exit], [data-motion-while-hover]')];
}

function hasOnlyStaticMotion(container: HTMLElement) {
  return motionNodes(container).every((node) => ['data-motion-initial', 'data-motion-animate', 'data-motion-exit', 'data-motion-while-hover'].every((attribute) => {
    const value = node.getAttribute(attribute);
    return value === null || value === 'false';
  }));
}

function repeatingMotionViolations(file: string) {
  const value = source(file);
  const ast = ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(ast).startsWith('motion.')) {
        const attributes = opening.attributes.properties.filter(ts.isJsxAttribute);
        const property = (name: string) => attributes.find((attribute) => attribute.name.getText(ast) === name)?.initializer?.getText(ast) ?? '';
        const transition = property('transition');
        if (/\b(?:Infinity|Number\.POSITIVE_INFINITY)\b/.test(transition)) {
          const animate = property('animate');
          const hasStaticAnimate = /(?:\breduceMotion\s*\?\s*(?:false|undefined)\b|!reduceMotion\s*&&)/.test(animate);
          const hasStaticTransition = /(?:\breduceMotion\s*\?\s*\{[\s\S]*?\bduration\s*:\s*0\b|!reduceMotion\s*&&)/.test(transition);
          if (!hasStaticAnimate || !hasStaticTransition) {
            violations.push(`${file}: ${opening.tagName.getText(ast)} repeating motion lacks ${!hasStaticAnimate ? 'a static animate branch' : 'a static transition branch'}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return violations;
}

function RouteDialogHarness({ renderUtility }: { renderUtility: (onClose: () => void) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [utilityOpen, setUtilityOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useCoachDialogFocus(open, () => setOpen(false), ref);
  return React.createElement(React.Fragment, null,
    React.createElement('button', { onClick: () => setOpen(true) }, 'Open route dialog'),
    open && React.createElement('div', { ref, role: 'dialog', 'aria-label': 'Underlying route dialog', tabIndex: -1 },
      React.createElement('button', { onClick: () => setOpen(false) }, 'Close route dialog'),
      React.createElement('button', { onClick: () => setUtilityOpen(true) }, 'Open utility dialog'),
      utilityOpen && renderUtility(() => setUtilityOpen(false)),
    ),
  );
}

const OVERLAY_SOURCES = [
  'app/coach/foods/page.tsx',
  'app/coach/habits/page.tsx',
  'app/coach/protocols/page.tsx',
  'app/coach/templates/page.tsx',
  'components/coach/BatchHabitAssign.tsx',
  'components/coach/MacroRollupModal.tsx',
  'components/coach/MealSuggestPicker.tsx',
  'components/coach/ShoppingListModal.tsx',
] as const;

const EXPECTED_OVERLAY_ROOTS: Record<(typeof OVERLAY_SOURCES)[number], number> = {
  'app/coach/foods/page.tsx': 1,
  'app/coach/habits/page.tsx': 1,
  'app/coach/protocols/page.tsx': 2,
  'app/coach/templates/page.tsx': 2,
  'components/coach/BatchHabitAssign.tsx': 1,
  'components/coach/MacroRollupModal.tsx': 1,
  'components/coach/MealSuggestPicker.tsx': 1,
  'components/coach/ShoppingListModal.tsx': 1,
};

const batchProps = {
  clients: [{ id: 'client-1', name: 'Ada Coach', selected: true }],
  habits: [{ id: 'habit-1', name: 'Daily walk', emoji: 'walk' }],
  onAssign: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  motionPreference.reduced = true;
});

afterEach(() => {
  cleanup();
  motionPreference.reduced = true;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('coach operational routes and modal library contract', () => {
  it('keeps the actual owned inventory free of dark-only, white-alpha, legacy-token, and sub-12px functional recipes', () => {
    expect(OWNED_SOURCES.length).toBeGreaterThan(40);
    expect(inventory([
      /(?:bg|border|text)-stone-(?:100|200|300|400|500|600|700|800|900|950)(?:\/[\d.]+)?/g,
      /(?:bg|border)-white\/(?:\[|\d)/g,
      /bg-black\/(?:\[|\d)/g,
      /rgba\(255,\s*255,\s*255/g,
      /#[0-9a-fA-F]{6,8}/g,
      /rgba?\(/g,
      /var\(--(?:t[1-6]|line(?:-2)?|bg(?:-1)?)(?:[,\)])/g,
      /text-\[(?:8|9|10|11)px\]/g,
      /fontSize:\s*(?:[89]|10|11)(?:\.\d+)?(?:[,}])/g,
      /fontSize="(?:[89]|10|11)(?:\.\d+)?"/g,
    ])).toEqual([]);
  });

  it('renders Quick Actions as named 44px focusable controls inside the consumer-reserved flow', () => {
    const callbacks = {
      onAssignHabit: vi.fn(), onSetMacros: vi.fn(), onAddNote: vi.fn(), onExport: vi.fn(),
    };
    const view = render(React.createElement(QuickActionsBar, callbacks));
    const actions = screen.getAllByRole('button');

    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.textContent)).toEqual(['Habit', 'Macros', 'Note', 'Export']);
    actions.forEach((action) => {
      expect(action.className).toContain('min-h-11');
      expect(action.className).toContain('focus-visible:');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Habit' }));
    expect(callbacks.onAssignHabit).toHaveBeenCalledTimes(1);

    const bar = view.container.firstElementChild;
    expect(bar?.className).not.toContain('fixed');

    const consumer = source('app/coach/client/[id]/page.tsx');
    const root = consumer.slice(consumer.indexOf('data-coach-workspace-root'), consumer.indexOf('<PanelPrefsProvider'));
    const trayStart = consumer.indexOf('data-coach-action-tray');
    const tray = consumer.slice(trayStart, consumer.indexOf('</div>', trayStart));
    expect(root).toContain("'--coach-action-height': '84px'");
    expect(root).toContain("paddingBottom: 'calc(var(--coach-action-height) + env(safe-area-inset-bottom))'");
    expect(tray).toContain('<QuickActionsBar');
    expect(tray).toContain('sticky bottom-[calc(1rem+env(safe-area-inset-bottom))]');
    expect(source('components/coach/QuickActionsBar.tsx')).not.toMatch(/className="[^"]*fixed/);
  });

  it('uses an accessible 44px shared-food switch instead of a click-only visual', () => {
    const foods = source('app/coach/foods/page.tsx');
    const start = foods.indexOf('{/* Shared toggle */}');
    const sharingControl = foods.slice(start, foods.indexOf('{/* Save */}', start));

    expect(sharingControl).toContain('<FoodSharingSwitch');
    const onChange = vi.fn();
    render(React.createElement(FoodSharingSwitch, { checked: false, onChange }));
    const toggle = screen.getByRole('switch', { name: 'Share with assigned clients' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.className).toContain('min-h-11');
    expect(toggle.className).toContain('focus-visible:');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('keeps semantic chart paints valid without concatenating CSS variables', () => {
    const invalidPaint = [
      source('components/coach/ClientComparison.tsx'),
      source('components/coach/CoachCalendar.tsx'),
    ].join('\n');

    expect(invalidPaint).not.toMatch(/\$\{(?:COLOR_[AB]|meta\.color)\}(?:15|20)/);
  });

  it('renders reduced-motion loading skeletons without a decorative sweep', () => {
    const view = render(React.createElement(CoachLoadingSkeletons, { page: 'dashboard' }));
    const pulses = [...view.container.querySelectorAll('.rounded-lg[data-motion-animate]')];

    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses.every((pulse) => pulse.getAttribute('data-motion-animate') === 'false')).toBe(true);
  });

  it('keeps every repeating coach motion element static when reduced motion is requested', () => {
    const files = [
      'components/coach/CoachAchievements.tsx',
      'components/coach/CoachingRoadmap.tsx',
      'components/coach/CoachingStreak.tsx',
      'components/coach/CoachLoadingSkeletons.tsx',
    ];
    const perpetualMotion = files.flatMap(repeatingMotionViolations);

    expect(perpetualMotion).toEqual([]);
  });

  it('keeps every actual mobile text control at 16px without contradictory inline or utility overrides', () => {
    const controls = OWNED_SOURCES.flatMap((file) => [
      ...(source(file).match(/<(?:input|textarea)\b[\s\S]*?\/>/g) ?? []),
      ...(source(file).match(/<select\b[\s\S]*?<\/select>/g) ?? []),
    ].map((element) => ({ file, element })));
    const violations = controls.filter(({ element }) =>
      !/type="(?:checkbox|file|hidden|range|radio)"/.test(element)
      && (!/(?:text-base|text-\[16px\]|fontSize:\s*(?:1[6-9]|[2-9]\d))/.test(element)
        || /(?:text-sm|text-xs|text-\[(?:8|9|10|11|12|13|14|15)px\]|fontSize:\s*(?:[89]|1[0-5]))/.test(element)),
    );
    expect(controls.length).toBeGreaterThan(20);
    expect(violations.map(({ file, element }) => `${file}: ${element.slice(0, 140)}`)).toEqual([]);
  });

  it('gives every actual button a 44px target, truthful name, visible focus, and no nested native action', () => {
    const buttons = OWNED_SOURCES.flatMap((file) => ['button', 'motion.button'].flatMap((tag) =>
      jsxElements(file, tag).map(({ text, node }) => ({ file, text, node })),
    ));
    const violations = buttons.flatMap(({ file, text, node }) => {
      const visible = hasVisibleContent(node);
      return [
        (text.match(/<button\b/g) ?? []).length > 1 && `${file}: nested button`,
        !/(?:min-h-11|h-11|minHeight:\s*44)/.test(text) && `${file}: action below 44px`,
        !visible && !/(?:aria-label|title)=/.test(text) && `${file}: unnamed icon action`,
        !visible && !/(?:min-w-11|w-11|minWidth:\s*44)/.test(text) && `${file}: icon action below 44px wide`,
        !/(?:focus-visible:|onFocus=)/.test(text) && `${file}: action lacks visible focus`,
      ].filter(Boolean) as string[];
    });
    expect(buttons.length).toBeGreaterThan(80);
    expect(violations).toEqual([]);
  });

  it('keeps every actual coach link named, focus-visible, and at least 44px tall', () => {
    const links = OWNED_SOURCES.flatMap((file) => ['a', 'Link'].flatMap((tag) =>
      jsxElements(file, tag).map(({ text, node }) => ({ file, text, node })),
    ));
    const violations = links.flatMap(({ file, text, node }) => [
      !/(?:min-h-11|h-11|minHeight:\s*44)/.test(text) && `${file}: link below 44px`,
      !hasVisibleContent(node) && !/(?:aria-label|title)=/.test(text) && `${file}: unnamed link`,
      !/(?:focus-visible:|onFocus=)/.test(text) && `${file}: link lacks visible focus`,
    ].filter(Boolean) as string[]);
    expect(links.length).toBeGreaterThan(3);
    expect(violations).toEqual([]);
  });

  it('keeps primary route destinations and workspaces reflowing at 320px and 390px without clipping', () => {
    const violations = ROUTE_SOURCES.flatMap((file) => {
      const value = source(file);
      const root = value.slice(value.indexOf('return ('), value.lastIndexOf(');'));
      return [
        !/(?:data-coach-mobile-workspace|className="[^"]*(?:min-w-0|w-full))/.test(root) && `${file}: missing narrow-workspace anchor`,
        /(?:min-w-\[(?:[4-9]\d\d|\d{4,})px\]|minWidth:\s*(?:[4-9]\d\d|\d{4,}))/.test(root) && `${file}: hard mobile minimum width`,
        /overflow-x-hidden/.test(root) && `${file}: primary content may be clipped`,
      ].filter(Boolean) as string[];
    });
    expect(violations).toEqual([]);
  });

  it('associates every true owned overlay root with dialog, focus, Escape, safe-area, and reduced-motion behavior', () => {
    const violations = OVERLAY_SOURCES.flatMap((file) => {
      const value = source(file);
      const dialogCount = value.match(/role="dialog"/g)?.length ?? 0;
      return [
        dialogCount !== EXPECTED_OVERLAY_ROOTS[file] && `${file}: expected ${EXPECTED_OVERLAY_ROOTS[file]} dialog roots, found ${dialogCount}`,
        !/aria-modal="true"/.test(value) && `${file}: missing modal semantics`,
        !/aria-(?:label|labelledby)=/.test(value) && `${file}: missing dialog name`,
        !/(?:safe-bottom|env\(safe-area-inset-bottom\))/.test(value) && `${file}: missing safe-area reserve`,
        !(/useCoachDialogFocus/.test(value) || /(?:Escape)/.test(value)) && `${file}: missing Escape behavior`,
        !(/useCoachDialogFocus/.test(value) || /(?:previousFocus|returnFocus|ReturnFocus)/.test(value)) && `${file}: missing focus restoration`,
        !/(?:useReducedMotion|motion-reduce:)/.test(value) && `${file}: missing reduced-motion behavior`,
      ].filter(Boolean) as string[];
    });
    expect(violations).toEqual([]);
  });

  it('renders batch assignment as a named modal and moves focus inside', () => {
    render(React.createElement(BatchHabitAssign, batchProps));
    const dialog = screen.getByRole('dialog', { name: 'Assign Habit' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toContain('safe-bottom');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes batch assignment with Escape and restores the invoking focus', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const onClose = vi.fn();
    const view = render(React.createElement(BatchHabitAssign, { ...batchProps, onClose }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('removes batch-assignment entrance transforms when reduced motion is requested', () => {
    const view = render(React.createElement(BatchHabitAssign, batchProps));
    const animated = [...view.container.querySelectorAll('[data-motion-initial]')];

    expect(animated.length).toBeGreaterThan(0);
    expect(animated.every((element) => element.getAttribute('data-motion-initial') === 'false')).toBe(true);
  });

  it('contains focus, closes with Escape, restores focus, and removes reduced-motion transforms in coach utility dialogs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        days: [], targets: null, mealCount: 0, parsedMealCount: 0, failedMealCount: 0, complete: true,
        items: [], byCategory: {},
      }),
    }));
    const cases = [
      {
        name: 'Plan macros by day',
        closeName: 'Close plan macro summary',
        renderDialog: (onClose: () => void) => React.createElement(MacroRollupModal, { isOpen: true, clientId: 'client-1', onClose }),
      },
      {
        name: 'AI for Lunch',
        closeName: 'Close meal assistant',
        renderDialog: (onClose: () => void) => React.createElement(MealSuggestPicker, {
          isOpen: true, slotLabel: 'Lunch', slotFraction: 0.3,
          targets: { calories: 2000, protein: 150, carbs: 220, fat: 60 },
          onPick: vi.fn(), onClose,
        }),
      },
      {
        name: 'Shopping list',
        closeName: 'Close shopping list',
        renderDialog: (onClose: () => void) => React.createElement(ShoppingListModal, { isOpen: true, clientId: 'client-1', onClose }),
      },
    ];

    for (const utility of cases) {
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      const onClose = vi.fn();
      const view = render(utility.renderDialog(onClose));
      const dialog = await screen.findByRole('dialog', { name: utility.name });
      const close = screen.getByRole('button', { name: utility.closeName });
      await waitFor(() => expect(document.activeElement).toBe(close));
      expect(dialog.className).toContain('safe-bottom');
      const animated = [dialog.parentElement, dialog].filter((element): element is HTMLElement => element instanceof HTMLElement && element.hasAttribute('data-motion-initial'));
      expect(animated.length).toBeGreaterThanOrEqual(2);
      expect(animated.every((element) => element.getAttribute('data-motion-initial') === 'false')).toBe(true);
      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(document.activeElement).toBe(outside);
      outside.remove();
    }
  });

  it('closes only the focused topmost utility dialog for one Escape press', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ days: [], targets: null, mealCount: 0, parsedMealCount: 0, failedMealCount: 0, complete: true }),
    }));
    const parentClose = vi.fn();
    const childClose = vi.fn();
    render(React.createElement(React.Fragment, null,
      React.createElement(BatchHabitAssign, { ...batchProps, onClose: parentClose }),
      React.createElement(MacroRollupModal, { isOpen: true, clientId: 'client-1', onClose: childClose }),
    ));

    await screen.findByRole('dialog', { name: 'Plan macros by day' });
    screen.getByRole('button', { name: 'Close plan macro summary' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
  });

  it('makes every actual coach decorative surface static for reduced motion while retaining representative motion normally', () => {
    const surfaces = [
      React.createElement(CoachAchievements, { achievements: [{ id: 'win', name: 'Win', icon: Trophy, description: 'Unlocked', unlocked: true }] }),
      React.createElement(CoachingRoadmap, { habits: [{ name: 'Walk', emoji: '🚶', status: 'active' as const }] }),
      React.createElement(CoachingStreak, { streakDays: 30 }),
      React.createElement(CoachLoadingSkeletons, { page: 'dashboard' }),
    ];

    for (const surface of surfaces) {
      const reduced = render(surface);
      expect(motionNodes(reduced.container).length).toBeGreaterThan(0);
      expect(hasOnlyStaticMotion(reduced.container)).toBe(true);
      reduced.unmount();
    }

    motionPreference.reduced = false;
    const normal = render(React.createElement(CoachAchievements, { achievements: [{ id: 'win', name: 'Win', icon: Trophy, description: 'Unlocked', unlocked: true }] }));
    expect(motionNodes(normal.container).some((node) => node.getAttribute('data-motion-animate') !== null && node.getAttribute('data-motion-animate') !== 'false')).toBe(true);
    motionPreference.reduced = true;
  });

  it('keeps a route dialog open while each focused utility dialog consumes one Escape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ days: [], targets: null, mealCount: 0, parsedMealCount: 0, failedMealCount: 0, complete: true, items: [], byCategory: {} }),
    }));
    const utilities = [
      { name: 'Plan macros by day', render: (onClose: () => void) => React.createElement(MacroRollupModal, { isOpen: true, clientId: 'client-1', onClose }) },
      { name: 'AI for Lunch', render: (onClose: () => void) => React.createElement(MealSuggestPicker, { isOpen: true, slotLabel: 'Lunch', slotFraction: 0.3, targets: { calories: 2000, protein: 150, carbs: 220, fat: 60 }, onPick: vi.fn(), onClose }) },
      { name: 'Shopping list', render: (onClose: () => void) => React.createElement(ShoppingListModal, { isOpen: true, clientId: 'client-1', onClose }) },
    ];

    for (const utility of utilities) {
      const onClose = vi.fn();
      const view = render(React.createElement(RouteDialogHarness, { renderUtility: (closeUtility) => utility.render(() => { closeUtility(); onClose(); }) }));
      try {
        fireEvent.click(screen.getByRole('button', { name: 'Open route dialog' }));
        const routeDialog = await screen.findByRole('dialog', { name: 'Underlying route dialog' });
        await waitFor(() => expect(routeDialog.contains(document.activeElement)).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: 'Open utility dialog' }));
        const utilityDialog = await screen.findByRole('dialog', { name: utility.name });
        await waitFor(() => expect(utilityDialog.contains(document.activeElement)).toBe(true));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByRole('dialog', { name: utility.name })).toBeNull());
        expect(routeDialog.isConnected).toBe(true);
      } finally {
        view.unmount();
      }
    }
  });

  it('uses one synchronous stack-safe coach dialog hook for every route-owned dialog helper', () => {
    const routes = [
      'app/coach/foods/page.tsx',
      'app/coach/habits/page.tsx',
      'app/coach/protocols/page.tsx',
      'app/coach/templates/page.tsx',
    ];
    const violations = routes.flatMap((file) => {
      const value = source(file);
      return [
        !/useCoachDialogFocus\(/.test(value) && `${file}: does not call shared dialog hook`,
        /requestAnimationFrame\(/.test(value) && `${file}: delayed dialog focus`,
      ].filter(Boolean);
    });
    expect(violations).toEqual([]);
  });
});
