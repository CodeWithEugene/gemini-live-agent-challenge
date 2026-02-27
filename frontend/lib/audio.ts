/**
 * Audio utilities
 *
 * - PCM capture: AudioWorklet downsamples mic input to 16kHz, 16-bit PCM
 *   (the exact format required by the Gemini Live API).
 * - PCM playback: queues incoming base64-encoded PCM chunks from the server
 *   and plays them sequentially via the Web Audio API.
 */

// ---------------------------------------------------------------------------
// AudioWorklet processor source (inlined as a Blob URL so no separate file needed)
// ---------------------------------------------------------------------------
const WORKLET_SRC = /* js */ `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 0;
    // Send chunks every ~250 ms at 16kHz = 4000 samples
    this._chunkSamples = 4000;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Float32 at context sample rate
    for (let i = 0; i < samples.length; i++) {
      this._buffer.push(samples[i]);
    }
    this._bufferSize += samples.length;

    if (this._bufferSize >= this._chunkSamples) {
      const chunk = new Float32Array(this._buffer.splice(0, this._chunkSamples));
      this._bufferSize -= this._chunkSamples;
      // Convert Float32 → Int16
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
`;

let workletUrl: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrl) {
    const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
    workletUrl = URL.createObjectURL(blob);
  }
  return workletUrl;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface AudioCapture {
  stop: () => void;
}

/**
 * Start capturing microphone audio and invoke `onChunk` with each base64-
 * encoded 16-bit PCM chunk (sampled at 16kHz).
 */
export async function startAudioCapture(
  onChunk: (base64Pcm: string) => void
): Promise<AudioCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule(getWorkletUrl());

  const source = ctx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(ctx, "pcm-processor");

  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    const bytes = new Uint8Array(e.data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    onChunk(btoa(binary));
  };

  source.connect(worklet);
  worklet.connect(ctx.destination);

  return {
    stop: () => {
      source.disconnect();
      worklet.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

export class AudioPlayer {
  private ctx: AudioContext;
  private queue: ArrayBuffer[] = [];
  private playing = false;
  private sampleRate: number;

  constructor(sampleRate = 24000) {
    this.ctx = new AudioContext({ sampleRate });
    this.sampleRate = sampleRate;
  }

  /** Enqueue a base64-encoded 16-bit PCM chunk for playback. */
  enqueue(base64Pcm: string): void {
    const binary = atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    this.queue.push(bytes.buffer);
    if (!this.playing) this._drain();
  }

  private _drain(): void {
    if (this.queue.length === 0) {
      this.playing = false;
      return;
    }
    this.playing = true;
    const buffer = this.queue.shift()!;
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const audioBuffer = this.ctx.createBuffer(1, float32.length, this.sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.ctx.destination);
    source.onended = () => this._drain();
    source.start();
  }

  stop(): void {
    this.queue = [];
    this.playing = false;
    this.ctx.close();
  }

  resume(): void {
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
}
