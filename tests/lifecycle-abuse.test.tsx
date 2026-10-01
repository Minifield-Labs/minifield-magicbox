import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode, Suspense, startTransition, useState } from "react";
import { useMagicBox, type MagicBoxSpan } from "../src";

afterEach(cleanup);

const spans: MagicBoxSpan[] = [{ id: "alice", label: "Person", start: 0, end: 5 }];

it("ignores retained controller actions after the host has unmounted", async () => {
  const onExtract = vi.fn(async () => spans);
  const onResult = vi.fn();
  const onValueChange = vi.fn();
  const { result, unmount } = renderHook(() =>
    useMagicBox({ defaultValue: "Alice", onExtract, onResult, onValueChange }),
  );
  const box = result.current;
  unmount();
  await act(async () => {
    box.setValue("Alice again");
    box.clear();
    box.select("alice");
    await box.extract();
  });
  expect(onExtract).not.toHaveBeenCalled();
  expect(onResult).not.toHaveBeenCalled();
  expect(onValueChange).not.toHaveBeenCalled();
});

it("detaches a cancelled request before a synchronous abort listener starts a replacement", async () => {
  const requests: Array<{ resolve: (spans: MagicBoxSpan[]) => void; signal: AbortSignal }> = [];
  const onExtract = vi.fn(
    (_text: string, { signal }: { signal: AbortSignal }) =>
      new Promise<MagicBoxSpan[]>((resolve) => requests.push({ resolve, signal })),
  );
  const onResult = vi.fn();
  const { result } = renderHook(() => useMagicBox({ defaultValue: "Alice", onExtract, onResult }));
  act(() => void result.current.extract());
  requests[0]!.signal.addEventListener("abort", () => void result.current.extract(), {
    once: true,
  });
  act(() => result.current.cancel());
  expect(onExtract).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe("extracting");
  await act(async () => requests[0]!.resolve(spans));
  expect(onResult).not.toHaveBeenCalled();
  await act(async () => requests[1]!.resolve(spans));
  expect(onResult).toHaveBeenCalledOnce();
  expect(result.current.status).toBe("success");
});

it("an abandoned suspended source change leaves the committed request usable", async () => {
  let resolve!: (value: MagicBoxSpan[]) => void;
  let signal!: AbortSignal;
  const onResult = vi.fn();
  const suspended = new Promise<void>(() => {});
  function Source({ value }: { value: string }) {
    const box = useMagicBox({
      value,
      onExtract: (_text, context) => {
        signal = context.signal;
        return new Promise<MagicBoxSpan[]>((complete) => {
          resolve = complete;
        });
      },
      onResult,
    });
    if (value === "Suspended") throw suspended;
    return (
      <>
        <button onClick={() => void box.extract()}>Extract</button>
        <span role="status">{box.status}</span>
      </>
    );
  }
  function Host() {
    const [value, setValue] = useState("Alice");
    return (
      <>
        <button onClick={() => startTransition(() => setValue("Suspended"))}>Suspend</button>
        <button onClick={() => setValue("Alice")}>Restore</button>
        <Suspense fallback="Waiting">
          <Source value={value} />
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
  await act(async () => resolve(spans));
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  expect(onResult).toHaveBeenCalledExactlyOnceWith(expect.any(Array), "Alice");
  expect(screen.getByRole("status").textContent).toBe("success");
});

it.each([7, 43, 119, 307, 991, 2026])(
  "survives 300 seeded lifecycle attacks (seed %i)",
  async (seed) => {
    let random = seed;
    const next = (limit: number) => {
      random = (Math.imul(random, 1664525) + 1013904223) | 0;
      return (random >>> 0) % limit;
    };
    interface Request {
      source: string;
      signal: AbortSignal;
      resolve: (value: readonly MagicBoxSpan[]) => void;
      reject: (error: Error) => void;
    }
    const requests: Request[] = [];
    const onResult = vi.fn();
    const onError = vi.fn();
    const onExtract = (source: string, { signal }: { signal: AbortSignal }) =>
      new Promise<readonly MagicBoxSpan[]>((resolve, reject) => {
        requests.push({ source, signal, resolve, reject });
      });
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useMagicBox({ value, onExtract, onResult, onError }),
      { initialProps: { value: "Alice" } },
    );
    let value = "Alice";
    let current: Request | null = null;
    let status = "idle";
    let successes = 0;
    let failures = 0;
    for (let step = 0; step < 300; step++) {
      switch (next(7)) {
        case 0: {
          const before = requests.length;
          act(() => void result.current.extract());
          if (value.trim() && !current) {
            expect(requests.length).toBe(before + 1);
            current = requests.at(-1)!;
            status = "extracting";
          } else expect(requests.length).toBe(before);
          break;
        }
        case 1:
          act(() => result.current.cancel());
          expect(current?.signal.aborted ?? true).toBe(true);
          current = null;
          status = "idle";
          break;
        case 2: {
          const replacement = ["Alice", "🙂Zoë", "中文", "", " \n\t"][next(5)]!;
          rerender({ value: replacement });
          if (replacement !== value) {
            expect(current?.signal.aborted ?? true).toBe(true);
            current = null;
            status = "idle";
          }
          value = replacement;
          break;
        }
        case 3:
        case 4: {
          if (!requests.length) break;
          const index = next(requests.length);
          const request = requests.splice(index, 1)[0]!;
          const rejecting = next(2) === 0;
          await act(async () => {
            if (rejecting) request.reject(new Error("Delayed host error"));
            else
              request.resolve([
                { id: "one", label: "Character", start: 0, end: [...request.source][0]!.length },
              ]);
          });
          if (request === current) {
            current = null;
            status = rejecting ? "error" : "success";
            if (rejecting) failures++;
            else successes++;
          }
          break;
        }
        case 5:
          act(() => result.current.select("missing"));
          break;
        case 6:
          act(() => result.current.select("one"));
          break;
      }
      expect(result.current.value).toBe(value);
      expect(result.current.status).toBe(status);
      expect(result.current.spans.length).toBe(status === "success" ? 1 : 0);
      expect(result.current.canExtract).toBe(Boolean(value.trim()) && status !== "extracting");
      expect(onResult).toHaveBeenCalledTimes(successes);
      expect(onError).toHaveBeenCalledTimes(failures);
    }
    unmount();
    expect(current?.signal.aborted ?? true).toBe(true);
    await act(async () => {
      for (const request of requests) request.reject(new Error("Host finished after unmount"));
    });
    expect(onResult).toHaveBeenCalledTimes(successes);
    expect(onError).toHaveBeenCalledTimes(failures);
  },
);
