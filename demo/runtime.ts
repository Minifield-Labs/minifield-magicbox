import type { ExtractionContext, MagicBoxSpan } from "../src";
import type { SampleSchema } from "./fixtures";

let worker: Worker | undefined;
let requestId = 0;

export function extractWithRuntime(
  text: string,
  { signal, schema }: ExtractionContext<SampleSchema>,
): Promise<MagicBoxSpan[]> {
  signal.throwIfAborted();
  const current = (worker ??= new Worker(new URL("./runtime.worker.ts", import.meta.url), {
    type: "module",
  }));
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    function cleanup() {
      current.removeEventListener("message", message);
      current.removeEventListener("error", failed);
      signal.removeEventListener("abort", cancel);
    }
    function stop(error: unknown) {
      cleanup();
      current.terminate();
      if (worker === current) worker = undefined;
      reject(error);
    }
    function message(event: MessageEvent) {
      if (event.data.id !== id) return;
      if (event.data.error) stop(new Error(event.data.error));
      else {
        cleanup();
        resolve(event.data.spans);
      }
    }
    function failed(event: ErrorEvent) {
      stop(new Error(event.message || "Couldn't start extraction. Try again."));
    }
    function cancel() {
      stop(signal.reason);
    }
    current.addEventListener("message", message);
    current.addEventListener("error", failed);
    signal.addEventListener("abort", cancel, { once: true });
    current.postMessage({
      id,
      text,
      fields: schema?.fields ?? [],
      runtimeUrl: new URL(
        import.meta.env.VITE_MAGICBOX_RUNTIME_URL ?? "/runtime/minifield_web_demo.js",
        location.href,
      ).href,
      modelUrl: new URL(import.meta.env.VITE_MAGICBOX_MODEL_URL ?? "/model/", location.href).href,
    });
  });
}
