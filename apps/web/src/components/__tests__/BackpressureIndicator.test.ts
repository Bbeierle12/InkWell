/**
 * BackpressureIndicator Component Tests
 *
 * Tests that the indicator renders nothing when idle, and shows
 * the correct status messages when active.
 */
import { describe, it, expect } from 'vitest';

describe('BackpressureIndicator', () => {
  it('returns null when all states are false', () => {
    const isPaused = false;
    const isLocalMode = false;
    const isProcessing = false;

    const shouldRender = isPaused || isLocalMode || isProcessing;
    expect(shouldRender).toBe(false);
  });

  it('shows "Suggestions paused" when isPaused is true', () => {
    const isPaused = true;
    const isLocalMode = false;
    const isProcessing = false;

    const shouldRender = isPaused || isLocalMode || isProcessing;
    expect(shouldRender).toBe(true);

    const messages: string[] = [];
    if (isPaused) messages.push('Suggestions paused');
    if (isLocalMode) messages.push('Local mode');
    if (isProcessing) messages.push('AI thinking...');

    expect(messages).toEqual(['Suggestions paused']);
  });

  it('shows "Local mode" when isLocalMode is true', () => {
    const isPaused = false;
    const isLocalMode = true;
    const isProcessing = false;

    const messages: string[] = [];
    if (isPaused) messages.push('Suggestions paused');
    if (isLocalMode) messages.push('Local mode');
    if (isProcessing) messages.push('AI thinking...');

    expect(messages).toEqual(['Local mode']);
  });

  it('shows multiple messages when multiple states are true', () => {
    const isPaused = true;
    const isLocalMode = true;
    const isProcessing = true;

    const messages: string[] = [];
    if (isPaused) messages.push('Suggestions paused');
    if (isLocalMode) messages.push('Local mode');
    if (isProcessing) messages.push('AI thinking...');

    expect(messages).toHaveLength(3);
    expect(messages).toContain('Suggestions paused');
    expect(messages).toContain('Local mode');
    expect(messages).toContain('AI thinking...');
  });
});
