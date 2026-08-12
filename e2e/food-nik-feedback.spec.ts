import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_CLIENT_EMAIL;
const password = process.env.E2E_CLIENT_PASSWORD;

async function openFoodInput(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email!);
  await page.getByPlaceholder('Password').fill(password!);
  await page.locator('form').getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/dashboard/log');
  await page.getByText('Tap to log this meal').first().click();
  await expect(page.getByPlaceholder(/What did you eat/)).toBeVisible();
}

function parsedItem(overrides: Record<string, unknown> = {}) {
  return {
    raw_text: 'ajiaco',
    food_name: 'ajiaco',
    name_localized: 'Ajiaco',
    quantity: 1,
    unit: 'serving',
    grams: 500,
    calories: 400,
    protein_g: 28,
    carbs_g: 45,
    fat_g: 12,
    fiber_g: 6,
    sugar_g: 5,
    confidence: 0.58,
    source: 'ai_estimate',
    portion_explicit: false,
    ...overrides,
  };
}

test.describe("Nik's rendered food-logging regressions", () => {
  test.skip(!email || !password, 'Set E2E_CLIENT_EMAIL/E2E_CLIENT_PASSWORD');

  test('uncertain portions offer sizes, photo, editable grams, and Escape cancellation', async ({ page }) => {
    await page.route('**/api/food/parse', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [parsedItem()],
        needs_clarification: true,
        clarification_question: 'How big was the serving?',
      }),
    }));
    await openFoodInput(page);
    await page.getByPlaceholder(/What did you eat/).fill('ajiaco');
    await page.getByPlaceholder(/What did you eat/).press('Enter');

    await expect(page.getByText('Small')).toBeVisible();
    await expect(page.getByText('Medium')).toBeVisible();
    await expect(page.getByText('Large')).toBeVisible();
    await expect(page.getByText('350 g')).toBeVisible();
    await expect(page.getByText('500 g')).toBeVisible();
    await expect(page.getByText('700 g')).toBeVisible();
    await expect(page.getByRole('button', { name: /take photo/i })).toBeVisible();

    const amount = page.getByRole('spinbutton', { name: /amount/i });
    await amount.fill('700');
    await amount.press('Escape');
    await expect(amount).toHaveValue('500');
    await amount.fill('700');
    await amount.press('Enter');
    await expect(amount).toHaveValue('700');
  });

  test('volume portion choices stay in the original display unit', async ({ page }) => {
    await page.route('**/api/food/parse', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [parsedItem({ quantity: 500, unit: 'ml', grams: 520 })] }),
    }));
    await openFoodInput(page);
    await page.getByPlaceholder(/What did you eat/).fill('500 ml soup');
    await page.getByPlaceholder(/What did you eat/).press('Enter');

    await expect(page.getByText('350 ml')).toBeVisible();
    await expect(page.getByText('500 ml')).toBeVisible();
    await expect(page.getByText('700 ml')).toBeVisible();
  });

  test('question-only clarification offers size answers and a photo path', async ({ page }) => {
    await page.route('**/api/food/parse', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        needs_clarification: true,
        clarification_question: 'How big was the portion?',
      }),
    }));
    await openFoodInput(page);
    await page.getByPlaceholder(/What did you eat/).fill('ajiaco');
    await page.getByPlaceholder(/What did you eat/).press('Enter');

    await expect(page.getByRole('button', { name: 'Small' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Medium' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Large' })).toBeVisible();
    await expect(page.getByRole('button', { name: /take photo/i })).toBeVisible();
  });
});
