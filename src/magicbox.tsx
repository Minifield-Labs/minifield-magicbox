"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type Ref,
  type RefAttributes,
} from "react";
import { segmentSource } from "./spans.js";
import { useMagicBox } from "./use-magicbox.js";
import type { MagicBoxLabels, MagicBoxProps, MagicBoxSpan } from "./types.js";

const defaults: MagicBoxLabels = {
  source: "Source text",
  placeholder: "Write or paste something here…",
  extract: "Extract",
  extracting: "Extracting…",
  cancel: "Cancel",
  edit: "Edit text",
  clear: "Clear",
  ready: "Ready",
  empty: "No fields found",
  fields: "Extracted spans",
  selected: "Selected span",
  results: (count) => `${count} ${count === 1 ? "field" : "fields"}`,
  confidence: (value) => `${Math.round(value * 100)}% confidence`,
  sourceRange: (start, end) => `Characters ${start}–${end}`,
  previous: "Previous field",
  next: "Next field",
  navigation: "Field navigation",
  position: (index, count) => `${index + 1} of ${count}`,
  field: (label, text, index) => `${index + 1}. ${label}: ${text}`,
  highlight: (label, text) => `${label}: ${text}`,
};

/** Reveal a child inside its own scroll pane, preserving the host page's position. */
function reveal(pane: HTMLElement, element: HTMLElement, padding = 0) {
  const child = element.getBoundingClientRect();
  const parent = pane.getBoundingClientRect();
  if (child.top < parent.top + padding || child.bottom > parent.bottom - padding)
    pane.scrollTo({ top: pane.scrollTop + child.top - parent.top - padding, behavior: "instant" });
}

