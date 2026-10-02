import { extractPointers, type PointerEncoder } from "./pointer";
import type { SampleSchema } from "./fixtures";

// The runtime polls WebGPU completion through this host macrotask hook.
const channel = new MessageChannel();
const waiting: (() => void)[] = [];
channel.port1.onmessage = () => waiting.shift()?.();
Object.assign(globalThis, {
  __minifieldYield: () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
      channel.port2.postMessage(0);
    }),
});

interface RuntimeModule {
  default(options: { module_or_path: Uint8Array }): Promise<unknown>;
  configure_telemetry(options: { enabled: boolean }): void;
  load_pointer_encoder(
    config: Uint8Array,
    weights: Uint8Array,
    tokenizer: Uint8Array,
  ): Promise<PointerEncoder>;
}

async function bytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Couldn't load ${new URL(url).pathname} (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

let encoder: Promise<PointerEncoder> | undefined;
async function load(runtimeUrl: string, modelUrl: string): Promise<PointerEncoder> {
  const [javascript, wasm] = await Promise.all([
    bytes(runtimeUrl),
    bytes(runtimeUrl.replace(/\.js$/, "_bg.wasm")),
  ]);
  const blobUrl = URL.createObjectURL(
    new Blob([javascript.slice().buffer], { type: "text/javascript" }),
  );
  let runtime: RuntimeModule;
  try {
    runtime = await import(/* @vite-ignore */ blobUrl);
    await runtime.default({ module_or_path: wasm });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  runtime.configure_telemetry({ enabled: false });
  if (!runtime.load_pointer_encoder)
    throw new Error("This runtime release needs the pointer encoder binding.");
  const base = modelUrl.replace(/\/?$/, "/");
  const [config, weights, tokenizer] = await Promise.all([
    bytes(`${base}config.json`),
    bytes(`${base}model.safetensors`),
    bytes(`${base}tokenizer/tokenizer.json`),
  ]);
  return runtime.load_pointer_encoder(config, weights, tokenizer);
}

self.onmessage = async (
  event: MessageEvent<{
    id: number;
    text: string;
    fields: SampleSchema["fields"];
    runtimeUrl: string;
    modelUrl: string;
  }>,
) => {
  const { id, text, fields, runtimeUrl, modelUrl } = event.data;
  try {
    encoder ??= load(runtimeUrl, modelUrl);
    self.postMessage({ id, spans: await extractPointers(await encoder, text, fields) });
  } catch (error) {
    console.error("MagicBox extraction failed", error);
    self.postMessage({
      id,
      error:
        error instanceof Error && error.message === "Shorten the text and try again."
          ? error.message
          : "Couldn't extract this text. Try again.",
    });
  }
};
