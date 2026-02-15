/**
 * Audio Capture Utility
 *
 * Captures raw PCM audio from the microphone at 16kHz mono.
 * Returns Float32Array samples suitable for whisper.cpp transcription.
 */

const TARGET_SAMPLE_RATE = 16000;

export interface AudioCaptureSession {
  /** Stop recording and return concatenated PCM Float32Array. */
  stop(): Float32Array;
  /** Cancel recording and release all resources without returning data. */
  cancel(): void;
}

/**
 * Resample audio data from one sample rate to another using linear interpolation.
 */
function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const floor = Math.floor(srcIndex);
    const frac = srcIndex - floor;

    const a = input[floor] ?? 0;
    const b = input[Math.min(floor + 1, input.length - 1)] ?? 0;
    output[i] = a + frac * (b - a);
  }

  return output;
}

/**
 * Start capturing audio from the microphone.
 *
 * Uses getUserMedia + AudioContext + ScriptProcessorNode to capture
 * raw PCM Float32Array chunks. Returns a session object to stop/cancel.
 *
 * @throws {Error} If microphone permission is denied or getUserMedia is unavailable.
 */
export async function startAudioCapture(): Promise<AudioCaptureSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: TARGET_SAMPLE_RATE,
    },
  });

  const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  const source = audioContext.createMediaStreamSource(stream);

  const chunks: Float32Array[] = [];
  let stopped = false;

  // ScriptProcessorNode with 4096 buffer size, 1 input channel, 1 output channel
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  const actualSampleRate = audioContext.sampleRate;

  function releaseResources() {
    stopped = true;
    processor.disconnect();
    source.disconnect();
    for (const track of stream.getTracks()) {
      track.stop();
    }
    void audioContext.close();
  }

  return {
    stop(): Float32Array {
      releaseResources();

      // Concatenate all chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const pcm = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        pcm.set(chunk, offset);
        offset += chunk.length;
      }

      // Resample if the browser didn't honor our 16kHz request
      if (actualSampleRate !== TARGET_SAMPLE_RATE) {
        return resample(pcm, actualSampleRate, TARGET_SAMPLE_RATE);
      }

      return pcm;
    },

    cancel(): void {
      releaseResources();
    },
  };
}
