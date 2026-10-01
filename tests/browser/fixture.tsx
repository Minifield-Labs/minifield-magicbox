import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MagicBox, type ExtractionContext, type MagicBoxSpan, type OffsetUnit } from "../../src";
import "../../src/styles.css";
import { largeSource } from "./sources";

const query = new URLSearchParams(location.search);
const source = query.get("source") ?? "Alice Bob";
const width = query.get("width") ?? "100%";
const controlled = query.has("controlled");
const offsetUnit = (query.get("unit") ?? "utf16") as OffsetUnit;
const mode = query.get("mode") ?? "words";
const longLabel = "Classification".repeat(30);

interface SearchSchema {
  readonly word: string;
}

function annotations(text: string, schema?: SearchSchema): MagicBoxSpan[] {
  if (mode === "empty") return [];
  if (mode === "invalid") return [{ id: "bad", label: "Bad", start: 0, end: text.length + 1 }];
  if (mode === "overlap")
    return [
      { id: "__proto__", label: "Whole", start: 0, end: text.length, tone: "sky" },
      { id: "constructor", label: "Part", start: 0, end: Math.min(5, text.length) },
    ];
  const result: MagicBoxSpan[] = [];
  for (const match of text.matchAll(/\S+/gu)) {
    if (mode === "schema" && match[0] !== schema?.word) continue;
    const start =
      offsetUnit === "codepoint" ? Array.from(text.slice(0, match.index)).length : match.index;
    const size = offsetUnit === "codepoint" ? [...match[0]].length : match[0].length;
    result.push({
      id: String(result.length),
      label: query.get("label") ?? (query.has("long-label") ? longLabel : "Word"),
      start,
      end: start + size,
      tone: "sage",
      confidence: 0.99,
    });
  }
  return result;
}

interface Pending {
  text: string;
  schema: SearchSchema | undefined;
  signal: AbortSignal;
  resolve: (spans: readonly MagicBoxSpan[]) => void;
  reject: (error: Error) => void;
}

function Fixture() {
  const [text, setText] = useState(source);
  const [disabled, setDisabled] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [events, setEvents] = useState<string[]>([]);
  const [schema, setSchema] = useState<SearchSchema>({ word: "Alice" });
  const pending = useRef<Pending[]>([]);
  const append = (event: string) => setEvents((items) => [...items, event]);
  const onExtract = (text: string, { signal, schema }: ExtractionContext<SearchSchema>) => {
    append(`start:${text}`);
    signal.addEventListener("abort", () => append(`abort:${text}`), { once: true });
    if (mode === "error")
      return Promise.reject(new Error("Host rejected this document. ".repeat(200)));
    if (!query.has("pending")) return Promise.resolve(annotations(text, schema));
    return new Promise<readonly MagicBoxSpan[]>((resolve, reject) => {
      pending.current.push({ text, schema, signal, resolve, reject });
    });
  };
  const finish = (latest: boolean, reject = false) => {
    const request = latest ? pending.current.pop() : pending.current.shift();
    if (!request) return;
    if (reject) request.reject(new Error("Synthetic failure"));
    else request.resolve(annotations(request.text, request.schema));
  };
  return (
    <main>
      <div className="controls">
        <button onClick={() => finish(false)}>Resolve oldest</button>
        <button onClick={() => finish(true)}>Resolve newest</button>
        <button onClick={() => finish(false, true)}>Reject oldest</button>
        <button onClick={() => setDisabled((value) => !value)}>Toggle disabled</button>
        <button onClick={() => setMounted((value) => !value)}>Toggle mount</button>
        <button onClick={() => setText("Replacement")}>Replace source</button>
        <button onClick={() => setText(largeSource())}>Load large document</button>
        {mode === "schema" && (
          <button onClick={() => setSchema({ word: "Bob" })}>Search Bob</button>
        )}
        <input aria-label="Outside input" />
      </div>
      <form
        id="host-form"
        onReset={query.has("prevent-reset") ? (event) => event.preventDefault() : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          append(`submit:${new FormData(event.currentTarget).get("note")}`);
        }}
      >
        <div style={{ width, maxWidth: "100%", marginBlock: 16 }}>
          {mounted && (
            <MagicBox
              {...(controlled ? { value: text } : { defaultValue: source })}
              onValueChange={setText}
              onExtract={onExtract}
              {...(mode === "schema" ? { schema } : {})}
              onResult={(_spans, source) => append(`result:${source}`)}
              onError={(error) => append(`error:${error.message}`)}
              onSelectionChange={(span) => append(`select:${span.id}`)}
              name="note"
              rootProps={{ dir: query.has("rtl") ? "rtl" : "ltr" }}
              theme={query.has("auto") ? "auto" : "dark"}
              unstyled={query.has("unstyled")}
              disabled={disabled}
              offsetUnit={offsetUnit}
              {...(query.has("limit") ? { maxLength: 12 } : {})}
              sourceTitle={query.has("long-label") ? longLabel : ""}
              textareaProps={{
                readOnly: query.has("readonly"),
                required: query.has("required"),
                ...(query.has("external-form") ? { form: "external-form" } : {}),
              }}
            />
          )}
        </div>
        <button type="reset">Reset form</button>
        <button type="submit">Submit form</button>
      </form>
      <form id="external-form">
        <button type="reset">Reset external form</button>
      </form>
      <output role="log" aria-label="Host events">
        {events.join("\n")}
      </output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {query.has("native") ? (
      <textarea aria-label="Native control" defaultValue={source} />
    ) : (
      <Fixture />
    )}
  </StrictMode>,
);
