"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizeSpans } from "./spans.js";
import type {
  MagicBoxController,
  MagicBoxSpan,
  MagicBoxStatus,
  UseMagicBoxOptions,
} from "./types.js";

// Browser commits must invalidate work before promise continuations or host cleanup run.
const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Result<T> {
  text: string;
  schema: unknown;
  status: MagicBoxStatus;
  spans: readonly MagicBoxSpan<T>[];
  selectedId: string | null;
  error: Error | null;
}

function initial<T>(text: string, schema: unknown): Result<T> {
  return { text, schema, status: "idle", spans: [], selectedId: null, error: null };
}

/** Local interaction state. No inference, downloads, storage, or global singleton. */
export function useMagicBox<T = unknown, TSchema = unknown>(
  options: UseMagicBoxOptions<T, TSchema>,
): MagicBoxController<T> {
  const [internalValue, setInternalValue] = useState(options.defaultValue ?? "");
  const value = options.value ?? internalValue;
  const [result, setResult] = useState<Result<T>>(() => {
    if (options.defaultSpans === undefined) return initial(value, options.schema);
    try {
      const spans = normalizeSpans(value, options.defaultSpans, options.offsetUnit);
      return {
        text: value,
        schema: options.schema,
        status: "success",
        spans,
        selectedId: spans[0]?.id ?? null,
        error: null,
      };
    } catch (cause) {
      return {
        ...initial<T>(value, options.schema),
        status: "error",
        error: cause instanceof Error ? cause : new Error(String(cause)),
      };
    }
  });
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ options, value });
  // Update only after commit so an abandoned concurrent render can't invalidate a request.
  useCommitEffect(() => {
    latest.current = { options, value };
  });
  useCommitEffect(() => {
    if (result.text !== value || !Object.is(result.schema, options.schema)) {
      const request = active.current;
      active.current = null;
      setResult(initial(value, options.schema));
      request?.abort();
    }
  }, [value, options.schema, result.text, result.schema]);
  useCommitEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const request = active.current;
      active.current = null;
      request?.abort();
    };
  }, []);

  const visible =
    result.text === value && Object.is(result.schema, options.schema)
      ? result
      : initial<T>(value, options.schema);

  const cancel = useCallback(() => {
    if (!mounted.current) return;
    const request = active.current;
    active.current = null;
    setResult(initial(latest.current.value, latest.current.options.schema));
    request?.abort();
  }, []);

  const setValue = useCallback(
    (next: string) => {
      if (!mounted.current) return;
      cancel();
      const { options } = latest.current;
      if (options.value === undefined) setInternalValue(next);
      options.onValueChange?.(next);
    },
    [cancel],
  );

  const extract = useCallback(async () => {
    const { options, value } = latest.current;
    if (!mounted.current || !value.trim() || active.current) return;
    const controller = new AbortController();
    const source = value;
    active.current = controller;
    setResult({ ...initial<T>(source, options.schema), status: "extracting" });
    const current = () =>
      active.current === controller &&
      !controller.signal.aborted &&
      latest.current.value === source &&
      Object.is(latest.current.options.schema, options.schema);
    let spans: readonly MagicBoxSpan<T>[];
    try {
      const raw = await options.onExtract(source, {
        signal: controller.signal,
        schema: options.schema,
      });
      if (!current()) return;
      spans = normalizeSpans(source, raw, options.offsetUnit);
    } catch (cause) {
      if (!current()) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      active.current = null;
      setResult({ ...initial<T>(source, options.schema), status: "error", error });
      latest.current.options.onError?.(error);
      return;
    }
    if (!current()) return;
    active.current = null;
    setResult({
      text: source,
      schema: options.schema,
      status: "success",
      spans,
      selectedId: spans[0]?.id ?? null,
      error: null,
    });
    latest.current.options.onResult?.(spans, source);
  }, []);

  const clear = useCallback(() => setValue(""), [setValue]);
  const select = useCallback((id: string) => {
    if (!mounted.current) return;
    setResult((state) =>
      state.text === latest.current.value &&
      Object.is(state.schema, latest.current.options.schema) &&
      state.selectedId !== id &&
      state.spans.some((span) => span.id === id)
        ? { ...state, selectedId: id }
        : state,
    );
  }, []);

  return {
    value,
    status: visible.status,
    spans: visible.spans,
    selectedSpan: visible.spans.find((span) => span.id === visible.selectedId) ?? null,
    error: visible.error,
    canExtract: !!value.trim() && visible.status !== "extracting",
    setValue,
    extract,
    cancel,
    edit: cancel,
    clear,
    select,
  };
}
