// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TodayNutritionNote from '@/components/summary/TodayNutritionNote';

describe("Today's note card", () => {
  it('renders one readable, non-interactive daily observation', () => {
    render(React.createElement(TodayNutritionNote, {
      note: { tone: 'positive', icon: 'i-check', text: 'Great protein intake today.' },
    }));

    expect(screen.getByRole('heading', { name: "Today's note" })).toBeTruthy();
    expect(screen.getByText('Great protein intake today.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
