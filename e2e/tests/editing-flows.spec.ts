import { test, expect } from '@playwright/test';

/**
 * 7.1 Core Editing Flows
 */
test.describe('7.1 Core Editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('inkwell-editor')).toBeVisible();
  });

  test('should load the editor', async ({ page }) => {
    const editor = page.getByTestId('inkwell-editor');
    await expect(editor).toBeVisible();
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await expect(textbox).toBeVisible();
    await expect(textbox).toHaveAttribute('contenteditable', 'true');
  });

  test('should type and display text', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Hello World');
    await expect(textbox).toContainText('Hello World');
  });

  test('should apply bold formatting', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Bold text');

    // Select all text
    await page.keyboard.press('Control+a');
    // Click Bold button
    await page.getByRole('button', { name: 'Bold' }).click();

    // Verify <strong> tag exists in editor content
    const strong = textbox.locator('strong');
    await expect(strong).toContainText('Bold text');

    // Verify aria-pressed state
    const boldBtn = page.getByRole('button', { name: 'Bold' });
    await expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('should apply italic formatting', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Italic text');

    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: 'Italic' }).click();

    const em = textbox.locator('em');
    await expect(em).toContainText('Italic text');

    const italicBtn = page.getByRole('button', { name: 'Italic' });
    await expect(italicBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('should undo and redo edits', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Hello');

    await expect(textbox).toContainText('Hello');

    // Undo
    await page.keyboard.press('Control+z');
    // After undo, the text should be removed (or partially removed)
    // TipTap batches input into transactions, so undo removes recent input
    await expect(textbox).not.toContainText('Hello');

    // Redo
    await page.keyboard.press('Control+y');
    await expect(textbox).toContainText('Hello');
  });

  test('should change heading levels', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Heading Text');

    // Select all
    await page.keyboard.press('Control+a');

    // Change to Heading 1
    const headingSelect = page.getByLabel('Heading level');
    await headingSelect.selectOption('1');

    // Verify h1 exists
    const h1 = textbox.locator('h1');
    await expect(h1).toContainText('Heading Text');
  });

  test('should toggle list types', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('List item');

    // Click Bullet list
    await page.getByRole('button', { name: 'Bullet list' }).click();
    const ul = textbox.locator('ul');
    await expect(ul).toBeVisible();

    // Toggle to Ordered list
    await page.getByRole('button', { name: 'Ordered list' }).click();
    const ol = textbox.locator('ol');
    await expect(ol).toBeVisible();
  });

  test('should handle copy and paste', async ({ page }) => {
    const textbox = page.getByRole('textbox', { name: 'Document editor' });
    await textbox.click();
    await page.keyboard.type('Copy me');

    // Select all, copy
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');

    // Move to end and create new line
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Paste
    await page.keyboard.press('Control+v');

    // Should have text appearing twice (original + pasted)
    const text = await textbox.textContent();
    const count = (text?.match(/Copy me/g) ?? []).length;
    expect(count).toBe(2);
  });
});
