// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ResponseText } from '@/components/assistant/ResponseText';
afterEach(cleanup);
it('renders paragraphs, lists and emphasis while keeping model HTML inert', () => {
 const { container } = render(<ResponseText text={'First **point**.\n\n- One\n- Two\n\n1. Step\n2. Finish\n\n<img src=x onerror=alert(1)> [link](javascript:alert(1))'} />);
 expect(container.querySelector('strong')?.textContent).toBe('point');
 expect(screen.getAllByRole('list')).toHaveLength(2);
 expect(screen.getAllByRole('listitem')).toHaveLength(4);
 expect(container.querySelector('img,a,script')).toBeNull();
 expect(screen.getByText(/<img src=x/)).toBeTruthy();
});

it('hides only recognized assistant wrappers and an exact repeated user statement without rewriting the source', () => {
 const text = 'Private Luna pilot: Answer.\nUser statement (unverified): My question';
 const view = render(<ResponseText assistant userStatement="My question" text={text} />);
 expect(screen.getByText('Answer.')).toBeTruthy();
 expect(view.container.textContent).not.toContain('unverified');
 expect(text).toContain('Private Luna pilot:');
 view.rerender(<ResponseText text={text} />);
 expect(view.container.textContent).toContain('Private Luna pilot:');
 view.rerender(<ResponseText assistant userStatement="Different question" text={text} />);
 expect(view.container.textContent).toContain('User statement (unverified): My question');
});
