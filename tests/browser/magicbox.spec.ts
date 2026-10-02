import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { caseNote } from "../../demo/fixtures";

test("arrow keys inspect fields while keeping native text editing", async ({ page }) => {
  await page.goto("/");
  const fields = page.locator('[data-part="field"]');
  await fields.first().focus();
  await fields.first().press("ArrowDown");
  await expect(fields.nth(1)).toBeFocused();
  await expect(fields.nth(1)).toHaveAttribute("aria-pressed", "true");
  await fields.nth(1).press("End");
  await expect(fields.last()).toBeFocused();
  await fields.last().press("ArrowDown");
  await expect(fields.last()).toBeFocused();
  await fields.last().press("Home");
  await expect(fields.first()).toBeFocused();
  await page.getByRole("button", { name: "Edit text" }).click();
  const input = page.getByRole("textbox");
  await input.press("ArrowDown");
  await expect(input).toBeFocused();
});

test("original two-pane presentation, inspection, edit, keyboard shortcut, cancellation, and clear", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("6 fields");
  await expect(page.locator("textarea")).toBeHidden();
  await expect(page.getByRole("region", { name: "Source document" })).toHaveText(caseNote);
  const documentPane = await page.locator('[data-part="document"]').boundingBox();
  const rail = await page.locator('[data-part="results"]').boundingBox();
  const detail = await page.locator('[data-part="detail"]').boundingBox();
  expect(rail!.width).toBe(284);
  expect(documentPane!.height).toBeCloseTo(490, 2);
  expect(rail!.x).toBeCloseTo(documentPane!.x + documentPane!.width, 2);
  expect(rail!.y).toBeCloseTo(documentPane!.y, 2);
  expect(detail!.y + detail!.height).toBeCloseTo(rail!.y + rail!.height, 2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/magicbox-dark.png", fullPage: true });
  await page.setViewportSize({ width: 769, height: 853 });
  const narrowDocument = await page.locator('[data-part="document"]').boundingBox();
  const narrowRail = await page.locator('[data-part="results"]').boundingBox();
  expect(narrowRail!.y).toBeCloseTo(narrowDocument!.y, 2);
  expect(narrowRail!.x).toBeCloseTo(narrowDocument!.x + narrowDocument!.width, 2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Next field" }).click();
  await expect(page.locator('[data-part="detail-value"]')).toContainText("2847 Mission Street");
  await page.getByRole("button", { name: "Edit text" }).click();
  await expect(page.getByRole("textbox")).toBeFocused();
  await page.getByRole("textbox").press("Control+Enter");
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await page.getByRole("textbox").press("Escape");
  await expect(page.getByRole("status")).toHaveText("Ready");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeDisabled();
});

test("light and custom skins are accessible and independent of default CSS", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("6 fields");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/magicbox-light.png", fullPage: true });
  await page.getByRole("button", { name: "Custom skin" }).click();
  await expect(page.locator("[data-magicbox]")).not.toHaveAttribute("data-styled");
  expect(
    await page
      .locator("[data-magicbox]")
      .evaluate((element) => getComputedStyle(element).borderLeftWidth),
  ).toBe("3px");
  expect(
    await page.locator("[data-magicbox]").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('[data-part="field"]')].every(
        (field) => field.getBoundingClientRect().right <= bounds.right,
      );
    }),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/magicbox-custom.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/magicbox-custom-mobile.png", fullPage: true });
});

test("mobile layout, source fidelity, keyboard focus, and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Source document" })).toHaveText(caseNote);
  const documentPane = await page.locator('[data-part="document"]').boundingBox();
  const rail = await page.locator('[data-part="results"]').boundingBox();
  expect(rail!.y).toBeCloseTo(documentPane!.y + documentPane!.height, 2);
  expect(rail!.width).toBeCloseTo(documentPane!.width, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/magicbox-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Edit text" }).click();
  await expect(page.getByRole("textbox")).toBeFocused();
  await expect(page.getByRole("textbox")).toHaveValue(caseNote);
  await page.getByRole("textbox").press("Control+Enter");
  await expect(page.getByRole("status")).toHaveText("6 fields");
  expect(
    await page
      .locator("[data-magicbox]")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});

test("two distinct repeated mentions retain correct source selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Blank", exact: true }).click();
  await page.getByRole("textbox").fill("Annette Kowalski\nAnnette Kowalski");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("2 fields");
  await page.getByRole("button", { name: "Next field" }).click();
  await expect(
    page.getByRole("button", { name: "Person: Annette Kowalski" }).nth(1),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Person: Annette Kowalski" }).nth(0),
  ).toHaveAttribute("aria-pressed", "false");
});

test("field navigation scrolls its source without moving the host page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Blank", exact: true }).click();
  await page
    .getByRole("textbox")
    .fill(`Annette Kowalski\n\n${"The review continues.\n".repeat(70)}\nSofia Marino`);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("2 fields");
  await page.getByRole("button", { name: "Next field" }).scrollIntoViewIfNeeded();
  const top = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: "Next field" }).click();
  expect(
    await page
      .getByRole("region", { name: "Source document" })
      .evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(top);
  await expect(page.locator('[data-part="detail-value"]')).toHaveText("Sofia Marino");
});
