import { test, expect } from '@playwright/test';

/**
 * 7.2 AI-Assisted Editing Flows (UI mechanics only — no real AI backend)
 */
test.describe('7.2 AI UI Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();
  });

  test('should show slash command palette on typing /', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();

    // Type "/" to trigger the slash command menu
    await page.keyboard.press('/');

    // Wait for the slash menu to appear
    const menu = page.locator('#inkwell-slash-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Should have 4 command options (Rewrite, Summarize, Expand, Critique)
    const options = menu.locator('[role="option"]');
    await expect(options).toHaveCount(4);
  });

  test('should navigate slash menu with arrow keys and dismiss with Escape', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();

    await page.keyboard.press('/');
    const menu = page.locator('#inkwell-slash-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // First item should be selected by default
    const firstOption = menu.locator('[role="option"]').first();
    await expect(firstOption).toHaveAttribute('aria-selected', 'true');

    // ArrowDown should move selection to second item
    await page.keyboard.press('ArrowDown');
    const secondOption = menu.locator('[role="option"]').nth(1);
    await expect(secondOption).toHaveAttribute('aria-selected', 'true');
    await expect(firstOption).toHaveAttribute('aria-selected', 'false');

    // Escape should dismiss the menu
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
  });

  test('should filter slash commands by query', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();

    await page.keyboard.press('/');
    const menu = page.locator('#inkwell-slash-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Type "re" to filter — should show only Rewrite
    await page.keyboard.pressSequentially('re');

    // Wait for filtering to take effect
    const options = menu.locator('[role="option"]');
    await expect(options).toHaveCount(1);
    const text = await options.first().textContent();
    expect(text?.toLowerCase()).toContain('rewrite');
  });

  test('should show AI toolbar dropdown with menu items', async ({ page }) => {
    // Click the AI operations button in the toolbar
    const aiButton = page.getByRole('button', { name: 'AI operations' });
    await aiButton.click();

    // Verify dropdown menu appears
    const aiMenu = page.getByRole('menu', { name: 'AI operations menu' });
    await expect(aiMenu).toBeVisible();

    // Should have 4 menu items
    const menuItems = aiMenu.getByRole('menuitem');
    await expect(menuItems).toHaveCount(4);

    // Verify menu item labels
    const items = await menuItems.allTextContents();
    expect(items).toContain('Rewrite');
    expect(items).toContain('Summarize');
    expect(items).toContain('Expand');
    expect(items).toContain('Critique');
  });

  test('should show Online mode indicator by default', async ({ page }) => {
    // The mode indicator should show "Online" by default
    const modeIndicator = page.getByRole('status', { name: 'Online mode' });
    await expect(modeIndicator).toBeVisible();
    await expect(modeIndicator).toContainText('Online');
  });
});
