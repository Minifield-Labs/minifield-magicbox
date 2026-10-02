import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("real pointer inference, cancellation, recovery, source offsets, and responsive presentation", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  const gpu = await page.evaluate(async () => {
    const adapter = await (
      navigator as Navigator & {
        gpu?: {
          requestAdapter(): Promise<{ info: { vendor: string; description: string } } | null>;
        };
      }
    ).gpu?.requestAdapter();
    return adapter?.info
      ? { vendor: adapter.info.vendor, description: adapter.info.description }
      : null;
  });
  expect(gpu, "A real WebGPU adapter is required").not.toBeNull();
  expect(JSON.stringify(gpu)).not.toMatch(/swiftshader|software|llvmpipe/i);
  await page.getByRole("button", { name: "Blank", exact: true }).click();
  const source =
    "😀 Contact Ada Lovelace at ada@example.org. Deliver the card to 2847 Mission Street, San Francisco, CA 94110.";
  await page.getByRole("textbox").fill(source);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Ready");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(/\d+ fields?/, { timeout: 120_000 });
  await expect(page.getByRole("region", { name: "Source document" })).toHaveText(source);
  const highlights = await page.locator('[data-part="highlight"]').allTextContents();
  expect(highlights.length).toBeGreaterThan(0);
  for (const highlight of highlights) expect(source).toContain(highlight);
  await page.screenshot({ path: ".local/runtime-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/runtime-mobile.png", fullPage: true });
  const modelRequests = requests.filter((url) => url.endsWith("/model.safetensors")).length;
  expect(modelRequests).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Edit text" }).click();
  await page.getByRole("textbox").fill("Email Priya at priya@example.org.");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(/\d+ fields?/, { timeout: 120_000 });
  await expect(page.getByRole("region", { name: "Source document" })).toHaveText(
    "Email Priya at priya@example.org.",
  );
  expect(requests.filter((url) => url.endsWith("/model.safetensors"))).toHaveLength(modelRequests);
  expect(requests.some((url) => url.includes("telemetry"))).toBe(false);
  expect(
    requests
      .filter((url) => /^https?:/.test(url))
      .every((url) => new URL(url).hostname === "127.0.0.1"),
  ).toBe(true);
});

test("browser scores match the frozen native reference", async ({ page }) => {
  test.skip(
    !process.env.MAGICBOX_POINTER_INPUTS || !process.env.MAGICBOX_POINTER_REFERENCE,
    "Set explicit frozen input and reference paths to run numerical parity.",
  );
  const inputs = JSON.parse(await readFile(process.env.MAGICBOX_POINTER_INPUTS!, "utf8"));
  const reference = JSON.parse(await readFile(process.env.MAGICBOX_POINTER_REFERENCE!, "utf8"));
  const input = inputs.cases[0];
  const expected = reference.cases.find((entry: { id: string }) => entry.id === input.id);
  expect(
    createHash("sha256")
      .update(await readFile(process.env.MAGICBOX_POINTER_INPUTS!))
      .digest("hex"),
  ).toBe(reference.artifacts.inputs_sha256);
  await page.goto("/");
  const result = await page.evaluate(async (input) => {
    const runtimeUrl = "/runtime/minifield_web_demo.js";
    const runtime = await import(/* @vite-ignore */ runtimeUrl);
    await runtime.default({ module_or_path: "/runtime/minifield_web_demo_bg.wasm" });
    runtime.configure_telemetry({ enabled: false });
    const assets = await Promise.all(
      ["config.json", "model.safetensors", "tokenizer/tokenizer.json"].map(async (file) => {
        const response = await fetch(`/model/${file}`);
        if (!response.ok) throw new Error(`Failed to load ${file}`);
        return new Uint8Array(await response.arrayBuffer());
      }),
    );
    const hashes = await Promise.all(
      assets.map(async (bytes) => {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }),
    );
    const encoder = await runtime.load_pointer_encoder(...assets);
    try {
      const tokenization = encoder.tokenize("😀 Ada\r\n café", true);
      const prediction = await encoder.predict(JSON.stringify(input));
      await encoder.predict('{"token_ids":[],"questions":[]}').then(
        () => {
          throw new Error("Empty input was accepted");
        },
        () => {},
      );
      const recovered = await encoder.predict(JSON.stringify(input));
      return { prediction, recovered, tokenization, hashes };
    } finally {
      encoder.free();
    }
  }, input);
  expect(result.hashes).toEqual([
    reference.artifacts.config_sha256,
    reference.artifacts.weights_sha256,
    reference.artifacts.tokenizer_sha256,
  ]);
  const actual: number[] = [
    ...result.prediction.start,
    ...result.prediction.end,
    ...result.prediction.answers.flatMap(
      (answer: { type: string; presence: number; probabilities: number[] }) =>
        answer.type === "extract" ? [answer.presence] : answer.probabilities,
    ),
  ];
  expect(actual.length).toBe(expected.output.length);
  let maximumError = 0;
  for (let index = 0; index < actual.length; index++) {
    expect(Number.isFinite(actual[index])).toBe(true);
    const error = Math.abs(actual[index]! - expected.output[index]);
    maximumError = Math.max(maximumError, error);
    expect(error).toBeLessThanOrEqual(0.001 + 0.001 * Math.abs(expected.output[index]));
  }
  expect(result.recovered.answers).toEqual(result.prediction.answers);
  expect(result.prediction.answers[0].index).toBe(expected.prediction[0].index);
  expect(result.prediction.answers[1].span).toEqual([
    expected.prediction[1].start,
    expected.prediction[1].end,
  ]);
  expect(result.tokenization.offsets[0]).toEqual([0, 0]);
  expect(result.tokenization.offsets.at(-1)[1]).toBe(
    new TextEncoder().encode("😀 Ada\r\n café").length,
  );
  await test.info().attach("parity", {
    body: JSON.stringify({ maximumError, prediction: result.prediction.answers }),
    contentType: "application/json",
  });
});
