import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const tag = process.env.RELEASE_TAG ?? "";
assert.match(
  pkg.version,
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  "Use a stable package version.",
);
assert.match(
  tag,
  /^\d{4}\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])\.[1-9]\d*$/,
  "The release tag must use YYYY.MM.DD.<build-number>.",
);
const [year, month, day] = tag.split(".");
const date = `${year}-${month}-${day}`;
assert.equal(
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10),
  date,
  "The release tag must contain a valid date.",
);

const revision = (ref) =>
  execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim();
assert.equal(
  revision("HEAD"),
  revision(`refs/tags/${tag}`),
  "The tag must identify the checked-out commit.",
);
const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"]);
assert.equal(ancestry.status, 0, "The released commit must already belong to main.");
console.log(`Release ${tag} packages ${pkg.version} and belongs to main.`);
