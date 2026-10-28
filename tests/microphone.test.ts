import { describe, expect, it } from "vitest";
import {
  dropPressBurst,
  limitPreRoll,
  MIN_SPEECH_MS,
  PRE_ROLL_MS,
  PRESS_BURST_MS,
  speechClip,
  trimSilence,
} from "../src/audio/stt";

const RATE = 16000;

describe("microphone clip", () => {
  it("keeps about 350 ms of pre-roll from the end of the buffer", () => {
    const samples = new Float32Array(RATE);
    for (let i = 0; i < samples.length; i += 1) samples[i] = i;
    const kept = limitPreRoll(samples, RATE);
    const expected = Math.floor((RATE * PRE_ROLL_MS) / 1000);
    expect(kept.length).toBe(expected);
    expect(kept[0]).toBe(samples[samples.length - expected]);
    expect(kept[kept.length - 1]).toBe(samples[samples.length - 1]);
  });

  it("drops the squelch burst after the press and trims silence", () => {
    const preRoll = Math.floor((RATE * 100) / 1000);
    const burst = Math.floor((RATE * PRESS_BURST_MS) / 1000);
    const speech = Math.floor((RATE * 500) / 1000);
    const tail = Math.floor((RATE * 200) / 1000);
    const samples = new Float32Array(preRoll + burst + speech + tail);
    samples.fill(0);
    samples.fill(1, preRoll, preRoll + burst);
    for (let i = preRoll + burst; i < preRoll + burst + speech; i += 1) samples[i] = 0.4;
    const heard = speechClip(samples, RATE, preRoll);
    expect(heard.length).toBeGreaterThanOrEqual(Math.floor((RATE * MIN_SPEECH_MS) / 1000));
    expect(Math.max(...heard)).toBeLessThan(1);
    expect(heard.some((sample) => sample > 0.2)).toBe(true);
  });

  it("rejects a quiet clip and a clip that is too short", () => {
    expect(speechClip(new Float32Array(RATE), RATE, 0).length).toBe(0);
    const brief = new Float32Array(Math.floor((RATE * 200) / 1000));
    brief.fill(0.5);
    expect(speechClip(brief, RATE, 0).length).toBe(0);
    const silent = trimSilence(new Float32Array(RATE), RATE);
    expect(silent.length).toBe(0);
  });

  it("removes the quiet ends and leaves the words", () => {
    const pad = Math.floor((RATE * 100) / 1000);
    const words = Math.floor((RATE * 500) / 1000);
    const samples = new Float32Array(pad + words + pad);
    for (let i = pad; i < pad + words; i += 1) samples[i] = 0.3;
    const trimmed = trimSilence(samples, RATE);
    expect(trimmed.length).toBe(words);
    expect(trimmed[0]).toBeCloseTo(0.3);
  });
});
