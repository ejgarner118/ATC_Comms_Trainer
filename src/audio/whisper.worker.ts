import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = "Xenova/whisper-base.en";

type Transcriber = Awaited<ReturnType<typeof pipeline<"automatic-speech-recognition">>>;

let transcriber: Transcriber | null = null;
let chain: Promise<void> = Promise.resolve();

async function model(): Promise<Transcriber> {
  if (!transcriber) {
    try {
      transcriber = await pipeline("automatic-speech-recognition", MODEL, { device: "webgpu" });
    } catch {
      transcriber = await pipeline("automatic-speech-recognition", MODEL, { device: "wasm" });
    }
  }
  return transcriber;
}

interface RequestMessage {
  id: number;
  audio?: Float32Array;
  warmup?: boolean;
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const request = event.data;
  chain = chain.then(async () => {
    try {
      const asr = await model();
      if (request.warmup || !request.audio) {
        self.postMessage({ id: request.id, text: "" });
        return;
      }
      const output = await asr(request.audio);
      self.postMessage({ id: request.id, text: (output.text ?? "").trim() });
    } catch (error) {
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : "recognizer failed",
      });
    }
  });
};
