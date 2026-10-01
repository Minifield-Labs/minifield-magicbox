import { createRef } from "react";
import { MagicBox, type MagicBoxExtractor, type MagicBoxSpan } from "@minifield-labs/magicbox";
import { useMagicBox } from "@minifield-labs/magicbox/headless";
import { normalizeSpans } from "@minifield-labs/magicbox/spans";
const span: MagicBoxSpan<{ first: string }> = {
  id: "name",
  label: "Person",
  start: 0,
  end: 5,
  value: { first: "Alice" },
};
const schema = { fields: ["Person"] } as const;
const extract: MagicBoxExtractor<{ first: string }, typeof schema> = async (
  _text,
  { schema: received },
) => {
  const field: "Person" | undefined = received?.fields[0];
  void field;
  return [span];
};
const ref = createRef<HTMLTextAreaElement>();
export const component = (
  <MagicBox
    ref={ref}
    defaultValue="Alice"
    defaultSpans={[span]}
    schema={schema}
    onExtract={extract}
    rootProps={{ "data-testid": "magicbox", dir: "rtl", onClick: () => {} }}
    renderValue={(span) => <span>{span.value?.first}</span>}
  />
);
export function Consumer() {
  const box = useMagicBox({ schema, onExtract: extract });
  return <textarea value={box.value} onChange={(e) => box.setValue(e.target.value)} />;
}
export const inferredComponent = (
  <MagicBox
    schema={schema}
    onExtract={async (_text, context) => {
      const field: "Person" | undefined = context.schema?.fields[0];
      void field;
      return [span];
    }}
    renderValue={(selected) => <span>{selected.value?.first}</span>}
  />
);
normalizeSpans("Alice", [span]);
