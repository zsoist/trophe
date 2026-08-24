// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CoachConversationHeader from '@/components/messages/CoachConversationHeader';

describe('CoachConversationHeader', () => {
  it('shows a recognizable coach identity and an explicit back action', () => {
    const onBack = vi.fn();
    render(React.createElement(CoachConversationHeader, {
      coachName: 'Michael Kavdas',
      onBack,
    }));

    expect(screen.getByRole('heading', { name: 'Coach Michael' })).toBeTruthy();
    expect(screen.getByText('Private coach line')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