function MagicBoxImpl<T, TSchema>(props: MagicBoxProps<T, TSchema>, ref: Ref<HTMLTextAreaElement>) {
  const box = useMagicBox(props);
  const labels = { ...defaults, ...props.labels };
  const uid = useId();
  const id = props.id ?? `magicbox-${uid}`;
  const input = useRef<HTMLTextAreaElement | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const fields = useRef<HTMLDivElement | null>(null);
  const initialSource = useRef(box.value);
  const keyboardFocus = useRef(false);
  const marks = useRef(new Map<number, HTMLButtonElement>());
  const inputRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      input.current = element;
      if (typeof ref === "function") {
        const cleanup = ref(element);
        if (typeof cleanup === "function")
          return () => {
            input.current = null;
            cleanup();
          };
      } else if (ref) ref.current = element;
    },
    [ref],
  );
  const disabled = props.disabled ?? false;
  const complete = box.status === "success";
  const busy = box.status === "extracting";
  useEffect(() => {
    const element = input.current;
    const form = element?.form;
    if (!form) return;
    let disposed = false;
    const reset = (event: Event) => {
      // A task lets every native/React reset handler run before checking prevention.
      setTimeout(() => {
        if (
          !disposed &&
          !event.defaultPrevented &&
          input.current === element &&
          element.form === form
        )
          box.setValue(initialSource.current);
      }, 0);
    };
    form.addEventListener("reset", reset);
    return () => {
      disposed = true;
      form.removeEventListener("reset", reset);
    };
  }, [box.setValue, props.textareaProps?.form]);
  useEffect(() => {
    if (busy) return;
    if (
      complete &&
      keyboardFocus.current &&
      (document.activeElement === input.current || document.activeElement === document.body)
    )
      viewport.current?.focus({ preventScroll: true });
    keyboardFocus.current = false;
  }, [busy, complete]);
  const segments = useMemo(() => segmentSource(box.value, box.spans), [box.value, box.spans]);
  const spansById = useMemo(() => new Map(box.spans.map((span) => [span.id, span])), [box.spans]);
  const index = box.spans.findIndex((span) => span.id === box.selectedSpan?.id);
  const selected = box.selectedSpan;
  const selectedText = selected ? box.value.slice(selected.start, selected.end) : "";
  const tone = (span: MagicBoxSpan<T>) => span.tone ?? "ember";
  const number = (value: number) => String(value).padStart(2, "0");
  useEffect(() => {
    const pane = fields.current;
    const field = pane?.children[index] as HTMLElement | undefined;
    if (pane && field) reveal(pane, field);
  }, [index]);

  function focusEditor() {
    queueMicrotask(() => input.current?.focus());
  }

  function select(span: MagicBoxSpan<T>, scroll = false) {
    box.select(span.id);
    props.onSelectionChange?.(span);
    if (!scroll) return;
    const segment = segments.find((part) => part.ids.includes(span.id));
    const mark = segment ? marks.current.get(segment.start) : undefined;
    const pane = viewport.current;
    if (pane && mark) reveal(pane, mark, 24);
  }

  function step(direction: -1 | 1) {
    const span = box.spans[index + direction];
    if (span) select(span, true);
  }

  const status = busy
    ? labels.extracting
    : complete
      ? box.spans.length
        ? labels.results(box.spans.length)
        : labels.empty
      : labels.ready;

  return (
    <div
      {...props.rootProps}
      data-magicbox=""
      data-styled={props.unstyled ? undefined : ""}
      data-theme={props.theme ?? "dark"}
      data-state={box.status}
      data-disabled={disabled ? "" : undefined}
      className={
        [props.rootProps?.className, props.className].filter(Boolean).join(" ") || undefined
      }
      style={{ ...props.rootProps?.style, ...props.style }}
      onKeyDown={(event) => {
        props.rootProps?.onKeyDown?.(event);
        if (
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.nativeEvent.keyCode !== 229 &&
          event.key === "Escape" &&
          busy
        ) {
          event.preventDefault();
          box.cancel();
        }
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229 ||
          !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
          !(event.target instanceof HTMLElement)
        )
          return;
        const field = event.target.closest<HTMLButtonElement>('[data-part="field"]');
        const buttons = [
          ...(fields.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
        ];
        const current = field ? buttons.indexOf(field) : -1;
        if (current < 0) return;
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : Math.max(
                  0,
                  Math.min(buttons.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)),
                );
        event.preventDefault();
        buttons[next]!.focus();
        buttons[next]!.click();
      }}
    >
      <div data-part="workspace">
        <div data-part="document">
          <div data-part="header">
            {complete ? (
              <span data-part="label">{labels.source}</span>
            ) : (
              <label data-part="label" htmlFor={id}>
                {labels.source}
              </label>
            )}
            {props.sourceTitle && <span data-part="source-title">{props.sourceTitle}</span>}
          </div>
          <div data-part="editor" aria-busy={busy}>
            <textarea
              {...props.textareaProps}
              ref={inputRef}
              id={id}
              name={props.name}
              data-part="textarea"
              hidden={complete}
              value={box.value}
              rows={props.rows ?? 5}
              maxLength={props.maxLength}
              disabled={disabled}
              readOnly={busy || props.textareaProps?.readOnly}
              placeholder={props.textareaProps?.placeholder ?? labels.placeholder}
              aria-label={props.textareaProps?.["aria-label"] ?? labels.source}
              aria-invalid={box.status === "error" || props.textareaProps?.["aria-invalid"]}
              aria-describedby={
                [props.textareaProps?.["aria-describedby"], box.error ? `${id}-error` : undefined]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(event) => box.setValue(event.target.value)}
              onKeyDown={(event) => {
                props.textareaProps?.onKeyDown?.(event);
                if (
                  event.defaultPrevented ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229 ||
                  disabled
                )
                  return;
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  keyboardFocus.current = box.canExtract;
                  void box.extract();
                }
              }}
            />
            {complete && (
              <div
                data-part="source"
                id={`${id}-source`}
                ref={viewport}
                tabIndex={0}
                role="region"
                aria-label={labels.source}
              >
                {segments.map((segment) => {
                  const spanId = segment.ids.includes(selected?.id ?? "")
                    ? selected?.id
                    : segment.ids[0];
                  const span = spanId === undefined ? undefined : spansById.get(spanId);
                  return span ? (
                    <button
                      key={segment.start}
                      ref={(element) => {
                        if (element) marks.current.set(segment.start, element);
                        else marks.current.delete(segment.start);
                      }}
                      type="button"
                      data-part="highlight"
                      data-tone={tone(span)}
                      data-overlap={segment.ids.length > 1 ? "" : undefined}
                      aria-pressed={segment.ids.includes(selected?.id ?? "")}
                      aria-label={labels.highlight(span.label, segment.text)}
                      disabled={disabled}
                      onClick={() => select(span)}
                    >
                      {segment.text}
                    </button>
                  ) : (
                    <span key={segment.start}>{segment.text}</span>
                  );
                })}
              </div>
            )}
          </div>
          {!!box.error && (
            <p data-part="error" id={`${id}-error`} role="alert">
              {box.error.message}
            </p>
          )}
        </div>

        <aside data-part="results" aria-label={labels.fields}>
          <div data-part="rail-heading">
            <span>{labels.fields}</span>
            <span>{number(box.spans.length)}</span>
          </div>
          <div data-part="fields" ref={fields} role="group" aria-label={labels.fields}>
            {box.spans.map((span, spanIndex) => (
              <button
                key={span.id}
                data-part="field"
                data-tone={tone(span)}
                type="button"
                aria-label={labels.field(
                  span.label,
                  box.value.slice(span.start, span.end),
                  spanIndex,
                )}
                aria-pressed={span.id === selected?.id}
                disabled={disabled}
                onClick={() => select(span, true)}
              >
                <span data-part="field-number">{number(spanIndex + 1)}</span>
                <span data-part="field-text">{box.value.slice(span.start, span.end)}</span>
                <span data-part="field-kind">{span.label}</span>
              </button>
            ))}
          </div>
          {selected && (
            <section data-part="detail" data-tone={tone(selected)} aria-label={labels.selected}>
              <div data-part="detail-title">
                <span>{labels.selected}</span>
                <span>
                  {number(index + 1)} / {number(box.spans.length)}
                </span>
              </div>
              <div data-part="detail-body">
                <div data-part="detail-heading">
                  <strong data-part="detail-label">{selected.label}</strong>
                  {selected.confidence != null && (
                    <span data-part="confidence">{labels.confidence(selected.confidence)}</span>
                  )}
                </div>
                <div data-part="detail-value">
                  {props.renderValue ? props.renderValue(selected, selectedText) : selectedText}
                </div>
                <div data-part="source-range">
                  <span data-part="source-badge">TXT</span>
                  {labels.sourceRange(selected.start, selected.end)}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>

      <div data-part="toolbar">
        <div data-part="toolbar-actions">
          <span data-part="status" role="status" aria-live="polite" aria-atomic="true">
            {status}
          </span>
          <div data-part="header-actions">
            {complete && (
              <button
                data-part="text-button"
                type="button"
                disabled={disabled}
                onClick={() => {
                  box.edit();
                  focusEditor();
                }}
              >
                {labels.edit}
              </button>
            )}
            {!!box.value && (
              <button
                data-part="text-button"
                type="button"
                disabled={disabled || props.textareaProps?.readOnly}
                onClick={() => {
                  box.clear();
                  focusEditor();
                }}
              >
                {labels.clear}
              </button>
            )}
            {busy ? (
              <button data-part="button" type="button" onClick={box.cancel}>
                {labels.cancel}
              </button>
            ) : (
              <button
                data-part="button"
                type="button"
                disabled={disabled || !box.canExtract}
                onClick={() => {
                  void box.extract();
                }}
              >
                {labels.extract}
              </button>
            )}
          </div>
        </div>
        <div data-part="navigation" role="group" aria-label={labels.navigation}>
          <button
            data-part="icon-button"
            type="button"
            aria-label={labels.previous}
            disabled={disabled || index <= 0}
            onClick={() => step(-1)}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <span data-part="position">{labels.position(index, box.spans.length)}</span>
          <button
            data-part="icon-button"
            type="button"
            aria-label={labels.next}
            disabled={disabled || index < 0 || index >= box.spans.length - 1}
            onClick={() => step(1)}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** A source document and synchronized extraction rail, with a native editable input. */
export const MagicBox = /* @__PURE__ */ forwardRef(MagicBoxImpl) as <
  T = unknown,
  TSchema = unknown,
>(
  props: MagicBoxProps<T, TSchema> & RefAttributes<HTMLTextAreaElement>,
) => ReturnType<typeof MagicBoxImpl>;
