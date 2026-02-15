'use client';

/**
 * VoiceInput Component
 *
 * State-driven voice recording UI that displays pipeline progress.
 * The Editor owns the useVoicePipeline hook and passes it as a prop.
 */

import { useEffect, useRef, useState } from 'react';
import { VoicePipelineState as S } from '@inkwell/shared';
import type { UseVoicePipelineReturn } from '../hooks/useVoicePipeline';

interface VoiceInputProps {
  pipeline: UseVoicePipelineReturn;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceInput({ pipeline }: VoiceInputProps) {
  const { state, context, isAvailable, startRecording, stopRecording, cancel } = pipeline;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recording timer
  useEffect(() => {
    if (state === S.Recording) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - start);
      }, 200);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state]);

  // Not available outside Tauri
  if (!isAvailable) {
    return (
      <button
        className="px-3 py-1 border rounded text-sm opacity-50 cursor-not-allowed"
        disabled
        aria-label="Voice input (desktop only)"
        title="Voice input is only available in the desktop app"
      >
        Voice (desktop only)
      </button>
    );
  }

  // Idle state
  if (state === S.Idle) {
    return (
      <button
        className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
        onClick={startRecording}
        aria-label="Start voice recording"
      >
        Voice
      </button>
    );
  }

  // Recording state
  if (state === S.Recording) {
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite" aria-label="Recording in progress">
        <button
          className="px-3 py-1 bg-red-600 text-white rounded text-sm animate-pulse hover:bg-red-700"
          onClick={stopRecording}
          aria-label="Stop recording"
        >
          Stop
        </button>
        <span className="text-sm text-gray-600" aria-label={`Recording duration: ${formatDuration(elapsed)}`}>
          {formatDuration(elapsed)}
        </span>
        <button
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
          onClick={cancel}
          aria-label="Cancel recording"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Transcribing state
  if (state === S.Transcribing) {
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite" aria-label="Transcribing audio">
        <span className="text-sm text-gray-600 animate-pulse">Transcribing...</span>
        <button
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
          onClick={cancel}
          aria-label="Cancel transcription"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Refining state
  if (state === S.Refining) {
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite" aria-label="Refining transcription">
        <span className="text-sm text-gray-600 animate-pulse">Refining...</span>
        <button
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
          onClick={cancel}
          aria-label="Cancel refinement"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Done state (brief flash before auto-reset)
  if (state === S.Done) {
    return (
      <div className="flex items-center gap-2" role="status" aria-live="polite" aria-label="Voice input complete">
        <span className="text-sm text-green-600">Inserted</span>
      </div>
    );
  }

  // Error state
  if (state === S.Error) {
    return (
      <div className="flex items-center gap-2" role="alert" aria-live="assertive">
        <span className="text-sm text-red-600">{context.error ?? 'Voice input failed'}</span>
        <button
          className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
          onClick={cancel}
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return null;
}
