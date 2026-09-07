// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { StructureProvenance } from '../../components/anatomy/StructureProvenance';
import { I18nProvider } from '../../lib/i18n';
import type { AtlasManifest } from '../../lib/anatomy/types';
import fixture from './catalogue.fixture.json';
afterEach(cleanup);
it('shows source version without implying that it is an authored supplement', () => {
  render(<I18nProvider defaultLang="en"><StructureProvenance manifest={fixture as unknown as AtlasManifest} conceptId="FMA24475" /></I18nProvider>);
  expect(screen.getByText(/BodyParts3D ·/)).toBeTruthy();
  expect(screen.queryByText(/Anatomical review pending/)).toBeNull();
});
it('binds illustrated selection to its own hash and pending anatomical review', () => {
  const manifest = { ...fixture, authored: { author: 'Trophē / AG2', license: 'Original', recipeSha256: 'recipe-identity', muscleElements: {} }, chunks: [...fixture.chunks, { id: 'authored-core', sha256: 'illustration-identity' }] } as unknown as AtlasManifest;
  render(<I18nProvider defaultLang="en"><StructureProvenance manifest={manifest} conceptId="AUTHORED_rectus_abdominis" /></I18nProvider>);
  expect(screen.getByText(/Anatomical review pending/)).toBeTruthy();
  expect(screen.getByText(/illustration-identity/)).toBeTruthy();
  expect(screen.getByText(/recipe-identity/)).toBeTruthy();
  expect(screen.queryByText(/BodyParts3D ·/)).toBeNull();
});
