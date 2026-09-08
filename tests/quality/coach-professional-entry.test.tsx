// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GlobalCoachEntry } from '@/components/assistant/GlobalCoachEntry';

afterEach(() => vi.unstubAllEnvs());

it('renders no professional assistant surface when the shared feature flag is off', () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED', '0');
  const view = render(<GlobalCoachEntry professional />);
  expect(view.container.childElementCount).toBe(0);
});
