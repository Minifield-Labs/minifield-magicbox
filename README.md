# MagicBox

<img width="2560" height="1800" alt="MagicBox textbox with highlighted source text, an extracted-field list, and selected-field details" src="https://github.com/user-attachments/assets/a34a85a5-c890-45b3-9083-3f7e3b0c063e" />

A React textbox for extracting typed data from free text. React 18.3 and 19.

```sh
npm install @minifield-labs/magicbox
```

```tsx
import { MagicBox } from "@minifield-labs/magicbox";
import "@minifield-labs/magicbox/styles.css";

const schema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    person: { type: "string" },
  },
} as const;

<MagicBox schema={schema} onExtract={(text, context) => yourRuntime.extract(text, context)} />;
```

`onExtract` receives `{ schema, signal }` and returns spans with `id`, `label`, `start`, and `end` (UTF-16 offsets). `value`, `tone`, and `confidence` are optional. The host owns the schema format and extraction. Replacing `schema` cancels pending work and clears results.

Use `unstyled` for your own CSS, or `useMagicBox` from `@minifield-labs/magicbox/headless` for your own UI. Fonts inherit from your site.

[MIT](LICENSE), copyright 2026 Minifield Labs.
