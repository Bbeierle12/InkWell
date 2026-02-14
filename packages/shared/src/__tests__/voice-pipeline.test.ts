import { describe, it, expect } from 'vitest';
import { transition } from '../voice-pipeline';
import { VoicePipelineState as S, VoicePipelineEvent as E } from '../types';

describe('Voice Pipeline FSM', () => {
  it('should start in Idle state', () => {
    const result = transition(S.Idle, E.StartRecording);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(S.Idle);
    expect(result!.to).toBe(S.Recording);
    expect(result!.event).toBe(E.StartRecording);
  });

  it('Idle -> Recording on StartRecording', () => {
    const result = transition(S.Idle, E.StartRecording);
    expect(result).toEqual({
      from: S.Idle,
      to: S.Recording,
      event: E.StartRecording,
    });
  });

  it('Recording -> Transcribing on StopRecording', () => {
    const result = transition(S.Recording, E.StopRecording);
    expect(result).toEqual({
      from: S.Recording,
      to: S.Transcribing,
      event: E.StopRecording,
    });
  });

  it('Transcribing -> Refining on TranscriptionComplete', () => {
    const result = transition(S.Transcribing, E.TranscriptionComplete);
    expect(result).toEqual({
      from: S.Transcribing,
      to: S.Refining,
      event: E.TranscriptionComplete,
    });
  });

  it('Refining -> Done on RefinementComplete', () => {
    const result = transition(S.Refining, E.RefinementComplete);
    expect(result).toEqual({
      from: S.Refining,
      to: S.Done,
      event: E.RefinementComplete,
    });
  });

  it('any state -> Error on ErrorOccurred', () => {
    const statesWithError = [
      S.Idle,
      S.Recording,
      S.Transcribing,
      S.Refining,
      S.Done,
    ];

    for (const state of statesWithError) {
      const result = transition(state, E.ErrorOccurred);
      expect(result).toEqual({
        from: state,
        to: S.Error,
        event: E.ErrorOccurred,
      });
    }
  });

  it('Error -> Idle on Reset', () => {
    const result = transition(S.Error, E.Reset);
    expect(result).toEqual({
      from: S.Error,
      to: S.Idle,
      event: E.Reset,
    });
  });

  it('Done -> Idle on Reset', () => {
    const result = transition(S.Done, E.Reset);
    expect(result).toEqual({
      from: S.Done,
      to: S.Idle,
      event: E.Reset,
    });
  });

  it('invalid: StartRecording from Transcribing -> null', () => {
    const result = transition(S.Transcribing, E.StartRecording);
    expect(result).toBeNull();
  });

  it('invalid: StopRecording from Idle -> null', () => {
    const result = transition(S.Idle, E.StopRecording);
    expect(result).toBeNull();
  });
});
