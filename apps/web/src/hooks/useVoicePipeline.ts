'use client';

/**
 * useVoicePipeline Hook
 *
 * Full orchestrator for the voice-to-text pipeline:
 * Recording → Transcription (Whisper) → Refinement (Claude) → Insertion.
 *
 * Uses the FSM from @inkwell/shared for state management.
 */

import { useState, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import {
  VoicePipelineState as S,
  VoicePipelineEvent as E,
  OperationType,
  type VoicePipelineContext,
  transition,
} from '@inkwell/shared';
import { isTauriEnvironment, transcribeAudioBytes } from '../lib/tauri-bridge';
import { startAudioCapture, type AudioCaptureSession } from '../lib/audio-capture';
import { getDocumentAI } from '../lib/document-ai-instance';

export interface UseVoicePipelineOptions {
  editor: Editor | null;
}

export interface UseVoicePipelineReturn {
  state: S;
  context: VoicePipelineContext;
  isAvailable: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  cancel: () => void;
}

const initialContext: VoicePipelineContext = {
  audioBlob: null,
  rawTranscript: '',
  refinedTranscript: '',
  error: null,
  durationMs: 0,
};

/**
 * React hook for the full voice-to-text pipeline.
 *
 * Stages:
 * 1. startRecording — check Tauri environment, capture mic audio
 * 2. stopRecording — transcribe via Whisper, refine via Claude, insert at cursor
 * 3. cancel — abort at any stage, reset to Idle
 */
export function useVoicePipeline({ editor }: UseVoicePipelineOptions): UseVoicePipelineReturn {
  const [state, setState] = useState<S>(S.Idle);
  const [context, setContext] = useState<VoicePipelineContext>(initialContext);

  const sessionRef = useRef<AudioCaptureSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recordingStartRef = useRef<number>(0);

  const isAvailable = isTauriEnvironment();

  const dispatch = useCallback((event: E, ctxUpdate?: Partial<VoicePipelineContext>) => {
    setState((prev) => {
      const t = transition(prev, event);
      if (!t) return prev;
      if (ctxUpdate) {
        setContext((c) => ({ ...c, ...ctxUpdate }));
      }
      return t.to;
    });
  }, []);

  const resetToIdle = useCallback(() => {
    setState(S.Idle);
    setContext(initialContext);
    sessionRef.current = null;
    abortRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    // Abort any in-flight operations
    abortRef.current?.abort();
    abortRef.current = null;

    // Cancel audio capture if active
    sessionRef.current?.cancel();
    sessionRef.current = null;

    resetToIdle();
  }, [resetToIdle]);

  const startRecording = useCallback(async () => {
    if (state !== S.Idle || !isAvailable) return;

    try {
      const session = await startAudioCapture();
      sessionRef.current = session;
      recordingStartRef.current = Date.now();
      abortRef.current = new AbortController();
      dispatch(E.StartRecording);
    } catch (err) {
      dispatch(E.ErrorOccurred, {
        error: err instanceof Error ? err.message : 'Failed to start recording',
      });
    }
  }, [state, isAvailable, dispatch]);

  const stopRecording = useCallback(async () => {
    if (state !== S.Recording || !sessionRef.current) return;

    const abortController = abortRef.current;

    // Stop capture and get PCM data
    const pcmData = sessionRef.current.stop();
    sessionRef.current = null;
    const durationMs = Date.now() - recordingStartRef.current;

    dispatch(E.StopRecording, { durationMs });

    try {
      // Check for abort
      if (abortController?.signal.aborted) return;

      // Transcribe via Whisper
      const transcription = await transcribeAudioBytes(pcmData);

      if (abortController?.signal.aborted) return;

      if (!transcription || !transcription.text.trim()) {
        dispatch(E.ErrorOccurred, { error: 'Transcription returned empty result' });
        return;
      }

      const rawTranscript = transcription.text;
      dispatch(E.TranscriptionComplete, { rawTranscript });

      // Refine via Claude (with fallback to raw transcript)
      let refinedTranscript = rawTranscript;

      try {
        if (abortController?.signal.aborted) return;

        const service = getDocumentAI();
        const docContent = editor?.state.doc.textContent ?? '';
        const cursorPos = editor?.state.selection.from ?? 0;

        const result = await service.executeOperation({
          operation: OperationType.VoiceRefine,
          docContent,
          cursorPos,
          rawTranscript,
        });

        if (abortController?.signal.aborted) return;

        if (result.raw) {
          refinedTranscript = result.raw;
        }
      } catch {
        // Offline or API failure — fall back to raw transcript
      }

      dispatch(E.RefinementComplete, { refinedTranscript });

      // Insert at current cursor position
      if (editor && !abortController?.signal.aborted) {
        const insertPos = editor.state.selection.from;
        editor.chain().insertContentAt(insertPos, refinedTranscript).run();
      }

      // Auto-reset to Idle after brief delay
      setTimeout(() => {
        setState((prev) => {
          if (prev === S.Done) {
            setContext(initialContext);
            return S.Idle;
          }
          return prev;
        });
      }, 500);
    } catch (err) {
      if (!abortController?.signal.aborted) {
        dispatch(E.ErrorOccurred, {
          error: err instanceof Error ? err.message : 'Voice pipeline failed',
        });
      }
    }
  }, [state, editor, dispatch]);

  return {
    state,
    context,
    isAvailable,
    startRecording: () => void startRecording(),
    stopRecording: () => void stopRecording(),
    cancel,
  };
}
