import { test, expect } from '@playwright/test';

test.describe('Settings Flows', () => {
  test('opens AI tab without renderer errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');

    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.getByRole('tab', { name: 'AI' }).click();

    await expect(page.getByLabel('Claude API key')).toBeVisible();
    await expect(page.getByText('Auth method')).toBeVisible();
    await expect(page.getByText('Ghost text suggestions')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
