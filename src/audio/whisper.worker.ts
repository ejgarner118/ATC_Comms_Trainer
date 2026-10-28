import { env, pipeline } from "@huggingface/transformers";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url";

env.allowLocalModels = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.wasmPaths = { wasm: wasmUrl };
  wasm.numThreads = 1;
}

const MODEL = "Xenova/whisper-base.en";

type Transcriber = Awaited<ReturnType<typeof pipeline<"automatic-speech-recognition">>>;

let webgpuModel: Transcriber | null = null;
let wasmModel: Transcriber | null = null;
let webgpuBroken = false;
let chain: Promise<void> = Promise.resolve();

async function webgpu(): Promise<Transcriber | null> {
  if (webgpuBroken) return null;
  if (!webgpuModel) {
    try {
      webgpuModel = await pipeline("automatic-speech-recognition", MODEL, { device: "webgpu" });
    } catch {
      webgpuBroken = true;
      return null;
    }
  }
  return webgpuModel;
}

async function wasmRecognizer(): Promise<Transcriber> {
  if (!wasmModel) {
    wasmModel = await pipeline("automatic-speech-recognition", MODEL, { device: "wasm" });
  }
  return wasmModel;
}

async function readText(recognizer: Transcriber, audio: Float32Array): Promise<string> {
  const output = await recognizer(audio);
  return (output.text ?? "").trim();
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
      if (request.warmup || !request.audio) {
        await (await webgpu()) ?? (await wasmRecognizer());
        self.postMessage({ id: request.id, text: "" });
        return;
      }
      const gpu = await webgpu();
      if (gpu) {
        try {
          const text = await readText(gpu, request.audio);
          if (text) {
            self.postMessage({ id: request.id, text });
            return;
          }
        } catch {
          webgpuBroken = true;
        }
      }
      webgpuBroken = true;
      self.postMessage({ id: request.id, text: await readText(await wasmRecognizer(), request.audio) });
    } catch (error) {
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : "recognizer failed",
      });
    }
  });
};
