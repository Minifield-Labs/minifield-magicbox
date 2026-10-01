import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MagicBox } from "@minifield-labs/magicbox";
import { normalizeSpans, segmentSource } from "@minifield-labs/magicbox/spans";
const source = "🙂Alice";
const spans = normalizeSpans(
  source,
  [{ id: "name", label: "Person", start: 1, end: 6 }],
  "codepoint",
);
const html = renderToString(
  createElement(MagicBox, {
    defaultValue: source,
    defaultSpans: spans,
    onExtract: async () => spans,
  }),
);
assert.match(html, /Selected span/);
assert.match(html, /1\. Person: Alice/);
assert.equal(
  segmentSource(source, spans)
    .map((part) => part.text)
    .join(""),
  source,
);
console.log("Packed package: React 18 SSR and pure span imports passed.");
