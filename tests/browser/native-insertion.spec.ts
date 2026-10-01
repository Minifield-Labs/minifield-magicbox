import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { largeSource } from "./sources";

const fixture = `/@fs${fileURLToPath(new URL("./fixture.html", import.meta.url))}`;
// Frozen native editors can't supply snapshots. Keep probe evidence in JSON.
test.use({ trace: "off", screenshot: "off" });

test("extreme bulk insertion is compared with the same native textarea control", async ({
  page,
  browser,
}, info) => {
  // Each probe can spend 10s inserting and 30s shutting down a stalled renderer.
  test.setTimeout(120000);
  const source = largeSource();
  await page.goto(fixture);
  const probe = async (native: boolean) => {
    // Isolate the renderer: a stalled native insertion can also block page teardown.
    const isolated = await browser.browserType().launch();
    const target = await isolated.newPage();
    const errors: string[] = [];
    target.on("pageerror", (error) => errors.push(error.message));
    target.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await target.goto(new URL(`${fixture}${native ? "?native" : ""}`, page.url()).href);
    const start = Date.now();
    try {
      await target
        .getByRole("textbox", { name: native ? "Native control" : "Source text", exact: true })
        .fill(source, { timeout: 10000 });
      return { success: true, elapsedMs: Date.now() - start, version: isolated.version() };
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
      return { success: false, elapsedMs: Date.now() - start, version: isolated.version() };
    } finally {
      await isolated.close();
      expect(errors).toEqual([]);
    }
  };
  const baseline = await test.step("Native textarea insertion", () => probe(true));
  const component = await test.step("MagicBox textarea insertion", () => probe(false));
  const path = info.outputPath("bulk-insertion.json");
  await writeFile(
    path,
    JSON.stringify(
      {
        browser: info.project.name,
        characters: source.length,
        lines: 40000,
        baseline,
        component,
      },
      null,
      2,
    ),
  );
  await info.attach("bulk-insertion.json", { path, contentType: "application/json" });
  expect(component.success).toBe(baseline.success);
});
