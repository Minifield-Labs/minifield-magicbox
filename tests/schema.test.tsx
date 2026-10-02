import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, Suspense, startTransition, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MagicBox, useMagicBox, type ExtractionContext, type MagicBoxSpan } from "../src";
import { sampleSpans } from "../demo/fixtures";

afterEach(cleanup);

const person: MagicBoxSpan = { id: "person", label: "Person", start: 0, end: 5 };
const people = { fields: ["Person"] };
const addresses = { fields: ["Address"] };
type Schema = typeof people;

function deferred() {
  let resolve!: (spans: readonly MagicBoxSpan[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<readonly MagicBoxSpan[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it("passes the exact typed schema from the component to its extractor", async () => {
  const schema = { type: "object", properties: { person: { type: "string" } } } as const;
  const onExtract = vi.fn(async (_text: string, context: ExtractionContext<typeof schema>) => {
    expect(context.schema).toBe(schema);
    expect(context.schema?.properties.person.type).toBe("string");
    expect(context.signal.aborted).toBe(false);
    return [person];
  });
  render(<MagicBox defaultValue="Alice" schema={schema} onExtract={onExtract} />);
  fireEvent.click(screen.getByRole("button", { name: "Extract" }));
  expect(await screen.findByRole("button", { name: "1. Person: Alice" })).toBeTruthy();
  expect(onExtract).toHaveBeenCalledOnce();
});

it("keeps existing extractors usable without a schema", async () => {
  const onExtract = vi.fn(async (_text: string, context: ExtractionContext) => {
    expect(context.schema).toBeUndefined();
    return [person];
  });
  const { result } = renderHook(() => useMagicBox({ defaultValue: "Alice", onExtract }));
  await act(() => result.current.extract());
  expect(result.current.status).toBe("success");
});

it("preserves initial results for the same schema and clears them when the schema is replaced or removed", async () => {
  const { result, rerender } = renderHook(
    ({ schema }: { schema?: Schema }) =>
      useMagicBox({
        defaultValue: "Alice",
        defaultSpans: [person],
        ...(schema === undefined ? {} : { schema }),
        onExtract: async () => [person],
      }),
    { initialProps: { schema: people } as { schema?: Schema } },
  );
  rerender({ schema: people });
  expect(result.current.spans).toHaveLength(1);
  rerender({ schema: addresses });
  expect(result.current.status).toBe("idle");
  expect(result.current.spans).toHaveLength(0);
  await act(() => result.current.extract());
  expect(result.current.status).toBe("success");
  rerender({});
  expect(result.current.status).toBe("idle");
  expect(result.current.spans).toHaveLength(0);
});

it.each(["resolve", "reject"] as const)(
  "cancels a replaced schema and ignores its late %s even after restoring it",
  async (settle) => {
    const old = deferred();
    const onResult = vi.fn();
    const onError = vi.fn();
    const onExtract = vi.fn((_text: string, _context: ExtractionContext<Schema>) =>
      onExtract.mock.calls.length === 1 ? old.promise : Promise.resolve([]),
    );
    const { result, rerender } = renderHook(
      ({ schema }) => useMagicBox({ defaultValue: "Alice", schema, onExtract, onResult, onError }),
      { initialProps: { schema: people } },
    );
    const extract = result.current.extract;
    act(() => void extract());
    const signal = onExtract.mock.calls[0]![1].signal;
    rerender({ schema: addresses });
    expect(signal.aborted).toBe(true);
    expect(result.current.status).toBe("idle");
    rerender({ schema: people });
    await act(async () => {
      if (settle === "resolve") old.resolve([person]);
      else old.reject(new Error("Obsolete schema"));
    });
    expect(result.current.spans).toHaveLength(0);
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.extract).toBe(extract);
    await act(() => extract());
    expect(onExtract.mock.calls[1]![1].schema).toBe(people);
    expect(onResult).toHaveBeenCalledOnce();
  },
);

it("lets an abort listener start extraction with the newly committed schema", async () => {
  const first = deferred();
  const second = deferred();
  const onExtract = vi.fn((_text: string, _context: ExtractionContext<Schema>) =>
    onExtract.mock.calls.length === 1 ? first.promise : second.promise,
  );
  const { result, rerender } = renderHook(
    ({ schema }) => useMagicBox({ defaultValue: "Alice", schema, onExtract }),
    { initialProps: { schema: people } },
  );
  act(() => void result.current.extract());
  onExtract.mock.calls[0]![1].signal.addEventListener("abort", () => void result.current.extract());
  rerender({ schema: addresses });
  expect(onExtract.mock.calls[1]![1].schema).toBe(addresses);
  expect(result.current.status).toBe("extracting");
  await act(async () => first.resolve([person]));
  expect(result.current.status).toBe("extracting");
  await act(async () => second.resolve([]));
  expect(result.current.status).toBe("success");
});

it("keeps the committed schema request valid through an abandoned concurrent schema change", async () => {
  const pending = deferred();
  const suspended = new Promise<void>(() => {});
  const onResult = vi.fn();
  let signal!: AbortSignal;
  function Source({ schema }: { schema: Schema }) {
    const box = useMagicBox({
      defaultValue: "Alice",
      schema,
      onExtract: (_text, context) => {
        signal = context.signal;
        return pending.promise;
      },
      onResult,
    });
    if (schema === addresses) throw suspended;
    return <button onClick={() => void box.extract()}>Extract</button>;
  }
  function Host() {
    const [schema, setSchema] = useState(people);
    return (
      <>
        <button onClick={() => startTransition(() => setSchema(addresses))}>Suspend</button>
        <Suspense fallback="Waiting">
          <Source schema={schema} />
        </Suspense>
      </>
    );
  }
  render(
    <StrictMode>
      <Host />
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Extract" }));
  fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
  expect(signal.aborted).toBe(false);
  await act(async () => pending.resolve([person]));
  expect(onResult).toHaveBeenCalledExactlyOnceWith(expect.any(Array), "Alice");
});

it("uses the demo schema to select which fields are extracted", () => {
  const source = "Annette Kowalski uses annette@example.org and Visa ending 7301.";
  const results = sampleSpans(source, {
    fields: [{ name: "Email", question: "What is the email?" }],
  });
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ label: "Email", value: "annette@example.org" });
});
