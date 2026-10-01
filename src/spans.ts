import type { MagicBoxSpan, OffsetUnit } from "./types.js";

export interface SourceSegment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly ids: readonly string[];
}

function boundaries(text: string): number[] {
  const result = [0];
  for (const point of text) result.push(result[result.length - 1]! + point.length);
  return result;
}

function splitsSurrogate(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** Validate at the host boundary. Copy and freeze the result; normalize offsets to UTF-16. */
export function normalizeSpans<T>(
  text: string,
  spans: readonly MagicBoxSpan<T>[],
  offsetUnit: OffsetUnit = "utf16",
): readonly MagicBoxSpan<T>[] {
  if (!Array.isArray(spans)) throw new Error("Extraction must return an array of spans.");
  if (offsetUnit !== "utf16" && offsetUnit !== "codepoint")
    throw new Error("Unknown source offset unit.");
  const points = offsetUnit === "codepoint" ? boundaries(text) : null;
  const length = points ? points.length - 1 : text.length;
  const ids = new Set<string>();
  const result: MagicBoxSpan<T>[] = [];
  for (const span of spans) {
    if (!span || typeof span.id !== "string" || !span.id.trim() || ids.has(span.id)) {
      throw new Error("Every extracted field needs a unique, nonempty id.");
    }
    ids.add(span.id);
    if (typeof span.label !== "string" || !span.label.trim())
      throw new Error(`Field "${span.id}" needs a label.`);
    if (
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < 0 ||
      span.end <= span.start ||
      span.end > length
    ) {
      throw new Error(`Field "${span.id}" has invalid source offsets.`);
    }
    const start = points ? points[span.start]! : span.start;
    const end = points ? points[span.end]! : span.end;
    if (splitsSurrogate(text, start) || splitsSurrogate(text, end))
      throw new Error(`Field "${span.id}" splits a Unicode character.`);
    if (
      span.confidence != null &&
      (!Number.isFinite(span.confidence) || span.confidence < 0 || span.confidence > 1)
    ) {
      throw new Error(`Field "${span.id}" has invalid confidence.`);
    }
    if (span.tone !== undefined && !["ember", "sage", "sky", "lilac"].includes(span.tone))
      throw new Error(`Field "${span.id}" has an invalid tone.`);
    result.push(Object.freeze({ ...span, start, end }));
  }
  return Object.freeze(result);
}

/** Segment validated UTF-16 spans. Preserve source text and the host's order within overlaps. */
export function segmentSource(text: string, spans: readonly MagicBoxSpan[]): SourceSegment[] {
  const events = spans
    .flatMap((span, index) => [
      { offset: span.start, index, entering: true },
      { offset: span.end, index, entering: false },
    ])
    .sort((a, b) => a.offset - b.offset);
  const active = new Set<number>();
  const segments: SourceSegment[] = [];
  let cursor = 0;
  let start = 0;
  while (start < text.length) {
    while (cursor < events.length && events[cursor]!.offset === start) {
      const event = events[cursor++]!;
      if (event.entering) active.add(event.index);
      else active.delete(event.index);
    }
    const end = events[cursor]?.offset ?? text.length;
    segments.push({
      start,
      end,
      text: text.slice(start, end),
      ids: [...active].sort((a, b) => a - b).map((index) => spans[index]!.id),
    });
    start = end;
  }
  return segments;
}
