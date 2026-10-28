import scenarioData from "../../data/ksle.json";

const distortion = new Float32Array(256);
for (let i = 0; i < distortion.length; i += 1) {
  const x = i / 128 - 1;
  distortion[i] = Math.tanh(x * 1.5);
}

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let browserVoice: SpeechSynthesisUtterance | null = null;
let browserVoiceDone: (() => void) | null = null;
let browserVoiceCancelled = false;

function context(): AudioContext {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

function throughRadio(source: AudioNode): void {
  const ctx = context();
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 300;
  highpass.Q.value = 0.707;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3400;
  lowpass.Q.value = 0.707;

  const shaper = ctx.createWaveShaper();
  shaper.curve = distortion;
  shaper.oversample = "2x";

  const gain = ctx.createGain();
  gain.gain.value = 1.15;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(shaper);
  shaper.connect(gain);
  gain.connect(ctx.destination);
  document.documentElement.dataset.radioFilter = "highpass-300 lowpass-3400";
}

/** Call during the click or key that starts a transmission so playback is allowed. */
export function armRadio(): void {
  const ctx = context();
  if (ctx.state === "suspended") void ctx.resume();
}

/** A short squelch tick at the open and close of a transmission. */
export function playSquelch(): void {
  const ctx = context();
  if (ctx.state === "suspended") void ctx.resume();
  const duration = 0.028;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const env = 1 - i / length;
    data[i] = (Math.random() * 2 - 1) * env * env;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  throughRadio(source);
  source.start();
}

export function stopRadio(): void {
  const source = currentSource;
  currentSource = null;
  if (source) {
    try {
      source.stop();
    } catch {
      /* The buffer already ended. */
    }
  }
  stopBrowserVoice();
}

function stopBrowserVoice(): void {
  if (!browserVoice) return;
  browserVoiceCancelled = true;
  const done = browserVoiceDone;
  browserVoice = null;
  browserVoiceDone = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  done?.();
}

/** Play a scripted transmission. The local server uses the radio chain; otherwise the browser speaks the same line. */
export async function playRadio(phraseId: string): Promise<void> {
  const ctx = context();
  if (ctx.state === "suspended") await ctx.resume();
  stopRadio();

  try {
    const encoded = await fetchAudio(phraseId);
    const buffer = await ctx.decodeAudioData(encoded.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    currentSource = source;
    throughRadio(source);
    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (currentSource === source) currentSource = null;
        resolve();
      };
      source.start();
    });
  } catch {
    await speakInBrowser(phraseId);
  }
}

function spokenLine(phraseId: string): string | null {
  const line = scenarioData.transmissions[phraseId as keyof typeof scenarioData.transmissions];
  return line?.spoken ?? null;
}

async function speakInBrowser(phraseId: string): Promise<void> {
  const text = spokenLine(phraseId);
  if (!text || typeof speechSynthesis === "undefined") throw new Error("speech unavailable");
  if (speechSynthesis.getVoices().length === 0) {
    await new Promise<void>((resolve) => {
      const done = () => {
        speechSynthesis.removeEventListener("voiceschanged", done);
        resolve();
      };
      speechSynthesis.addEventListener("voiceschanged", done);
      window.setTimeout(done, 400);
    });
  }
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    const voice = speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("en"));
    if (voice) utterance.voice = voice;
    browserVoiceCancelled = false;
    browserVoice = utterance;
    let settled = false;
    const finish = (failed: boolean) => {
      if (settled) return;
      settled = true;
      if (browserVoice === utterance) {
        browserVoice = null;
        browserVoiceDone = null;
      }
      if (failed) reject(new Error("speech unavailable"));
      else resolve();
    };
    browserVoiceDone = () => finish(false);
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(!browserVoiceCancelled);
    window.setTimeout(() => {
      if (browserVoice !== utterance) return;
      speechSynthesis.speak(utterance);
    }, 0);
  });
}

async function fetchAudio(phraseId: string): Promise<ArrayBuffer> {
  const attempt = async () => {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: phraseId }),
    });
    if (!response.ok) throw new Error(`Speech server returned ${response.status}`);
    return response.arrayBuffer();
  };
  try {
    return await attempt();
  } catch {
    return await attempt();
  }
}
