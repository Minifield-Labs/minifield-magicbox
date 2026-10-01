import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { largeSource } from "./sources";

const fixture = `/@fs${fileURLToPath(new URL("./fixture.html", import.meta.url))}`;
const root = "[data-magicbox]";
const field = '[data-part="field"]';
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test("a new schema cancels old work and searches only for the requested field", async ({
  page,
}) => {
  await page.goto(`${fixture}?mode=schema&pending`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("button", { name: "Search Bob" }).click();
  await expect(page.getByRole("status")).toHaveText("Ready");
  await expect(page.getByLabel("Host events")).toContainText("abort:Alice Bob");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("button", { name: "Resolve oldest" }).click();
  await expect(page.getByRole("status")).toHaveText("Extracting…");
  await expect(page.getByLabel("Host events")).not.toContainText("result:");
  await page.getByRole("button", { name: "Resolve newest" }).click();
  await expect(page.locator(field)).toHaveCount(1);
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("Bob");
  await page.getByRole("button", { name: "Search Bob" }).click();
  await expect(page.locator(field)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Alice Bob");
});

test("a native reset restores the original uncontrolled value and cancels pending extraction", async ({
  page,
}) => {
  await page.goto(`${fixture}?pending`);
  await page.getByRole("textbox", { name: "Source text" }).fill("Edited source");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("button", { name: "Reset form", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Alice Bob");
  await expect(page.getByRole("status")).toHaveText("Ready");
  await expect(page.getByLabel("Host events")).toContainText("abort:Edited source");
  await page.getByRole("button", { name: "Resolve oldest" }).click();
  await expect(page.locator(field)).toHaveCount(0);
  await expect(page.getByLabel("Host events")).not.toContainText("result:");
});

test("read-only input preserves its text through every built-in action", async ({ page }) => {
  await page.goto(`${fixture}?readonly`);
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("2 fields");
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Alice Bob");
});

test("keyboard extraction moves focus into the source when the editor becomes hidden", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("textbox", { name: "Source text" }).press("Control+Enter");
  await expect(page.getByRole("status")).toHaveText("2 fields");
  await expect(page.getByRole("region", { name: "Source text" })).toBeFocused();
});

test("Escape cancels from the toolbar and never interrupts an outside input", async ({ page }) => {
  await page.goto(`${fixture}?pending`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("textbox", { name: "Outside input" }).press("Escape");
  await expect(page.getByRole("status")).toHaveText("Extracting…");
  await page.getByRole("button", { name: "Cancel", exact: true }).press("Escape");
  await expect(page.getByRole("status")).toHaveText("Ready");
  await expect(page.getByLabel("Host events")).toContainText("abort:Alice Bob");
});

test("a selected field and its details stay visible after navigating a long extraction rail", async ({
  page,
}) => {
  await page.goto(fixture);
  await page
    .getByRole("textbox", { name: "Source text" })
    .fill(Array.from({ length: 80 }, (_, i) => `Word${i}`).join("\n"));
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("80 fields");
  await page.locator(field).nth(40).click();
  await expect(page.locator('[data-part="detail"]')).toBeInViewport();
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("Word40");
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "Next field" }).click();
  await expect(page.locator(`${field}[aria-pressed="true"]`)).toBeInViewport();
  await expect(page.locator('[data-part="detail"]')).toBeInViewport();
  await expect(page.locator(root)).toHaveAttribute("data-state", "success");
});

test("cancel, edit, retry, resolve newest, and reject oldest publish exactly one current result", async ({
  page,
}) => {
  await page.goto(`${fixture}?pending&controlled`);
  const editor = page.getByRole("textbox", { name: "Source text" });
  for (let i = 0; i < 12; i++) {
    await editor.fill(`Attempt${i}`);
    await editor.press("Control+Enter");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await editor.fill("Final result");
  await editor.press("Control+Enter");
  await page.getByRole("button", { name: "Resolve newest" }).click();
  await expect(page.getByRole("status")).toHaveText("2 fields");
  for (let i = 0; i < 12; i++)
    await page.getByRole("button", { name: i % 2 ? "Reject oldest" : "Resolve oldest" }).click();
  await expect(page.getByRole("region", { name: "Source text" })).toHaveText("Final result");
  const events = await page.getByLabel("Host events").textContent();
  expect(events!.match(/^result:/gm)).toHaveLength(1);
  expect(events).not.toContain("error:");
  expect(events!.match(/^abort:/gm)).toHaveLength(12);
});

test("replacement and unmount suppress both old successes and old errors", async ({ page }) => {
  await page.goto(`${fixture}?pending&controlled`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("button", { name: "Replace source" }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Replacement");
  await page.getByRole("button", { name: "Reject oldest" }).click();
  await expect(page.getByRole("status")).toHaveText("Ready");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await page.getByRole("button", { name: "Toggle mount" }).click();
  await page.getByRole("button", { name: "Resolve oldest" }).click();
  await page.getByRole("button", { name: "Toggle mount" }).click();
  await expect(page.getByRole("status")).toHaveText("Ready");
  await expect(page.getByLabel("Host events")).not.toContainText("result:");
  await expect(page.getByLabel("Host events")).not.toContainText("error:");
});

test("a late keyboard result preserves focus that the user moved elsewhere", async ({ page }) => {
  await page.goto(`${fixture}?pending`);
  await page.getByRole("textbox", { name: "Source text" }).press("Control+Enter");
  const outside = page.getByRole("textbox", { name: "Outside input" });
  await outside.fill("Keep my focus here");
  // Complete the host request without clicking away from the user's chosen input.
  await outside.press("Shift+Tab");
  await page.getByRole("button", { name: "Resolve newest" }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("2 fields");
  await expect(page.getByRole("button", { name: "Resolve newest" })).toBeFocused();
});

test("native reset honors host prevention and an external form association", async ({ page }) => {
  await page.goto(`${fixture}?prevent-reset`);
  await page.getByRole("textbox", { name: "Source text" }).fill("Keep edits");
  await page.getByRole("button", { name: "Reset form", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Keep edits");
  await page.goto(`${fixture}?external-form`);
  await page.getByRole("textbox", { name: "Source text" }).fill("External edits");
  await page.getByRole("button", { name: "Reset form", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("External edits");
  await page.getByRole("button", { name: "Reset external form", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Alice Bob");
});

test("native required validation, input length, and form data survive extraction", async ({
  page,
}) => {
  await page.goto(`${fixture}?source=&required&limit`);
  await page.getByRole("button", { name: "Submit form" }).click();
  await expect(page.getByLabel("Host events")).not.toContainText("submit:");
  await expect(page.getByRole("textbox", { name: "Source text" })).toBeFocused();
  await page.getByRole("textbox", { name: "Source text" }).pressSequentially("1234567890123456789");
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("123456789012");
  await page.getByRole("textbox", { name: "Source text" }).press("Control+Enter");
  await expect(page.getByRole("status")).toHaveText("1 field");
  await page.getByRole("button", { name: "Submit form" }).click();
  await expect(page.getByLabel("Host events")).toContainText("submit:123456789012");
  await page.getByRole("button", { name: "Reset form", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeDisabled();
});

for (const unit of ["utf16", "codepoint"]) {
  test(`${unit} Unicode offsets and pasted markup retain exact source and never create HTML`, async ({
    page,
  }) => {
    await page.goto(
      `${fixture}?unit=${unit}&label=${encodeURIComponent('<img src=x onerror="alert(1)">')}`,
    );
    const source =
      '👩🏽‍🚀 e\u0301 中文 العربية\t👨‍👩‍👧‍👦\n\n<img src=x onerror="alert(1)">\n<script>alert(1)</script>\n& < > " \'\u200b';
    await page.getByRole("textbox", { name: "Source text" }).fill(source);
    await page.getByRole("button", { name: "Extract", exact: true }).click();
    await expect(page.locator(field)).toHaveCount([...source.matchAll(/\S+/gu)].length);
    expect(await page.getByRole("region", { name: "Source text" }).textContent()).toBe(source);
    await expect(page.locator(`${root} img, ${root} script`)).toHaveCount(0);
    await page.locator(field).last().click();
    expect(await page.locator('[data-part="detail-value"]').textContent()).toBe(
      [...source.matchAll(/\S+/gu)].at(-1)![0],
    );
    await page.getByRole("button", { name: "Edit text", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue(source);
  });
}

test("overlaps with prototype-like ids remain independently selectable", async ({ page }) => {
  await page.goto(`${fixture}?mode=overlap`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("region", { name: "Source text" })).toHaveText("Alice Bob");
  await page.locator(field).nth(1).click();
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("Alice");
  await page.getByRole("button", { name: "Previous field" }).click();
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("Alice Bob");
  await expect(page.getByLabel("Host events")).toContainText("select:__proto__");
});

test("1500 fields remain inspectable with exact source and working navigation", async ({
  page,
}) => {
  await page.goto(fixture);
  const source = Array.from({ length: 1500 }, (_, i) => `Field${i}`).join(" ");
  await page.getByRole("textbox", { name: "Source text" }).fill(source);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.locator(field)).toHaveCount(1500);
  expect(await page.getByRole("region", { name: "Source text" }).textContent()).toBe(source);
  await page.locator(field).nth(1498).click();
  await page.getByRole("button", { name: "Next field" }).click();
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("Field1499");
  await expect(page.locator(`${field}[aria-pressed="true"]`)).toBeInViewport();
  await expect(page.getByRole("button", { name: "Next field" })).toBeDisabled();
});

for (const width of ["240px", "320px", "600px"]) {
  test(`${width} container keeps long text, field labels, and actions reachable`, async ({
    page,
  }) => {
    await page.goto(`${fixture}?width=${width}&long-label`);
    await page.getByRole("textbox", { name: "Source text" }).fill("x".repeat(2000));
    await page.getByRole("button", { name: "Extract", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("1 field");
    const clipped = await page.locator(root).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('button, [data-part="detail-label"]')]
        .filter((child) => {
          const rect = child.getBoundingClientRect();
          return rect.width > 0 && (rect.left < bounds.left || rect.right > bounds.right);
        })
        .map((child) => child.getAttribute("data-part"));
    });
    expect(clipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Edit text", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("x".repeat(2000));
  });
}

test("auto theme, forced colors, reduced motion, and disabled controls retain accessible states", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(`${fixture}?auto`);
  expect(
    await page.locator(root).evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe("light");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  expect((await new AxeBuilder({ page }).include(root).analyze()).violations).toEqual([]);
  await page.emulateMedia({ forcedColors: "active" });
  expect(
    await page
      .locator(`${field}[aria-pressed="true"]`)
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("solid");
  await page.getByRole("button", { name: "Toggle disabled" }).click();
  const enabled = await page
    .locator(`${root} button`)
    .evaluateAll(
      (elements) => elements.filter((element) => !(element as HTMLButtonElement).disabled).length,
    );
  expect(enabled).toBe(0);
  await page.getByRole("button", { name: "Toggle disabled" }).click();
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Source text" })).toBeFocused();
});

for (const options of ["controlled", "unstyled"]) {
  test(`${options} mode shares extraction, reset, cancellation, and editing behavior`, async ({
    page,
  }) => {
    await page.goto(`${fixture}?${options}&pending`);
    await page.getByRole("textbox", { name: "Source text" }).fill("Different text");
    await page.getByRole("button", { name: "Extract", exact: true }).click();
    await page.getByRole("button", { name: "Resolve oldest" }).click();
    await expect(page.getByRole("region", { name: "Source text" })).toHaveText("Different text");
    await page.getByRole("button", { name: "Reset form", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("Alice Bob");
    await expect(page.getByRole("status")).toHaveText("Ready");
    await page.getByRole("textbox", { name: "Source text" }).press("Control+Enter");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Source text" })).toHaveValue("");
    await page.getByRole("button", { name: "Reject oldest" }).click();
    await expect(page.getByLabel("Host events")).not.toContainText("error:");
  });
}

test("a one-megabyte document and whitespace-only input remain editable without lost text", async ({
  page,
}) => {
  await page.goto(`${fixture}?mode=empty&controlled`);
  const source = largeSource();
  const editor = page.getByRole("textbox", { name: "Source text" });
  await page.getByRole("button", { name: "Load large document" }).click();
  expect(await editor.inputValue()).toBe(source);
  await editor.press("ControlOrMeta+End");
  await editor.press("a");
  expect(await editor.inputValue()).toBe(`${source}a`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("No fields found");
  expect(await page.getByRole("region", { name: "Source text" }).textContent()).toBe(`${source}a`);
  await page.getByRole("button", { name: "Edit text", exact: true }).click();
  expect(await editor.inputValue()).toBe(`${source}a`);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await editor.fill(" \n\t\u00a0");
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeDisabled();
});

test("a long host error keeps the editor and recovery actions usable", async ({ page }) => {
  await page.goto(`${fixture}?mode=error`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Source text" });
  const bounds = await editor.boundingBox();
  expect(bounds!.height).toBeGreaterThan(100);
  const alert = await page.getByRole("alert").boundingBox();
  const document = await page.locator('[data-part="document"]').boundingBox();
  expect(alert!.y + alert!.height).toBeLessThanOrEqual(document!.y + document!.height + 0.01);
  await editor.fill("Corrected source");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeEnabled();
});

test("RTL hosts keep the separator between panes and align field text with the reading direction", async ({
  page,
}) => {
  await page.goto(`${fixture}?rtl&source=${encodeURIComponent("العربية 中文")}`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  const rail = page.locator('[data-part="results"]');
  expect(await rail.evaluate((element) => getComputedStyle(element).borderInlineStartWidth)).toBe(
    "1px",
  );
  expect(
    await page
      .locator(field)
      .first()
      .evaluate((element) => getComputedStyle(element).textAlign),
  ).toBe("start");
  await page.locator(field).last().click();
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("中文");
});
