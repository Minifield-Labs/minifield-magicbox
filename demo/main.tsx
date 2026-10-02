import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MagicBox } from "../src";
import "../src/styles.css";
import "./style.css";
import { caseNote, extractSample, meetingNote, sampleSchema, sampleSpans } from "./fixtures";
import { extractWithRuntime } from "./runtime";
import { SchemaEditor } from "./schema-editor";

const sampleMode = import.meta.env.VITE_MAGICBOX_DEMO === "sample";

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [skin, setSkin] = useState<"default" | "custom">("default");
  const [sample, setSample] = useState<"case" | "meeting" | "blank">("case");
  const [revision, setRevision] = useState(0);
  const [text, setText] = useState(caseNote);
  const [schema, setSchema] = useState(sampleSchema);
  const initial = sample === "case" ? caseNote : sample === "meeting" ? meetingNote : "";
  function choose(next: typeof sample) {
    setSample(next);
    setText(next === "case" ? caseNote : next === "meeting" ? meetingNote : "");
    setRevision((current) => current + 1);
  }
  return (
    <div className="demo" data-theme={theme}>
      <header className="site-header">
        <a className="wordmark" href="https://minifieldlabs.com">
          Minifield <span>Labs</span>
        </a>
      </header>
      <main className="demo-main">
        <div className="titlebar">
          <h1>MagicBox</h1>
          <div className="top-actions">
            <div className="samples" role="group" aria-label="Sample text">
              <button type="button" aria-pressed={sample === "case"} onClick={() => choose("case")}>
                Case note
              </button>
              <button
                type="button"
                aria-pressed={sample === "meeting"}
                onClick={() => choose("meeting")}
              >
                Meeting
              </button>
              <button
                type="button"
                aria-pressed={sample === "blank"}
                onClick={() => choose("blank")}
              >
                Blank
              </button>
            </div>
            <div className="appearance" role="group" aria-label="Appearance">
              <button
                type="button"
                aria-pressed={skin === "custom"}
                onClick={() => setSkin((current) => (current === "default" ? "custom" : "default"))}
              >
                {skin === "default" ? "Custom skin" : "Default skin"}
              </button>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              >
                {theme === "dark" ? "Light" : "Dark"}
              </button>
            </div>
          </div>
        </div>
        <SchemaEditor schema={schema} onApply={setSchema} />
        <MagicBox
          key={revision}
          value={text}
          schema={schema}
          {...(sample === "blank" || !sampleMode
            ? {}
            : {
                defaultSpans: sampleSpans(initial, schema),
                sourceTitle: sample === "case" ? "Case note · FC-2026-1198" : "Meeting note",
              })}
          labels={{
            source: "Source document",
          }}
          onValueChange={setText}
          onExtract={sampleMode ? extractSample : extractWithRuntime}
          theme={theme}
          unstyled={skin === "custom"}
          {...(skin === "custom" ? { className: "custom-box" } : {})}
          name="source"
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
