import { describe, expect, it, vi } from "vitest";
import { extractPointers, sourceRange, type PointerEncoder } from "../demo/pointer";

describe("pointer extraction host", () => {
  it("preserves UTF-16 offsets for split emoji tokens and trims source whitespace", () => {
    expect(sourceRange("Hi 😀 Ada  ", 4, 8)).toEqual([3, 5]);
    expect(sourceRange("Hi 😀 Ada  ", 7, 13)).toEqual([6, 9]);
    expect(() => sourceRange("Ada", 0, 4)).toThrow("invalid source range");
  });

  it("builds BOS-marked joint input and maps present and absent answers", async () => {
    const source = "😀 Ada";
    const encoder: PointerEncoder = {
      tokenize: vi.fn<PointerEncoder["tokenize"]>((text) =>
        text === source
          ? {
              ids: [1, 2, 3, 4],
              offsets: [
                [0, 0],
                [0, 2],
                [2, 4],
                [4, 8],
              ],
            }
          : {
              ids: [1, 9],
              offsets: [
                [0, 0],
                [0, text.length],
              ],
            },
      ),
      predict: vi.fn<PointerEncoder["predict"]>(async () => ({
        answers: [
          { type: "extract", span: [3, 4], presence: 0.9 },
          { type: "extract", span: null, presence: 0.1 },
        ],
      })),
    };
    expect(await extractPointers(encoder, source, ["Person", "Email"])).toEqual([
      {
        id: "Person-3",
        label: "Person",
        start: 3,
        end: 6,
        value: "Ada",
        tone: "sage",
      },
    ]);
    const input = JSON.parse(vi.mocked(encoder.predict).mock.calls[0]![0]);
    expect(input.questions[0].kind).toEqual({
      type: "extract",
      absent_index: 2,
      source_start: 8,
      selectable: [false, true, true, true],
      presence_threshold: 0.5,
    });
    expect(input.questions[1].query_index).toBe(4);
    expect(vi.mocked(encoder.tokenize).mock.calls.every(([, bos]) => bos)).toBe(true);
  });

  it("rejects over-capacity input and invalid model spans", async () => {
    const encoder: PointerEncoder = {
      tokenize: () => ({ ids: Array(513).fill(1), offsets: [[0, 0]] }),
      predict: vi.fn(),
    };
    await expect(extractPointers(encoder, "Ada", ["Person"])).rejects.toThrow("Shorten");
    expect(encoder.predict).not.toHaveBeenCalled();
    encoder.tokenize = () => ({
      ids: [1, 2],
      offsets: [
        [0, 0],
        [0, 3],
      ],
    });
    encoder.predict = async () => ({ answers: [{ type: "extract", span: [0, 2], presence: 1 }] });
    await expect(extractPointers(encoder, "Ada", ["Person"])).rejects.toThrow(
      "invalid token range",
    );
  });
});
