'use client';

/**
 * useVoicePipeline Hook
 *
 * Manages the voice input pipeline (recording → transcription → refinement).
 */

/**
 * React hook for voice-to-text input.
 */
export function useVoicePipeline() {
  // TODO: implement
  // - Start/stop recording
  // - Transcribe via whisper.cpp or Web Speech API
  // - Optional AI refinement of transcription
  return {
    isRecording: false,
    startRecording: () => {},
    stopRecording: () => {},
    transcript: null as string | null,
  };
}
