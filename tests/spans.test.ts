import { describe, expect, it } from "vitest";
import { normalizeSpans, segmentSource } from "../src/spans";
import type { MagicBoxSpan, OffsetUnit } from "../src/types";

describe("source spans", () => {
  it("converts Python codepoint offsets without changing the source", () => {
    const text = "👋 Email Zoë at zoe@example.org.";
    const [span] = normalizeSpans(
      text,
      [{ id: "name", label: "Person", start: 8, end: 11 }],
      "codepoint",
    );
    expect(text.slice(span!.start, span!.end)).toBe("Zoë");
    expect(span!.start).toBe(9);
  });

  it("preserves overlapping and repeated occurrences exactly", () => {
    const text = "Alice Alice\n";
    const spans = normalizeSpans(text, [
      { id: "first", label: "First", start: 0, end: 5 },
      { id: "both", label: "Both", start: 0, end: 11 },
      { id: "second", label: "Second", start: 6, end: 11 },
    ]);
    const segments = segmentSource(text, spans);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments[0]!.ids).toEqual(["first", "both"]);
    expect(segments[2]!.ids).toEqual(["both", "second"]);
  });

  it.each([
    { id: "bad", label: "Bad", start: -1, end: 3 },
    { id: "bad", label: "Bad", start: 1, end: 1 },
    { id: "bad", label: "Bad", start: 0, end: 6 },
    { id: "bad", label: "Bad", start: 0.5, end: 2 },
    { id: "bad", label: "Bad", start: 0, end: 2, confidence: NaN },
    { id: "bad", label: "Bad", start: 0, end: 2, confidence: 1.1 },
    { id: "", label: "Bad", start: 0, end: 2 },
    { id: "bad", label: "", start: 0, end: 2 },
    { id: "bad", label: "Bad", start: 0, end: 2, tone: "invalid" },
  ])("rejects malformed span %j", (span) => {
    expect(() => normalizeSpans("hello", [span as MagicBoxSpan])).toThrow();
  });

  it("rejects surrogate splitting and duplicate ids", () => {
    expect(() =>
      normalizeSpans("👋 hello", [{ id: "emoji", label: "Emoji", start: 0, end: 1 }]),
    ).toThrow("Unicode");
    const span = { id: "name", label: "Name", start: 0, end: 3 };
    expect(() => normalizeSpans("Amy Amy", [span, span])).toThrow("unique");
  });

  it("accepts absent confidence and freezes copied host spans", () => {
    const host = { id: "name", label: "Person", start: 0, end: 3, confidence: null };
    const spans = normalizeSpans("Amy", [host]);
    host.label = "Changed";
    expect(spans[0]!.label).toBe("Person");
    expect(Object.isFrozen(spans[0])).toBe(true);
    expect(Object.isFrozen(spans)).toBe(true);
  });

  it("rejects sparse result arrays rather than passing holes to the renderer", () => {
    const sparse: MagicBoxSpan[] = [];
    sparse.length = 1;
    expect(() => normalizeSpans("Amy", sparse)).toThrow("unique");
  });

  it("rejects unknown offset units at the JavaScript host boundary", () => {
    expect(() => normalizeSpans("Amy", [], "bytes" as OffsetUnit)).toThrow("offset unit");
  });

  it("matches an independent interval oracle for seeded Unicode overlap cases", () => {
    const text = "🙂Amy 🌱Zoë\nAnnette";
    const points = [0];
    for (const point of text) points.push(points[points.length - 1]! + point.length);
    let seed = 71;
    function next(limit: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) % limit;
    }
    for (let trial = 0; trial < 80; trial++) {
      const spans = normalizeSpans(
        text,
        Array.from({ length: next(24) }, (_, index) => {
          const first = next(points.length - 1);
          const last = first + 1 + next(points.length - first - 1);
          return { id: String(index), label: "Field", start: points[first]!, end: points[last]! };
        }),
      );
      const segments = segmentSource(text, spans);
      expect(segments.map((segment) => segment.text).join("")).toBe(text);
      for (const segment of segments) {
        expect(segment.end).toBeGreaterThan(segment.start);
        expect(segment.ids).toEqual(
          spans
            .filter((span) => span.start <= segment.start && span.end >= segment.end)
            .map((span) => span.id),
        );
        expect(segment.text).toBe(text.slice(segment.start, segment.end));
      }
    }
    expect(segmentSource("", [])).toEqual([]);
    expect(segmentSource(text, [])).toEqual([{ start: 0, end: text.length, text, ids: [] }]);
  });

  it("preserves host order through touching, nested, and unsorted intervals", () => {
    const spans = normalizeSpans("abcdef", [
      { id: "late", label: "Late", start: 3, end: 6 },
      { id: "whole", label: "Whole", start: 0, end: 6 },
      { id: "early", label: "Early", start: 0, end: 3 },
      { id: "inner", label: "Inner", start: 1, end: 4 },
    ]);
    expect(segmentSource("abcdef", spans)).toEqual([
      { start: 0, end: 1, text: "a", ids: ["whole", "early"] },
      { start: 1, end: 3, text: "bc", ids: ["whole", "early", "inner"] },
      { start: 3, end: 4, text: "d", ids: ["late", "whole", "inner"] },
      { start: 4, end: 6, text: "ef", ids: ["late", "whole"] },
    ]);
  });

  it("matches codepoint and UTF-16 segmentation across 500 seeded Unicode sources", () => {
    const alphabet = [
      "🙂",
      "👩🏽‍🚀",
      "e\u0301",
      "中文",
      "العربية",
      "\n",
      "\t",
      " ",
      "\u0000",
      "\ud800",
      "\udfff",
      "&<>",
      "🇨🇦",
      "\u200b",
    ];
    let seed = 814;
    const next = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) % limit;
    };
    for (let trial = 0; trial < 500; trial++) {
      const text = Array.from(
        { length: 1 + next(30) },
        () => alphabet[next(alphabet.length)]!,
      ).join("");
      const points = [0];
      for (const point of text) points.push(points.at(-1)! + point.length);
      const raw = Array.from({ length: next(40) }, (_, index) => {
        const start = next(points.length - 1);
        return {
          id: `${index}`,
          label: "Field",
          start,
          end: start + 1 + next(points.length - start - 1),
        };
      });
      const normalized = normalizeSpans(text, raw, "codepoint");
      const utf16 = normalizeSpans(
        text,
        raw.map((span) => ({ ...span, start: points[span.start]!, end: points[span.end]! })),
      );
      expect(normalized).toEqual(utf16);
      const segments = segmentSource(text, normalized);
      expect(segments.map((part) => part.text).join("")).toBe(text);
      for (const segment of segments)
        expect(segment.ids).toEqual(
          normalized
            .filter((span) => span.start <= segment.start && span.end >= segment.end)
            .map((span) => span.id),
        );
    }
  });
});
