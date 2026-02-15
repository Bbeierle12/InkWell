'use client';

/**
 * BackpressureIndicator Component
 *
 * Shows status messages when suggestions are paused, running in local mode,
 * AI is processing, or an error occurred. Returns null when all states are inactive.
 */

interface BackpressureIndicatorProps {
  isPaused: boolean;
  isLocalMode: boolean;
  isProcessing: boolean;
  lastError?: string | null;
  onRetry?: () => void;
}

export function BackpressureIndicator({
  isPaused,
  isLocalMode,
  isProcessing,
  lastError,
  onRetry,
}: BackpressureIndicatorProps) {
  if (!isPaused && !isLocalMode && !isProcessing && !lastError) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-4 px-4 py-2 text-sm border-t"
      style={{ backgroundColor: 'var(--background)' }}
      role="status"
      aria-live="polite"
    >
      {isPaused && (
        <span className="flex items-center gap-1 text-amber-600">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          Suggestions paused
        </span>
      )}
      {isLocalMode && (
        <span className="flex items-center gap-1 text-blue-600">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          Local mode
        </span>
      )}
      {isProcessing && (
        <span className="flex items-center gap-1 text-gray-500 animate-pulse">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
          AI thinking...
        </span>
      )}
      {lastError && !isProcessing && (
        <span className="flex items-center gap-2 text-red-600">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          {lastError}
          {onRetry && (
            <button
              className="underline hover:no-underline text-red-500"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}
