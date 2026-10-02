import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, StrictMode, useLayoutEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MagicBox, useMagicBox, type MagicBoxSpan } from "../src";

afterEach(cleanup);

HTMLElement.prototype.scrollTo = vi.fn();

const person: MagicBoxSpan = { id: "person", label: "Person", start: 0, end: 5, tone: "sage" };
const extract = vi.fn(async () => [person]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MagicBox", () => {
  it("navigates fields with arrows, Home and End without taking over text input or host keys", async () => {
    const user = userEvent.setup();
    const spans = [person, { ...person, id: "second", start: 6, end: 11 }];
    const { rerender } = render(
      <MagicBox defaultValue="Alice Alice" defaultSpans={spans} onExtract={extract} />,
    );
    const first = screen.getByRole("button", { name: "1. Person: Alice" });
    const second = screen.getByRole("button", { name: "2. Person: Alice" });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("aria-pressed")).toBe("true");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(second);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(first);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "ArrowUp", isComposing: true });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "ArrowUp", ctrlKey: true });
    expect(document.activeElement).toBe(second);
    rerender(
      <MagicBox
        defaultValue="Alice Alice"
        defaultSpans={spans}
        onExtract={extract}
        rootProps={{ onKeyDown: (event) => event.preventDefault() }}
      />,
    );
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(document.activeElement).toBe(second);
    rerender(<MagicBox defaultValue="Alice Alice" defaultSpans={spans} onExtract={extract} />);
    await user.click(screen.getByRole("button", { name: "Edit text" }));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(document.activeElement).toBe(input);
  });

  it("keeps controller actions stable while calling the latest committed host callbacks", async () => {
    const first = vi.fn(async () => [person]);
    const second = vi.fn(async () => [{ ...person, label: "Updated" }]);
    const onValueChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ onExtract }) => useMagicBox({ defaultValue: "Alice", onExtract, onValueChange }),
      { initialProps: { onExtract: first } },
    );
    const actions = {
      extract: result.current.extract,
      cancel: result.current.cancel,
      setValue: result.current.setValue,
      select: result.current.select,
      clear: result.current.clear,
    };
    await act(() => actions.extract());
    rerender({ onExtract: second });
    await act(() => actions.extract());
    expect(second).toHaveBeenCalledOnce();
    expect(result.current.selectedSpan?.label).toBe("Updated");
    for (const key of Object.keys(actions) as Array<keyof typeof actions>)
      expect(result.current[key]).toBe(actions[key]);
    act(() => actions.setValue("Bob"));
    expect(onValueChange).toHaveBeenLastCalledWith("Bob");
    expect(result.current.value).toBe("Bob");
  });

  it("forwards native wrapper props and preserves textarea attributes and events", () => {
    const onClick = vi.fn();
    const onBlur = vi.fn();
    render(
      <MagicBox
        onExtract={extract}
        id="source-input"
        className="host-box"
        style={{ opacity: 0.9 }}
        rootProps={{
          id: "host-wrapper",
          title: "Order note",
          dir: "rtl",
          "aria-label": "Order input",
          "data-testid": "box",
          className: "host-layout",
          style: { opacity: 0.4, padding: 7 },
          onClick,
        }}
        textareaProps={{ autoComplete: "off", required: true, onBlur }}
      />,
    );
    const root = screen.getByTestId("box");
    expect(root.id).toBe("host-wrapper");
    expect(root.getAttribute("aria-label")).toBe("Order input");
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.className).toBe("host-layout host-box");
    expect(root.style.opacity).toBe("0.9");
    expect(root.style.padding).toBe("7px");
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.id).toBe("source-input");
    expect(input.autocomplete).toBe("off");
    expect(input.required).toBe(true);
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledOnce();
    fireEvent.click(root);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("distinguishes repeated fields and localizes navigation and accessible labels", () => {
    const spans = [person, { ...person, id: "second", start: 6, end: 11 }];
    const { rerender } = render(
      <MagicBox defaultValue="Alice Alice" defaultSpans={spans} onExtract={extract} />,
    );
    expect(screen.getByRole("button", { name: "1. Person: Alice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2. Person: Alice" })).toBeTruthy();
    rerender(
      <MagicBox
        defaultValue="Alice Alice"
        defaultSpans={spans}
        onExtract={extract}
        labels={{
          navigation: "Navigation",
          position: (index, count) => `${index + 1} sur ${count}`,
          field: (label, text, index) => `Champ ${index + 1}: ${label}, ${text}`,
          highlight: (label, text) => `${text} (${label})`,
        }}
      />,
    );
    expect(screen.getByRole("group", { name: "Navigation" }).textContent).toContain("1 sur 2");
    fireEvent.click(screen.getByRole("button", { name: "Champ 2: Person, Alice" }));
    expect(screen.getByRole("group", { name: "Navigation" }).textContent).toContain("2 sur 2");
    expect(
      screen.getAllByRole("button", { name: "Alice (Person)" })[1]!.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("cleans the previous ref when its identity changes and attaches the replacement", () => {
    const cleanupRef = vi.fn();
    const ref = vi.fn(() => cleanupRef);
    const replacement = createRef<HTMLTextAreaElement>();
    const { rerender, unmount } = render(<MagicBox ref={ref} onExtract={extract} />);
    const input = screen.getByRole("textbox");
    rerender(<MagicBox ref={replacement} onExtract={extract} />);
    expect(cleanupRef).toHaveBeenCalledOnce();
    expect(replacement.current).toBe(input);
    unmount();
    expect(replacement.current).toBeNull();
  });

  it("keeps callback refs attached across rerenders and honors React 19 cleanup", () => {
    const cleanupRef = vi.fn();
    const ref = vi.fn(() => cleanupRef);
    const { rerender, unmount } = render(<MagicBox ref={ref} onExtract={extract} />);
    const input = screen.getByRole("textbox");
    rerender(<MagicBox ref={ref} theme="light" onExtract={extract} />);
    expect(ref).toHaveBeenCalledExactlyOnceWith(input);
    expect(cleanupRef).not.toHaveBeenCalled();
    unmount();
    expect(cleanupRef).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenCalledTimes(1);
  });

  it("aborts before the host's layout cleanup observes an unmounted request", () => {
    const pending = deferred<readonly MagicBoxSpan[]>();
    let signal: AbortSignal | undefined;
    let abortedAtHostCleanup: boolean | undefined;
    function Host() {
      const box = useMagicBox({
        defaultValue: "Alice",
        onExtract: (_text, context) => {
          signal = context.signal;
          return pending.promise;
        },
      });
      useLayoutEffect(() => {
        void box.extract();
        return () => {
          abortedAtHostCleanup = signal?.aborted;
        };
      }, []);
      return null;
    }
    const { unmount } = render(<Host />);
    unmount();
    expect(abortedAtHostCleanup).toBe(true);
  });

  it("renders initial annotations without invoking the host and clears them on edit", async () => {
    const onExtract = vi.fn(async () => [person]);
    const onResult = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <MagicBox
        defaultValue="Alice"
        defaultSpans={[{ ...person, confidence: 0.98 }]}
        sourceTitle="Case note"
        onExtract={onExtract}
        onResult={onResult}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.getByRole("region", { name: "Source text" }).textContent).toBe("Alice");
    expect(screen.getByText("98% confidence")).toBeTruthy();
    expect(screen.getByText("Characters 0–5")).toBeTruthy();
    expect(onExtract).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "1. Person: Alice" }));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ id: "person" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox")));
    expect(screen.queryByRole("button", { name: "1. Person: Alice" })).toBeNull();
  });

  it("normalizes initial codepoint spans and invalidates them on controlled replacement", () => {
    const { result, rerender } = renderHook(
      ({ value }) =>
        useMagicBox({
          value,
          defaultSpans: [{ ...person, start: 1, end: 6 }],
          offsetUnit: "codepoint",
          onExtract: extract,
        }),
      { initialProps: { value: "🙂Alice" } },
    );
    expect(result.current.selectedSpan).toMatchObject({ start: 2, end: 7 });
    rerender({ value: "Bob" });
    expect(result.current.status).toBe("idle");
    expect(result.current.spans).toHaveLength(0);
  });

  it("surfaces invalid initial annotations and lets the user correct the input", async () => {
    render(
      <MagicBox
        defaultValue="Alice"
        defaultSpans={[{ ...person, end: 100 }]}
        onExtract={extract}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("invalid source offsets");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alice Smith" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await screen.findByRole("button", { name: "Person: Alice" });
  });

  it("types normally, keeps Enter as a newline, and extracts on Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    const onExtract = vi.fn(async () => [person]);
    render(<MagicBox onExtract={onExtract} onResult={onResult} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Alice{Enter}Email her");
    expect((textarea as HTMLTextAreaElement).value).toBe("Alice\nEmail her");
    expect(onExtract).not.toHaveBeenCalled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(onResult).toHaveBeenCalledOnce());
    expect(onResult.mock.calls[0]![1]).toBe("Alice\nEmail her");
    expect(screen.getByRole("button", { name: "Person: Alice" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("does not extract an IME composition or a prevented native handler", () => {
    const onExtract = vi.fn(async () => []);
    const { rerender } = render(<MagicBox defaultValue="Alice" onExtract={onExtract} />);
    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      ctrlKey: true,
      isComposing: true,
    });
    expect(onExtract).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      ctrlKey: true,
      keyCode: 229,
    });
    expect(onExtract).not.toHaveBeenCalled();
    rerender(
      <MagicBox
        defaultValue="Alice"
        onExtract={onExtract}
        textareaProps={{ onKeyDown: (event) => event.preventDefault() }}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", metaKey: true });
    expect(onExtract).not.toHaveBeenCalled();
  });

  it("aborts and ignores a late completion, then permits another extraction", async () => {
    const pending = deferred<readonly MagicBoxSpan[]>();
    let signal: AbortSignal | undefined;
    const onResult = vi.fn();
    const onExtract = vi.fn((_text: string, context: { signal: AbortSignal }) => {
      signal = context.signal;
      return onExtract.mock.calls.length === 1 ? pending.promise : Promise.resolve([person]);
    });
    render(<MagicBox defaultValue="Alice" onExtract={onExtract} onResult={onResult} />);
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve([person]));
    expect(onResult).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledOnce());
  });

  it("prevents double submission while extracting", async () => {
    const pending = deferred<readonly MagicBoxSpan[]>();
    const onExtract = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useMagicBox({ defaultValue: "Alice", onExtract }));
    act(() => {
      void result.current.extract();
      void result.current.extract();
    });
    expect(onExtract).toHaveBeenCalledOnce();
    await act(async () => pending.resolve([person]));
    expect(result.current.status).toBe("success");
  });

  it("clears results immediately on controlled source replacement and aborts work", async () => {
    const pending = deferred<readonly MagicBoxSpan[]>();
    let signal: AbortSignal | undefined;
    const onExtract = vi.fn((_text: string, context: { signal: AbortSignal }) => {
      signal = context.signal;
      return pending.promise;
    });
    const onResult = vi.fn();
    const { rerender } = render(
      <MagicBox value="Alice" onExtract={onExtract} onResult={onResult} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    rerender(<MagicBox value="Bob" onExtract={onExtract} onResult={onResult} />);
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Ready");
    await act(async () => pending.resolve([person]));
    expect(onResult).not.toHaveBeenCalled();
  });

  it("doesn't revive results when controlled text changes away and back", async () => {
    const { rerender } = render(<MagicBox value="Alice" onExtract={extract} />);
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await screen.findByRole("button", { name: "Edit text" });
    rerender(<MagicBox value="Bob" onExtract={extract} />);
    rerender(<MagicBox value="Alice" onExtract={extract} />);
    expect(screen.queryByRole("button", { name: "Edit text" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Ready");
  });

  it("aborts work on StrictMode unmount without publishing errors or results", async () => {
    const pending = deferred<readonly MagicBoxSpan[]>();
    let signal: AbortSignal | undefined;
    const onError = vi.fn();
    const onResult = vi.fn();
    const { unmount } = render(
      <StrictMode>
        <MagicBox
          defaultValue="Alice"
          onExtract={(_text, context) => {
            signal = context.signal;
            return pending.promise;
          }}
          onError={onError}
          onResult={onResult}
        />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(new Error("Host stopped")));
    expect(onError).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("surfaces host errors, validates malformed responses, and supports retry", async () => {
    const onExtract = vi
      .fn()
      .mockRejectedValueOnce(new Error("Could not read the text."))
      .mockResolvedValueOnce([{ ...person, end: 100 }])
      .mockResolvedValue([person]);
    const onError = vi.fn();
    render(<MagicBox defaultValue="Alice" onExtract={onExtract} onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not read the text.");
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("invalid source offsets"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await screen.findByRole("button", { name: "Person: Alice" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("supports empty results, editing focus, and clearing", async () => {
    render(<MagicBox defaultValue="No names here." onExtract={async () => []} />);
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("No fields found"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox")));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Extract" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("keeps the named textarea in a host form and exposes its native ref", async () => {
    const ref = createRef<HTMLTextAreaElement>();
    const submit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <MagicBox ref={ref} name="note" defaultValue="Alice" onExtract={extract} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await screen.findByRole("button", { name: "Edit text" });
    expect(ref.current?.value).toBe("Alice");
    expect(new FormData(ref.current!.form!).get("note")).toBe("Alice");
    expect(submit).not.toHaveBeenCalled();
    expect(ref.current?.hidden).toBe(true);
  });

  it("selects overlapping fields independently without duplicated text", async () => {
    const onSelectionChange = vi.fn();
    render(
      <MagicBox
        defaultValue="Alice Smith"
        onExtract={async () => [person, { id: "full", label: "Full name", start: 0, end: 11 }]}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await screen.findByRole("button", { name: "2. Full name: Alice Smith" });
    expect(screen.getByRole("region", { name: "Source text" }).textContent).toBe("Alice Smith");
    fireEvent.click(screen.getByRole("button", { name: "2. Full name: Alice Smith" }));
    expect(onSelectionChange.mock.calls[0]![0].id).toBe("full");
  });

  it("does not invent confidence and permits custom typed rendering", async () => {
    render(
      <MagicBox
        defaultValue="Alice"
        onExtract={async () => [{ ...person, value: { first: "Alice" }, confidence: null }]}
        renderValue={(span) => <code>{span.value?.first}</code>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    await screen.findByRole("button", { name: "Person: Alice" });
    expect(document.querySelector('[data-part="confidence"]')).toBeNull();
    expect(document.querySelector('[data-part="detail-value"] code')?.textContent).toBe("Alice");
  });

  it("renders server-side, creates distinct accessible ids, and gates optional styling", () => {
    const markup = renderToString(
      <>
        <MagicBox defaultValue="Alice" onExtract={extract} />
        <MagicBox unstyled onExtract={extract} />
      </>,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;
    const inputs = container.querySelectorAll("textarea");
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
    expect(container.querySelectorAll("[data-styled]")).toHaveLength(1);
    expect(container.querySelectorAll("label")[0]!.htmlFor).toBe(inputs[0]!.id);
  });
});
