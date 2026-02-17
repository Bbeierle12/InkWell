import { test, expect } from '@playwright/test';

/**
 * 7.3 Offline/Online Transition Tests
 */
test.describe('7.3 Offline/Online Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();
  });

  test('should show Online mode initially', async ({ page }) => {
    const modeChip = page.getByRole('status', { name: 'Online mode' });
    await expect(modeChip).toBeVisible();
    await expect(modeChip).toContainText('Online');
  });

  test('should switch to Offline mode when network is disconnected', async ({ page, context }) => {
    // Verify initially online
    await expect(page.getByRole('status', { name: 'Online mode' })).toBeVisible();

    // Simulate going offline
    await context.setOffline(true);

    // Trigger a network-dependent action to detect offline state
    // The app listens for the browser's offline event
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Wait for the mode indicator to change
    const offlineChip = page.getByRole('status', { name: 'Offline mode' });
    await expect(offlineChip).toBeVisible({ timeout: 5000 });
    await expect(offlineChip).toContainText('Offline');

    // BackpressureIndicator should show "Local mode"
    const localMode = page.getByText('Local mode');
    await expect(localMode).toBeVisible({ timeout: 5000 });
  });

  test('should recover to Online mode when network is restored', async ({ page, context }) => {
    // Go offline first
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('status', { name: 'Offline mode' })).toBeVisible({ timeout: 5000 });

    // Restore network
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Mode should return to Online
    const onlineChip = page.getByRole('status', { name: 'Online mode' });
    await expect(onlineChip).toBeVisible({ timeout: 5000 });
    await expect(onlineChip).toContainText('Online');
  });

  test('should continue editing while offline', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Type text — editor should still work
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Offline text');

    // Verify text was entered
    await expect(textbox).toContainText('Offline text');
  });
});
