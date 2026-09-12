import { describe, it, expect } from 'vitest';
import { textFoodIntakeIntent } from './text-food-intent';
describe('bounded new meal interpretation intent', () => {
  it.each(['I just ate two Big Macs and one Coca-Cola with medium french fries', 'I actually ate 100g rice', 'Please log 100g rice', 'Comí 100g de arroz', 'Acabo de comer dos huevos'])('offers review for %s', text => expect(textFoodIntakeIntent(text)?.text).toBe(text));
  it.each(['I did not eat rice', "I ate rice but don't log it", 'I will eat rice tomorrow', 'How many calories should I eat?', 'Please log it', 'Change my rice to 100g', 'No comí arroz', 'Voy a comer arroz', 'I ate rice instead of pasta', 'I ate rice. Remove that entry'])('does not start intake for %s', text => expect(textFoodIntakeIntent(text)).toBeNull());
});
