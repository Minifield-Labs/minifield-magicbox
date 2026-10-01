import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => errors.push(error));
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://consumer.test",
  virtualConsole,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
dom.window.HTMLElement.prototype.scrollTo = function ({ top }) {
  this.scrollTop = top;
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MagicBox } = await import("@minifield-labs/magicbox");
const { useMagicBox } = await import("@minifield-labs/magicbox/headless");
assert.equal(typeof useMagicBox, "function");
const nodes = [];
const ref = (node) => {
  nodes.push(node);
};
const spans = [
  { id: "first", label: "Person", start: 0, end: 5 },
  { id: "second", label: "Person", start: 6, end: 11 },
];
const schema = { fields: ["Person"] };
const receivedSchemas = [];
const props = {
  defaultValue: "Alice Alice",
  schema,
  onExtract: async (_text, context) => {
    receivedSchemas.push(context.schema);
    return spans;
  },
  name: "note",
  ref,
};
const root = createRoot(document.getElementById("root"));
await act(async () => {
  root.render(createElement("form", null, createElement(MagicBox, props)));
});
const input = document.querySelector("textarea");
await act(async () => {
  document.querySelector('[data-part="button"]').click();
});
assert.equal(input.hidden, true);
assert.equal(new dom.window.FormData(input.form).get("note"), "Alice Alice");
await act(async () => {
  root.render(createElement("form", null, createElement(MagicBox, { ...props, theme: "light" })));
});
assert.deepEqual(nodes, [input]);
await act(async () => {
  input.form.reset();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
assert.equal(input.hidden, false);
assert.equal(input.value, "Alice Alice");
assert.equal(document.querySelectorAll('[data-part="field"]').length, 0);
await act(async () => {
  document.querySelector('[data-part="button"]').click();
});
await act(async () => {
  document.querySelector('[aria-label="Next field"]').click();
});
assert.equal(document.querySelector('[data-part="position"]').textContent, "2 of 2");
const replacement = { fields: ["Full name"] };
await act(async () => {
  root.render(
    createElement("form", null, createElement(MagicBox, { ...props, schema: replacement })),
  );
});
assert.equal(input.hidden, false);
assert.equal(document.querySelectorAll('[data-part="field"]').length, 0);
await act(async () => {
  document.querySelector('[data-part="button"]').click();
});
assert.equal(receivedSchemas[0], schema);
assert.equal(receivedSchemas[1], schema);
assert.equal(receivedSchemas[2], replacement);
await act(async () => {
  root.unmount();
});
assert.deepEqual(nodes, [input, null]);
assert.deepEqual(errors, []);
console.log(
  "Packed package: React 18 schemas, extraction, selection, form values/reset, and stable legacy refs passed.",
);
