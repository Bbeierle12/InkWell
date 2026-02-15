/**
 * BackpressureIndicator Component Tests
 *
 * Tests that the indicator renders nothing when idle, and shows
 * the correct status messages when active, including error/retry states.
 */
import { describe, it, expect } from 'vitest';

/** Simulates the BackpressureIndicator's render logic. */
function getIndicatorState(props: {
  isPaused: boolean;
  isLocalMode: boolean;
  isProcessing: boolean;
  lastError?: string | null;
}) {
  const { isPaused, isLocalMode, isProcessing, lastError } = props;
  const shouldRender = isPaused || isLocalMode || isProcessing || !!lastError;

  const messages: string[] = [];
  if (isPaused) messages.push('Suggestions paused');
  if (isLocalMode) messages.push('Local mode');
  if (isProcessing) messages.push('AI thinking...');
  if (lastError && !isProcessing) messages.push(lastError);

  return { shouldRender, messages };
}

describe('BackpressureIndicator', () => {
  it('returns null when all states are false', () => {
    const { shouldRender } = getIndicatorState({
      isPaused: false,
      isLocalMode: false,
      isProcessing: false,
    });
    expect(shouldRender).toBe(false);
  });

  it('shows "Suggestions paused" when isPaused is true', () => {
    const { shouldRender, messages } = getIndicatorState({
      isPaused: true,
      isLocalMode: false,
      isProcessing: false,
    });
    expect(shouldRender).toBe(true);
    expect(messages).toEqual(['Suggestions paused']);
  });

  it('shows "Local mode" when isLocalMode is true', () => {
    const { messages } = getIndicatorState({
      isPaused: false,
      isLocalMode: true,
      isProcessing: false,
    });
    expect(messages).toEqual(['Local mode']);
  });

  it('shows multiple messages when multiple states are true', () => {
    const { messages } = getIndicatorState({
      isPaused: true,
      isLocalMode: true,
      isProcessing: true,
    });
    expect(messages).toHaveLength(3);
    expect(messages).toContain('Suggestions paused');
    expect(messages).toContain('Local mode');
    expect(messages).toContain('AI thinking...');
  });

  it('shows error message when lastError is set and not processing', () => {
    const { shouldRender, messages } = getIndicatorState({
      isPaused: false,
      isLocalMode: false,
      isProcessing: false,
      lastError: 'Operation interrupted — connection lost.',
    });
    expect(shouldRender).toBe(true);
    expect(messages).toContain('Operation interrupted — connection lost.');
  });

  it('hides error message while processing (shows AI thinking instead)', () => {
    const { messages } = getIndicatorState({
      isPaused: false,
      isLocalMode: false,
      isProcessing: true,
      lastError: 'Previous error',
    });
    expect(messages).toEqual(['AI thinking...']);
    expect(messages).not.toContain('Previous error');
  });

  it('shows error alongside local mode', () => {
    const { messages } = getIndicatorState({
      isPaused: false,
      isLocalMode: true,
      isProcessing: false,
      lastError: 'AI operation failed.',
    });
    expect(messages).toHaveLength(2);
    expect(messages).toContain('Local mode');
    expect(messages).toContain('AI operation failed.');
  });

  it('returns null when lastError is null and all flags false', () => {
    const { shouldRender } = getIndicatorState({
      isPaused: false,
      isLocalMode: false,
      isProcessing: false,
      lastError: null,
    });
    expect(shouldRender).toBe(false);
  });
});
