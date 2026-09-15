// @vitest-environment jsdom
import React, { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import fixture from './catalogue.fixture.json';
import type { CanvasProps } from '../../components/anatomy/AtlasCanvas';
import type { AtlasManifest } from '../../lib/anatomy/types';
const observed = vi.hoisted(() => ({ props: null as CanvasProps | null }));
vi.mock('next/dynamic', () => ({ default: () => function Canvas(props: CanvasProps) {
  observed.props = props;
  // The real renderer reports progress whenever it receives props. Identical
  // reports must settle instead of triggering a render/update loop.
  useEffect(() => { props.onProgress(1, 1); }, [props]);
  return <button onClick={() => props.onError('context-lost')}>Lose context</button>;
} }));
vi.mock('../../lib/anatomy/validation', () => ({ fetchAtlasManifest: vi.fn() }));
import { WorkoutAnatomyModel, WorkoutAnatomySource } from '../../components/anatomy/WorkoutAnatomyModel';
import { fetchAtlasManifest } from '../../lib/anatomy/validation';
import { I18nProvider } from '../../lib/i18n';
afterEach(() => { cleanup(); vi.clearAllMocks(); observed.props = null; });
const atlasFixture = fixture as unknown as AtlasManifest;
const props = { activations: [], selected: null, onSelect: vi.fn(), view: 'back' as const, color: '#78bdb2' };
it('uses the shared renderer with neutral unselected muscles and only muscle/skeleton layers', async () => {
  vi.mocked(fetchAtlasManifest).mockResolvedValue(atlasFixture);
  render(<I18nProvider defaultLang="en"><WorkoutAnatomySource.Provider value={{ manifestUrl: '/anatomy/review/manifest.json' }}><WorkoutAnatomyModel {...props} /></WorkoutAnatomySource.Provider></I18nProvider>);
  await waitFor(() => expect(observed.props).not.toBeNull());
  expect(observed.props).toMatchObject({ systems: ['muscles', 'skeleton'], focusElements: [], selectedElements: [], view: 'back', interactive: true, framingScale: 0.83 });
  fireEvent.click(screen.getByRole('button', { name: 'Lose context' }));
  expect(screen.getByText('3D is unavailable. Showing the muscle map.')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();
});
it('keeps the public release gate closed and the selected view usable without a manifest request', () => {
  render(<I18nProvider defaultLang="en"><WorkoutAnatomyModel {...props} /></I18nProvider>);
  expect(fetchAtlasManifest).not.toHaveBeenCalled();
  expect(screen.getByRole('group', { name: 'Back anatomy map' })).toBeTruthy();
});

it('clears a previous manifest failure when a reviewed source changes', async () => {
  const fetcher = vi.mocked(fetchAtlasManifest);
  fetcher.mockRejectedValueOnce(new Error('first source unavailable')).mockResolvedValueOnce(atlasFixture);
  function SourceSwitcher() {
    const [manifestUrl, setManifestUrl] = useState('/anatomy/first/manifest.json');
    return <>
      <button type="button" onClick={() => setManifestUrl('/anatomy/second/manifest.json')}>Switch reviewed source</button>
      <WorkoutAnatomySource.Provider value={{ manifestUrl }}><WorkoutAnatomyModel {...props} /></WorkoutAnatomySource.Provider>
    </>;
  }

  render(<I18nProvider defaultLang="en"><SourceSwitcher /></I18nProvider>);
  await waitFor(() => expect(screen.getByText('3D is unavailable. Showing the muscle map.')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Switch reviewed source' }));
  await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith('/anatomy/second/manifest.json', expect.anything()));
  await waitFor(() => expect(screen.queryByText('3D is unavailable. Showing the muscle map.')).toBeNull());
  expect(screen.getByRole('button', { name: 'Lose context' })).toBeTruthy();
});
