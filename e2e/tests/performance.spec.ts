import { test, expect } from '@playwright/test';

/**
 * 7.4 Performance Benchmarks
 */
test.describe('7.4 Performance', () => {
  test('should load editor within 2 seconds', async ({ page }) => {
    const start = Date.now();

    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  test('should maintain responsive typing for 100 characters', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();

    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();

    // Type 100 characters with no delay and measure total time
    const text = 'a'.repeat(100);
    const start = Date.now();
    await page.keyboard.type(text);
    const elapsed = Date.now() - start;

    // Average should be under 50ms per keystroke (5000ms total for 100 chars)
    expect(elapsed).toBeLessThan(5000);

    // Verify all characters rendered
    const content = await textbox.textContent();
    expect(content?.length).toBeGreaterThanOrEqual(100);
  });

  test('should handle large documents without crashing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();

    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();

    // Generate ~10K words of text
    const paragraph = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
    const text = paragraph.repeat(100); // ~1200 words x ~8.3 = ~10K words

    // Paste via clipboard to avoid slow key-by-key typing
    await page.evaluate((t) => {
      navigator.clipboard.writeText(t);
    }, text);
    await page.keyboard.press('Control+v');

    // Wait for content to settle
    await page.waitForTimeout(500);

    // Editor should still be visible and functional
    await expect(textbox).toBeVisible();

    // Type one more character to verify responsiveness
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    const content = await textbox.textContent();
    expect(content).toContain('X');
  });

  test('should maintain scroll stability', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();

    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();

    // Type 50 paragraphs to force scrollable content
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`Paragraph ${i + 1} with some extra text to fill the line.`);
      await page.keyboard.press('Enter');
    }

    // Scroll down then up
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(300);

    // Editor should still be visible after scrolling
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();
  });
});
