// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DailyMacroStrip from '@/components/nutrition/DailyMacroStrip';

describe('DailyMacroStrip', () => {
  it('presents the four daily nutrition results in one labelled group', () => {
    render(React.createElement(DailyMacroStrip, {
      protein: 82,
      carbs: 140,
      fat: 51,
      sugar: 24,
      sugarCompleteness: 'complete',
    }));

    expect(screen.getByRole('group', { name: "Today's nutrition" })).toBeTruthy();
    expect(screen.getByText('82g')).toBeTruthy();
    expect(screen.getByText('24g')).toBeTruthy();
    expect(screen.getAllByText(/Protein|Carbs|Fat|Sugar/)).toHaveLength(4);
  });

  it('states when sugar data is unavailable instead of rendering a false zero', () => {
    render(React.createElement(DailyMacroStrip, {
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: null,
      sugarCompleteness: 'unavailable',
    }));

    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.queryByText('0g', { selector: '[data-macro="sugar"] *' })).toBeNull();
  });
});
