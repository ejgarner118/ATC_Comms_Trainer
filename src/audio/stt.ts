export type RecognizerStatus = "loading" | "ready" | "failed";

export const PRE_ROLL_MS = 350;
export const PRESS_BURST_MS = 80;
export const MIN_SPEECH_MS = 400;
const SILENCE = 0.015;
const TARGET_RATE = 16000;

export class MicrophoneBlocked extends Error {
  constructor() {
    super("microphone blocked");
    this.name = "MicrophoneBlocked";
  }
}

interface WorkerReply {
  id: number;
  text?: string;
  error?: string;
}

interface Pending {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
}

let status: RecognizerStatus = "loading";
let worker: Worker | null = null;
let onStatus: ((status: RecognizerStatus) => void) | null = null;
const waiters = new Map<number, Pending>();
let nextId = 1;

function workerFor(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const pending = waiters.get(event.data.id);
    if (!pending) return;
    waiters.delete(event.data.id);
    if (event.data.error) {
      status = "failed";
      onStatus?.("failed");
      pending.reject(new Error(event.data.error));
      return;
    }
    status = "ready";
    onStatus?.("ready");
    pending.resolve(event.data.text ?? "");
  };
  worker.onerror = () => {
    status = "failed";
    onStatus?.("failed");
    for (const pending of waiters.values()) pending.reject(new Error("recognizer failed"));
    waiters.clear();
  };
  return worker;
}

/** Start loading the local recognizer. The typed box stays available either way. */
export function preloadRecognizer(listener: (status: RecognizerStatus) => void): void {
  onStatus = listener;
  listener(status);
  const id = nextId++;
  waiters.set(id, {
    resolve: () => undefined,
    reject: () => undefined,
  });
  workerFor().postMessage({ id, warmup: true });
}

/** Prefer the speech server. A 503 or a network miss falls back to the browser model. */
export async function transcribeHeard(audio: Float32Array): Promise<string> {
  const server = await transcribeOnServer(audio);
  if (server !== null) return server;
  return transcribeClip(audio);
}

