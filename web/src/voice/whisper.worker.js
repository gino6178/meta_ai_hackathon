// Speech to text in a worker, fully offline: Whisper tiny (English, 8-bit) from /models, ONNX runtime bundled with the app.
import { pipeline, env } from "@huggingface/transformers";
// bundled by Vite and served from this app, so the runtime is never fetched from a CDN
import ortMjs from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasm from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
env.backends.onnx.wasm.numThreads = 1;

let asr = null;
self.onmessage = async (e) => {
  const { id, audio } = e.data;
  try {
    if (!asr) {
      self.postMessage({ id, status: "loading" });
      asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", { dtype: "q8", device: "wasm" });
    }
    if (!audio) return self.postMessage({ id, status: "ready" });
    const t0 = performance.now();
    const out = await asr(audio);
    self.postMessage({ id, status: "done", text: out.text.trim(), ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ id, status: "error", error: String(err?.message || err) });
  }
};
