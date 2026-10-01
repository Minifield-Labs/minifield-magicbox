// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/check-release.mjs", import.meta.url));
let directory: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
const check = (tag: string) =>
  spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, RELEASE_TAG: tag },
  });

beforeEach(() => {
  const root = join(process.cwd(), ".local");
  mkdirSync(root, { recursive: true });
  directory = mkdtempSync(join(root, "release-test-"));
  git("init", "--initial-branch=main");
  git("config", "user.name", "MagicBox CI");
  git("config", "user.email", "ci@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  writeFileSync(join(directory, "package.json"), JSON.stringify({ version: "0.1.0" }));
  git("add", "package.json");
  git("commit", "-m", "test: create release fixture");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("tag", "-a", "v0.1.0", "-m", "Release fixture");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("accepts an annotated release tag matching a version committed to main", () => {
  const result = check("v0.1.0");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Release v0.1.0 matches package.json and belongs to main.");
});

it.each(["v0.2.0", "0.1.0", "", "v0.1.0; echo unsafe"])(
  "rejects the mismatched release tag %j before passing it to git",
  (tag) => {
    const result = check(tag);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("The release tag must match package.json.");
  },
);

it("rejects a version from an unmerged feature branch", () => {
  git("checkout", "-b", "feature");
  git("commit", "--allow-empty", "-m", "test: simulate unmerged release");
  git("tag", "-f", "v0.1.0");
  const result = check("v0.1.0");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("The released commit must already belong to main.");
});

it("rejects a tag that points to a different commit", () => {
  git("commit", "--allow-empty", "-m", "test: advance release checkout");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const result = check("v0.1.0");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("The tag must identify the checked-out commit.");
});

it("rejects prerelease versions in the stable publishing workflow", () => {
  writeFileSync(join(directory, "package.json"), JSON.stringify({ version: "0.1.0-beta.1" }));
  const result = check("v0.1.0-beta.1");
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Use a stable package version.");
});
