import type { MagicBoxSpan } from "../src";
import type { SampleSchema } from "./fixtures";

export interface Encoding {
  ids: number[];
  offsets: [number, number][];
}

export interface PointerEncoder {
  tokenize(text: string, bos: boolean): Encoding;
  predict(input: string): Promise<{
    answers: { type: string; span: [number, number] | null; presence: number }[];
  }>;
}

const questions = {
  Card: "What payment card is mentioned?",
  Address: "What is the customer's delivery address?",
  Email: "What is the email address?",
  Person: "What is the name of the person mentioned?",
} as const;
const tones = { Card: "sky", Address: "ember", Email: "lilac", Person: "sage" } as const;

// Convert byte boundaries to UTF-16, including tokens that split a Unicode scalar.
export function sourceRange(text: string, start: number, end: number): [number, number] {
  const bytes = new TextEncoder().encode(text);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > bytes.length
  )
    throw new Error("The model returned an invalid source range.");
  while (start > 0 && (bytes[start]! & 0xc0) === 0x80) start--;
  while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end++;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let left = decoder.decode(bytes.subarray(0, start)).length;
  let right = left + decoder.decode(bytes.subarray(start, end)).length;
  while (left < right && /\s/u.test(text[left]!)) left++;
  while (right > left && /\s/u.test(text[right - 1]!)) right--;
  return [left, right];
}

export async function extractPointers(
  encoder: PointerEncoder,
  text: string,
  fields: SampleSchema["fields"],
): Promise<MagicBoxSpan[]> {
  if (!fields.length) return [];
  const ids: number[] = [];
  const layouts = fields.map((field) => {
    const query = ids.length;
    ids.push(...encoder.tokenize(`Type: extract\nQuestion: ${questions[field]}`, true).ids);
    const absent = ids.length;
    ids.push(...encoder.tokenize("Answer: not stated in the text", true).ids);
    return { query, absent };
  });
  const sourceStart = ids.length;
  const source = encoder.tokenize(text, true);
  ids.push(...source.ids);
  if (ids.length > 512) throw new Error("Shorten the text and try again.");
  const result = await encoder.predict(
    JSON.stringify({
      token_ids: ids,
      questions: layouts.map(({ query, absent }) => ({
        query_index: query,
        option_indices: [absent],
        kind: {
          type: "extract",
          absent_index: absent,
          source_start: sourceStart,
          selectable: source.offsets.map(([start, end]) => end > start),
          presence_threshold: 0.5,
        },
      })),
    }),
  );
  if (result.answers.length !== fields.length)
    throw new Error("The model returned incomplete results.");
  return result.answers.flatMap((answer, index) => {
    const label = fields[index]!;
    if (
      answer.type !== "extract" ||
      !Number.isFinite(answer.presence) ||
      answer.presence < 0 ||
      answer.presence > 1
    )
      throw new Error("The model returned an invalid extraction.");
    if (answer.span === null) return [];
    const [first, last] = answer.span;
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 1 ||
      last <= first ||
      last > source.offsets.length
    )
      throw new Error("The model returned an invalid token range.");
    const [start, end] = sourceRange(text, source.offsets[first]![0], source.offsets[last - 1]![1]);
    if (start === end) return [];
    return [
      {
        id: `${label}-${start}`,
        label,
        start,
        end,
        value: text.slice(start, end),
        tone: tones[label],
      },
    ];
  });
}
