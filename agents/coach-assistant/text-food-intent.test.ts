import { describe, it, expect } from 'vitest';
import { isAdviceOrQuestionUtterance, textFoodIntakeIntent } from './text-food-intent';
describe('bounded new meal interpretation intent', () => {
  it.each(['I just ate two Big Macs and one Coca-Cola with medium french fries', 'I actually ate 100g rice', 'Please log 100g rice', 'Comí 100g de arroz', 'Acabo de comer dos huevos', 'I want to log 100g of rice', 'quiero registrar 100g de arroz', 'Quisiera anotar dos huevos'])('offers review for %s', text => expect(textFoodIntakeIntent(text)?.text).toBe(text));
  it.each(['I did not eat rice', "I ate rice but don't log it", 'I will eat rice tomorrow', 'How many calories should I eat?', 'Please log it', 'Change my rice to 100g', 'No comí arroz', 'Voy a comer arroz', 'I ate rice instead of pasta', 'I ate rice. Remove that entry', 'I want to log it', 'quiero registrar eso', 'quiero comer arroz'])('does not start intake for %s', text => expect(textFoodIntakeIntent(text)).toBeNull());

  it.each([
    'I had a big breakfast, how am I doing today?',
    'I drank a sugary soda, is that bad?',
    'I had a big breakfast how am I doing today',
    'Comí arroz, ¿cómo voy hoy?',
    'Comí arroz, cuántas calorías me quedan',
  ])('keeps advice/status questions out of intake for %s', text => {
    expect(isAdviceOrQuestionUtterance(text)).toBe(true);
    expect(textFoodIntakeIntent(text)).toBeNull();
  });

  it.each(['Me comí dos Big Macs', 'Me comi dos Big Macs', 'Hoy comí dos Big Macs', 'Anoche me comí dos Big Macs'])('recognizes natural Spanish meal statements for %s', text => {
    expect(textFoodIntakeIntent(text)).toMatchObject({ text, language: 'es' });
  });

  it('still starts intake for a plain past-tense consumption statement', () => {
    expect(textFoodIntakeIntent('I had a big breakfast, two eggs and toast')).toMatchObject({ language: 'en' });
  });
});
