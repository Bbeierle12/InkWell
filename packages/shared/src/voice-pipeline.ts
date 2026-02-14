/**
 * Voice Pipeline FSM
 *
 * Finite state machine for the voice-to-text pipeline.
 * Defines valid transitions between pipeline states.
 */

import {
  VoicePipelineState as S,
  VoicePipelineEvent as E,
  type VoicePipelineTransition,
} from './types';

/** Transition table: [currentState, event] → nextState */
const transitionTable: Array<[S, E, S]> = [
  [S.Idle, E.StartRecording, S.Recording],
  [S.Recording, E.StopRecording, S.Transcribing],
  [S.Transcribing, E.TranscriptionComplete, S.Refining],
  [S.Refining, E.RefinementComplete, S.Done],
  // ErrorOccurred from any state → Error
  [S.Idle, E.ErrorOccurred, S.Error],
  [S.Recording, E.ErrorOccurred, S.Error],
  [S.Transcribing, E.ErrorOccurred, S.Error],
  [S.Refining, E.ErrorOccurred, S.Error],
  [S.Done, E.ErrorOccurred, S.Error],
  // Reset from Error or Done → Idle
  [S.Error, E.Reset, S.Idle],
  [S.Done, E.Reset, S.Idle],
];

/**
 * Attempt a state transition.
 * Returns the transition if valid, or null if the event is not valid
 * for the current state.
 */
export function transition(
  current: S,
  event: E,
): VoicePipelineTransition | null {
  for (const [from, evt, to] of transitionTable) {
    if (from === current && evt === event) {
      return { from, to, event: evt };
    }
  }
  return null;
}
