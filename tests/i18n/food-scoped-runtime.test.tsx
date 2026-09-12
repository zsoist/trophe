// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const context = vi.hoisted(() => ({ lang: 'es', t: (key: string, _params?: Record<string, string | number>): string => key }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => context }));
import { useFoodI18n } from '@/components/food/useFoodI18n';
beforeEach(() => { context.lang = 'es'; context.t = key => key; });
it('renders food copy and unit placeholders in the current core language', () => {
  const { result, rerender } = renderHook(() => useFoodI18n());
  expect(result.current.t('food.edit.quantity_aria', { unit: 'ml' })).toBe('Cantidad en ml');
  context.lang = 'el'; rerender();
  expect(result.current.t('food.edit.quantity_aria', { unit: 'ml' })).toBe('Ποσότητα σε ml');
});
it('keeps an English fallback until an overlay arrives, then uses that overlay', () => {
  context.lang = 'pt';
  const { result, rerender } = renderHook(() => useFoodI18n());
  expect(result.current.t('food.manual_name_placeholder')).toBe('Food name (optional)');
  context.t = key => key === 'food.manual_name_placeholder' ? 'Nome do alimento (opcional)' : key;
  rerender();
  expect(result.current.t('food.manual_name_placeholder')).toBe('Nome do alimento (opcional)');
});
it('delegates established shared keys and parameters unchanged', () => {
  const translate = vi.fn(() => 'shared'); context.t = translate;
  const { result } = renderHook(() => useFoodI18n());
  expect(result.current.t('food.remaining', { n: 3 })).toBe('shared');
  expect(translate).toHaveBeenCalledWith('food.remaining', { n: 3 });
});
