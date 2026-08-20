// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardGreeting from '@/components/summary/DashboardGreeting';

describe('Nik dashboard greeting', () => {
  it('renders one plain English greeting and a quiet coach-view action', () => {
    render(
      <DashboardGreeting
        firstName="Nik"
        role="coach"
        hour={15}
        date={new Date('2026-08-19T15:04:00-05:00')}
        streakDays={0}
      />,
    );

    expect(screen.getByText('Good afternoon, Nik,')).toBeTruthy();
    expect(screen.getAllByText(/Nik/)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Coach view' }).getAttribute('href')).toBe('/coach');
    expect(screen.queryByRole('button', { name: /theme|light mode|dark mode/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\u0370-\u03ff]/u);
  });
});
