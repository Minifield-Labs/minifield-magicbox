import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { caseNote } from "../../demo/fixtures";

test("schema edits apply together, preserve source, and support reset and validation", async ({
  page,
}) => {
  await page.goto("/");
  const summary = page.locator(".schema-editor summary");
  await summary.click();
  await expect(page.getByLabel("Field name 1", { exact: true })).toHaveValue("Card");
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page.getByLabel("Field name 5", { exact: true }).fill("email");
  await page
    .getByLabel("Extraction question 5", { exact: true })
    .fill("Which email should we use?");
  await page.getByRole("button", { name: "Apply schema" }).click();
  await expect(page.getByRole("alert")).toHaveText("Use a different name for each field.");
  await expect(page.getByRole("status")).toHaveText("6 fields");
  await page.getByLabel("Field name 5", { exact: true }).fill("Contact");
  await page.getByRole("button", { name: "Apply schema" }).click();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("5 fields");
  await expect(page.getByRole("status")).toHaveText("Ready");
  await expect(page.getByRole("textbox")).toHaveValue(caseNote);
  await summary.click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Field name 5", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove field 4", exact: true }).click();
  await page.getByRole("button", { name: "Remove field 2", exact: true }).click();
  await page.getByRole("button", { name: "Remove field 1", exact: true }).click();
  await expect(page.getByLabel("Field name 1", { exact: true })).toHaveValue("Email");
  await expect(page.getByRole("button", { name: "Remove field 1", exact: true })).toBeDisabled();
  await page.getByLabel("Extraction question 1", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Apply schema" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a name and question for each field.");
  await page
    .getByLabel("Extraction question 1", { exact: true })
    .fill("What is the email address?");
  await page.getByRole("button", { name: "Apply schema" }).click();
  await expect(summary).toContainText("1 field");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("1 field");
  await expect(page.locator('[data-part="field-kind"]')).toHaveText("Email");
  await expect(page.getByRole("region", { name: "Source document" })).toHaveText(caseNote);
  await summary.click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Apply schema" }).click();
  await expect(summary).toContainText("4 fields");
  await expect(page.getByRole("status")).toHaveText("Ready");
  await summary.click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/schema-editor-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/schema-editor-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
