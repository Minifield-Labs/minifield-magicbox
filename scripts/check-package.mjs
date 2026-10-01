import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(pkg.license, "MIT", "The package must declare its MIT license.");
assert.match(await readFile("LICENSE", "utf8"), /^MIT License\r?\n/);
for (const entry of Object.values(pkg.exports)) {
  const paths = typeof entry === "string" ? [entry] : Object.values(entry);
  for (const path of paths) {
    assert(path.startsWith("./dist/"), `Unexpected package export: ${path}.`);
    assert((await readFile(path)).length > 0, `Package export ${path} is empty.`);
  }
}
assert.equal(
  Object.keys(pkg.dependencies ?? {}).length,
  0,
  "Runtime dependencies must stay empty.",
);
assert.deepEqual(Object.keys(pkg.peerDependencies).sort(), ["react", "react-dom"]);

const samples = [
  { name: "component", entry: pkg.name, symbol: "MagicBox", budget: 4500, react: true },
  { name: "hook", entry: pkg.name, symbol: "useMagicBox", budget: 2000, react: true },
  {
    name: "headless",
    entry: `${pkg.name}/headless`,
    symbol: "useMagicBox",
    budget: 2000,
    react: true,
  },
  { name: "rootSpans", entry: pkg.name, symbol: "segmentSource", budget: 800, react: false },
  { name: "spans", entry: `${pkg.name}/spans`, symbol: "segmentSource", budget: 800, react: false },
  {
    name: "validation",
    entry: `${pkg.name}/spans`,
    symbol: "normalizeSpans",
    budget: 1200,
    react: false,
  },
];
const report = {};
for (const { name, entry, symbol, budget, react } of samples) {
  const result = await build({
    stdin: {
      contents: `import { ${symbol} } from '${entry}'; console.log(${symbol});`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    minify: true,
    format: "esm",
    platform: "browser",
    external: ["react", "react-dom", "react/jsx-runtime"],
    metafile: true,
    logLevel: "silent",
  });
  const bytes = result.outputFiles[0].contents;
  assert.equal(result.outputFiles.length, 1, `${entry} automatically loads CSS or other assets.`);
  for (const output of Object.values(result.metafile.outputs)) {
    for (const [path, input] of Object.entries(output.inputs)) {
      if (input.bytesInOutput > 0)
        assert(
          path === "<stdin>" || path.startsWith("dist/"),
          `${entry} bundles third-party code from ${path}.`,
        );
    }
  }
  const imports = Object.values(result.metafile.outputs).flatMap((output) =>
    output.imports.map((item) => item.path),
  );
  assert(
    imports.every((name) => ["react", "react-dom", "react/jsx-runtime"].includes(name)),
    `${entry} adds a runtime dependency.`,
  );
  if (!react) assert.deepEqual(imports, [], `${entry} pulls React into pure span utilities.`);
  if (name === "hook" || name === "headless") {
    assert(
      !Object.values(result.metafile.outputs).some((output) =>
        Object.entries(output.inputs).some(
          ([path, input]) => path.endsWith("/magicbox.js") && input.bytesInOutput > 0,
        ),
      ),
      "Headless imports pull in the presentation.",
    );
  }
  const gzipBytes = gzipSync(bytes).length;
  assert(gzipBytes <= budget, `${name}: ${gzipBytes}B exceeds the ${budget}B gzip budget.`);
  report[name] = { minifiedBytes: bytes.length, gzipBytes };
}

const css = await readFile("dist/styles.css", "utf8");
assert(!/@import|@font-face|url\(/i.test(css), "The skin mustn't download fonts or other assets.");
const minified = await build({
  stdin: { contents: css, loader: "css" },
  write: false,
  minify: true,
});
const cssBytes = minified.outputFiles[0].contents;
report.styles = { minifiedBytes: cssBytes.length, gzipBytes: gzipSync(cssBytes).length };
assert(report.styles.gzipBytes <= 2500, "Default CSS exceeds its 2500B gzip budget.");

for (const entry of ["index", "magicbox", "use-magicbox", "headless"]) {
  assert(
    (await readFile(`dist/${entry}.js`, "utf8")).startsWith('"use client";'),
    `${entry} lost its client boundary.`,
  );
}
assert(
  !(await readFile("dist/spans.js", "utf8")).includes('"use client"'),
  "Pure spans must remain usable on the server.",
);
const { segmentSource } = await import("@minifield-labs/magicbox/spans");
assert.equal(
  segmentSource("Server-safe", [])
    .map((segment) => segment.text)
    .join(""),
  "Server-safe",
);

await mkdir(".local", { recursive: true });
await writeFile(".local/bundle-size.json", `${JSON.stringify(report, null, 2)}\n`);
console.table(report);
console.log(
  "Package boundaries, runtime imports, and gzip budgets passed. React is external; CSS is optional.",
);
