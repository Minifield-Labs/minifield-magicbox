import { useRef, useState } from "react";
import { sampleSchema, type SampleSchema } from "./fixtures";

export function SchemaEditor({
  schema,
  onApply,
}: {
  schema: SampleSchema;
  onApply: (schema: SampleSchema) => void;
}) {
  const [fields, setFields] = useState(schema.fields);
  const [error, setError] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  function update(index: number, key: "name" | "question", value: string) {
    setFields((current) =>
      current.map((field, position) => (position === index ? { ...field, [key]: value } : field)),
    );
    setError("");
  }

  return (
    <details className="schema-editor" ref={details}>
      <summary ref={summary}>
        Schema{" "}
        <span>
          {schema.fields.length} {schema.fields.length === 1 ? "field" : "fields"}
        </span>
      </summary>
      <form
        aria-label="Extraction schema"
        onSubmit={(event) => {
          event.preventDefault();
          const next = fields.map(({ name, question }) => ({
            name: name.trim(),
            question: question.trim(),
          }));
          if (next.some((field) => !field.name || !field.question)) {
            setError("Enter a name and question for each field.");
            return;
          }
          if (new Set(next.map((field) => field.name.toLowerCase())).size !== next.length) {
            setError("Use a different name for each field.");
            return;
          }
          setFields(next);
          setError("");
          onApply({ fields: next });
          details.current!.open = false;
          summary.current?.focus();
        }}
      >
        <div className="schema-fields">
          {fields.map((field, index) => (
            <div className="schema-row" key={index}>
              <label>
                Field name
                <input
                  aria-label={`Field name ${index + 1}`}
                  value={field.name}
                  required
                  maxLength={80}
                  onChange={(event) => update(index, "name", event.target.value)}
                />
              </label>
              <label>
                Extraction question
                <input
                  aria-label={`Extraction question ${index + 1}`}
                  value={field.question}
                  required
                  maxLength={256}
                  onChange={(event) => update(index, "question", event.target.value)}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove field ${index + 1}`}
                disabled={fields.length === 1}
                onClick={() => {
                  setFields((current) => current.filter((_, position) => position !== index));
                  setError("");
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="schema-actions">
          <button
            type="button"
            disabled={fields.length >= 32}
            onClick={() => setFields((current) => [...current, { name: "", question: "" }])}
          >
            Add field
          </button>
          <div>
            <button
              type="button"
              onClick={() => {
                setFields(sampleSchema.fields);
                setError("");
              }}
            >
              Reset
            </button>
            <button type="submit">Apply schema</button>
          </div>
        </div>
      </form>
    </details>
  );
}
