'use client';

/**
 * VoiceInput Component
 *
 * Voice-to-text input using whisper.cpp (desktop) or Web Speech API (web).
 */

export function VoiceInput() {
  // TODO: implement
  // - Detect platform (Tauri vs web)
  // - Use appropriate speech recognition backend
  // - Stream transcribed text to editor
  return (
    <button className="px-3 py-1 border rounded text-sm" disabled aria-label="Voice input (coming soon)">
      Voice (coming soon)
    </button>
  );
}