async function transcribeOnServer(audio: Float32Array): Promise<string | null> {
  const body = new ArrayBuffer(audio.byteLength);
  new Float32Array(body).set(audio);
  try {
    const response = await fetch("/api/hear", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body,
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("text" in payload)) return null;
    const text = payload.text;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

export function transcribeClip(audio: Float32Array): Promise<string> {
  if (status === "failed") return Promise.reject(new Error("recognizer failed"));
  const id = nextId++;
  const buffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  return new Promise((resolve, reject) => {
    waiters.set(id, { resolve, reject });
    workerFor().postMessage({ id, audio: new Float32Array(buffer) }, [buffer]);
  });
}

let context: AudioContext | null = null;
let stream: MediaStream | null = null;
let opening: Promise<void> | null = null;
let ring: Float32Array[] = [];
let ringSamples = 0;
let recording: Float32Array[] | null = null;
let preRollSamples = 0;
let lastClipSamples = 0;

/** Open the microphone on the push-to-talk gesture and leave it open. */
export function armMicrophone(): void {
  if (!context) {
    const ctx = new AudioContext();
    context = ctx;
    opening = openStream(ctx);
    void opening.catch(() => undefined);
  }
  void context.resume();
}

/** The last clip contained microphone samples, before silence was trimmed. */
export function lastClipHadSamples(): boolean {
  return lastClipSamples > 0;
}

export function microphoneReady(): Promise<void> {
  if (!opening) return Promise.reject(new MicrophoneBlocked());
  return opening;
}

/** Copy the pre-roll and record what follows. */
export function beginClip(): void {
  recording = ring.map((chunk) => new Float32Array(chunk));
  preRollSamples = ringSamples;
  ring = [];
  ringSamples = 0;
}

/** Stop the clip. The stream stays open for the next press. */
export function endClip(): Promise<Float32Array> {
  if (opening && !stream) {
    return opening.then(
      () => takeClip(),
      () => {
        recording = null;
        preRollSamples = 0;
        throw new MicrophoneBlocked();
      },
    );
  }
  return Promise.resolve(takeClip());
}

function takeClip(): Float32Array {
  const chunks = recording ?? [];
  const preRoll = preRollSamples;
  recording = null;
  preRollSamples = 0;
  lastClipSamples = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const rate = context?.sampleRate || TARGET_RATE;
  const pcm = downsample(concat(chunks), rate, TARGET_RATE);
  const preRollAtTarget = Math.round((preRoll * TARGET_RATE) / rate);
  return speechClip(pcm, TARGET_RATE, preRollAtTarget);
}

async function openStream(ctx: AudioContext): Promise<void> {
  void ctx.resume();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
  } catch {
    throw new MicrophoneBlocked();
  }
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.onaudioprocess = (event) => {
    remember(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
}

function remember(chunk: Float32Array): void {
  if (recording) {
    recording.push(chunk);
    return;
  }
  ring.push(chunk);
  ringSamples += chunk.length;
  const max = Math.floor(((context?.sampleRate || TARGET_RATE) * PRE_ROLL_MS) / 1000);
  while (ringSamples > max && ring.length > 0) {
    const next = ring[0];
    if (ring.length === 1 || ringSamples - next.length < max) {
      const keep = max;
      const overflow = ringSamples - keep;
      if (overflow > 0) {
        ring[0] = next.subarray(overflow);
        ringSamples = keep;
      }
      break;
    }
    ring.shift();
    ringSamples -= next.length;
  }
}

/** Keep the newest slice of audio, about one pre-roll long. */
export function limitPreRoll(samples: Float32Array, sampleRate: number, maxMs = PRE_ROLL_MS): Float32Array {
  const max = Math.floor((sampleRate * maxMs) / 1000);
  if (samples.length <= max) return samples;
  return samples.subarray(samples.length - max);
}

/** Drop the squelch burst that lands just after the button press. */
export function dropPressBurst(
  samples: Float32Array,
  sampleRate: number,
  preRollSamples: number,
  burstMs = PRESS_BURST_MS,
): Float32Array {
  const burst = Math.floor((sampleRate * burstMs) / 1000);
  const start = Math.min(Math.max(0, preRollSamples), samples.length);
  const end = Math.min(samples.length, start + burst);
  if (end <= start) return samples;
  const out = new Float32Array(samples.length - (end - start));
  out.set(samples.subarray(0, start));
  out.set(samples.subarray(end), start);
  return out;
}

/** Remove quiet samples from both ends of a clip. */
export function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
  const frame = Math.max(1, Math.floor(sampleRate * 0.02));
  let start = -1;
  for (let i = 0; i + frame <= samples.length; i += frame) {
    if (frameRms(samples, i, i + frame) >= SILENCE) {
      start = i;
      break;
    }
  }
  if (start < 0) return new Float32Array();
  let end = samples.length;
  for (let i = samples.length; i - frame >= start; i -= frame) {
    if (frameRms(samples, i - frame, i) >= SILENCE) {
      end = i;
      break;
    }
  }
  return samples.subarray(start, end);
}

/** A clip Whisper should hear. Quiet or very short audio comes back empty. */
export function speechClip(samples: Float32Array, sampleRate: number, preRollSamples: number): Float32Array {
  const trimmed = trimSilence(dropPressBurst(samples, sampleRate, preRollSamples), sampleRate);
  const min = Math.floor((sampleRate * MIN_SPEECH_MS) / 1000);
  if (trimmed.length < min || rms(trimmed) < SILENCE) return new Float32Array();
  return trimmed;
}

function frameRms(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

function rms(samples: Float32Array): number {
  return frameRms(samples, 0, samples.length);
}

function concat(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const left = input[index] ?? 0;
    const right = input[index + 1] ?? left;
    out[i] = left + (right - left) * fraction;
  }
  return out;
}
