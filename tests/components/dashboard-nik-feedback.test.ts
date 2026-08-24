// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardGreeting from '@/components/summary/DashboardGreeting';

describe('Nik dashboard greeting', () => {
  it('renders one plain English greeting and a quiet coach-view action', () => {
    render(React.createElement(DashboardGreeting, {
      firstName: 'Nik',
      role: 'coach',
      hour: 15,
      date: new Date('2026-08-19T15:04:00-05:00'),
      streakDays: 0,
    }));

    expect(screen.getByText('Ready when you are, Nik')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Good afternoon');
    expect(screen.getAllByText(/Nik/)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Coach view' }).getAttribute('href')).toBe('/coach');
    expect(screen.queryByRole('button', { name: /theme|light mode|dark mode/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\u0370-\u03ff]/u);
  });

  it('keeps shared client chrome English-only during the beta', () => {
    const installCard = readFileSync(join(process.cwd(), 'components/shared/InstallCard.tsx'), 'utf8');
    const offlinePage = readFileSync(join(process.cwd(), 'app/offline/page.tsx'), 'utf8');
    const offlineFallback = readFileSync(join(process.cwd(), 'public/offline.html'), 'utf8');

    expect(installCard).not.toMatch(/[\u0370-\u03ff]/u);
    expect(installCard).toContain('Add to Home Screen');
    expect(offlinePage).not.toMatch(/[\u0370-\u03ff]/u);
    expect(offlineFallback).not.toMatch(/[\u0370-\u03ff]/u);
  });

  it('marks the workout program placeholder so release screenshots wait for real content', () => {
    const workout = readFileSync(join(process.cwd(), 'app/dashboard/workout/page.tsx'), 'utf8');

    expect(workout).toMatch(/programQuery\.isLoading[\s\S]*data-loading-skeleton/);
  });
});
