import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const tag = process.env.RELEASE_TAG;
assert.match(
  pkg.version,
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  "Use a stable package version.",
);
assert.equal(tag, `v${pkg.version}`, "The release tag must match package.json.");

const revision = (ref) =>
  execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim();
assert.equal(
  revision("HEAD"),
  revision(`refs/tags/${tag}`),
  "The tag must identify the checked-out commit.",
);
const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
assert.equal(ancestry.status, 0, "The released commit must already belong to main.");
console.log(`Release ${tag} matches package.json and belongs to main.`);
