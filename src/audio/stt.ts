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

type Ear = "server" | "browser";

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface RecognitionEvent extends Event {
  readonly results: ArrayLike<RecognitionResult>;
}

interface RecognitionErrorEvent extends Event {
  readonly error: string;
}

interface BrowserRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onaudiostart: ((event: Event) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

interface RecognitionConstructor {
  new (): BrowserRecognition;
}

interface HearResult {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
}

let ear: Ear = "browser";
let activeEar: Ear = "browser";
let holding = false;
let recognition: BrowserRecognition | null = null;
let heardText = "";
let hearResult: HearResult | null = null;
let hearSettled = false;
let pending: Promise<string> = Promise.resolve("");
let streamPromise: Promise<MediaStream> | null = null;
let starting: Promise<void> | null = null;
let releaseRecording: (() => void) | null = null;
let recorder: MediaRecorder | null = null;
let blobs: Blob[] = [];

function recognitionConstructor(): RecognitionConstructor | null {
  const host = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

/** One check. A 404 means the published site, so Chrome hears the transmission. */
export function prepareEar(): void {
  void fetch("/api/hear", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new ArrayBuffer(0),
  })
    .then((response) => {
      if (response.status !== 404) ear = "server";
    })
    .catch(() => undefined);
}

/** Begin hearing inside the push-to-talk gesture. */
export function startListening(): void {
  holding = true;
  activeEar = ear;
  if (activeEar === "server") {
    pending = new Promise<string>((resolve, reject) => {
      releaseRecording = () => {
        void finishRecording().then(resolve, reject);
      };
    });
    starting = beginRecording();
    return;
  }
  pending = beginRecognition();
}

/** End the hold and return the words that were heard. */
export function stopListening(): Promise<string> {
  holding = false;
  if (activeEar === "server") {
    releaseRecording?.();
    releaseRecording = null;
    return pending;
  }
  try {
    recognition?.stop();
  } catch {
    finishRecognition(heardText);
  }
  return pending;
}

function beginRecognition(): Promise<string> {
  const Ctor = recognitionConstructor();
  heardText = "";
  hearSettled = false;
  const result = new Promise<string>((resolve, reject) => {
    hearResult = { resolve, reject };
  });
  if (!Ctor) {
    finishRecognition("");
    return result;
  }
  const rec = new Ctor();
  recognition = rec;
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onaudiostart = () => {
    document.documentElement.dataset.micHearing = "live";
  };
  rec.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i += 1) {
      text += `${event.results[i]?.[0]?.transcript ?? ""} `;
    }
    heardText = text.replace(/\s+/g, " ").trim();
  };
  rec.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      failRecognition(new MicrophoneBlocked());
    }
  };
  rec.onend = () => finishRecognition(heardText);
  try {
    rec.start();
  } catch (error) {
    failRecognition(error instanceof MicrophoneBlocked ? error : new Error("speech recognition failed"));
  }
  return result;
}

function finishRecognition(text: string): void {
  if (hearSettled) return;
  hearSettled = true;
  hearResult?.resolve(text);
  recognition = null;
}

function failRecognition(error: Error): void {
  if (hearSettled) return;
  hearSettled = true;
  hearResult?.reject(error);
  recognition = null;
}

function micStream(): Promise<MediaStream> {
  if (!streamPromise) {
    streamPromise = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })
      .catch((error: unknown) => {
        streamPromise = null;
        throw error instanceof MicrophoneBlocked ? error : new MicrophoneBlocked();
      });
  }
  return streamPromise;
}

async function beginRecording(): Promise<void> {
  const live = await micStream();
  if (!holding || recorder) return;
  blobs = [];
  const rec = new MediaRecorder(live);
  recorder = rec;
  rec.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) blobs.push(event.data);
  });
  if (holding) rec.start();
}

async function finishRecording(): Promise<string> {
  try {
    if (starting) await starting;
  } catch (error) {
    throw error instanceof MicrophoneBlocked ? error : new MicrophoneBlocked();
  }
  const rec = recorder;
  recorder = null;
  if (!rec) return "";
  const blob = await stoppedBlob(rec);
  const audio = await clipFromBlob(blob);
  return (await transcribeOnServer(audio)) ?? "";
}

function stoppedBlob(rec: MediaRecorder): Promise<Blob> {
  if (rec.state === "inactive") {
    return Promise.resolve(new Blob(blobs, { type: rec.mimeType || "audio/webm" }));
  }
  return new Promise((resolve) => {
    rec.addEventListener(
      "stop",
      () => resolve(new Blob(blobs, { type: rec.mimeType || "audio/webm" })),
      { once: true },
    );
    if (rec.state !== "inactive") rec.stop();
  });
}

async function clipFromBlob(blob: Blob): Promise<Float32Array> {
  if (blob.size === 0) return new Float32Array();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const pcm = downsample(decoded.getChannelData(0), decoded.sampleRate, TARGET_RATE);
    return speechClip(pcm, TARGET_RATE, 0);
  } catch {
    return new Float32Array();
  } finally {
    await ctx.close();
  }
}

async function transcribeOnServer(audio: Float32Array): Promise<string | null> {
  if (audio.length === 0) return "";
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

/** A clip the local recognizer should hear. Quiet or very short audio comes back empty. */
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
