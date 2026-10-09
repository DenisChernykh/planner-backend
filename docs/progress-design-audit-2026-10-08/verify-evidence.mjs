// Verify traceability and retained evidence, without contacting Pen or production.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const audit = dirname(fileURLToPath(import.meta.url));
const root = resolve(audit, "../..");
const read = (name) => JSON.parse(readFileSync(resolve(audit, name), "utf8"));
const matrix = read("requirements.json");
const registry = JSON.parse(readFileSync(resolve(root, "frontend/docs/design/progress/frames.json"), "utf8"));
const pen = read("evidence/pen-inspection.json");
const revision = matrix.sourceCommit;
const inside = (path) => {
  const full = resolve(root, path);
  assert(!relative(root, full).startsWith(".."), `Path outside repository: ${path}`);
  assert(existsSync(full), `Missing path: ${path}`);
  return full;
};
execFileSync("git", ["merge-base", "--is-ancestor", revision, "HEAD"], { cwd: root });
execFileSync("git", ["merge-base", "--is-ancestor", "1bc9399", "a687a2c"], { cwd: root });
const currentCode = execFileSync("git", ["diff", "--name-only", revision, "--", "frontend/src", "backend/src", "backend/test", "chatgpt", "backend/migrations", "pnpm-lock.yaml"], { cwd: root, encoding: "utf8" });
assert.equal(currentCode.trim(), "", "Evidence does not describe the current implementation");

const unique = (rows, expected, label) => {
  assert.equal(rows.length, expected, label);
  assert.equal(new Set(rows.map((row) => row.id)).size, expected, `Duplicate ${label}`);
};
unique(matrix.requirements, 216, "requirements");
unique(matrix.acceptanceCriteria, 18, "acceptance criteria");
unique(registry.frames, 54, "catalog frames");
unique(pen.frames, 55, "live Pen frames");
assert.equal(pen.source, "frontend/docs/design/Planner.pen");
assert.equal(Object.keys(pen.variables.variables).length, 51, "Pen variables");
for (const frame of [...registry.frames, { id: registry.componentFrame }]) {
  const observed = pen.frames.find((item) => item.id === frame.id);
  assert(observed, `Frame not read through MCP: ${frame.id}`);
  assert(observed.layerCount > 0 && /^[a-f0-9]{64}$/u.test(observed.treeSha256));
  assert.equal(observed.hashEncoding, "canonical-json");
  assert.equal(observed.unchangedSincePreviousInspection, true);
}

const proof = new Set(["D01", "D02"]);
for (const [file, expected, key] of [
  ["acceptance-tests.json", 105, "tests"],
  ["acceptance-integration.json", 23, "tests"],
  ["acceptance-calculations.json", 39, "cases"],
  ["acceptance-browser.json", 28, "cases"],
]) {
  const data = read(`evidence/${file}`);
  assert.equal(data.sourceCommit, revision, `Stale ${file}`);
  unique(data[key], expected, file);
  assert.deepEqual(data.totals, { passed: expected, failed: 0 });
  for (const item of data[key]) {
    assert(!proof.has(item.id), `Duplicate proof ${item.id}`);
    proof.add(item.id);
    assert(["pass", "passed"].includes(item.status), `Failed ${item.id}`);
    if (key === "cases") assert.deepEqual(item.actual, item.expected, item.id);
    else {
      const path = inside(item.path);
      const lines = readFileSync(path, "utf8").split("\n");
      assert(item.line > 0 && item.line <= lines.length, `Invalid line for ${item.id}`);
      assert(lines[item.line - 1].includes(item.sourceTitle ?? item.title), `Wrong test anchor for ${item.id}`);
      const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
      assert.equal(hash, item.sourceSha256, `Changed test source for ${item.id}`);
    }
  }
  if (file === "acceptance-browser.json") {
    assert.deepEqual(data.pageErrors, []);
    assert.deepEqual(data.unhandled, []);
  }
}
const gates = read("evidence/acceptance-gates.json");
assert.equal(gates.sourceCommit, revision);
for (const gate of gates.checks) {
  assert.equal(gate.exitCode, 0, gate.id);
  proof.add(gate.id);
}
assert.deepEqual(gates.checks[0].frontend, { files: 37, tests: 132 });
assert.deepEqual(gates.checks[0].backend, { files: 16, tests: 227 });
assert.equal(gates.checks[0].chatgpt.tests, 16);

const ids = new Set(matrix.requirements.map((row) => row.id));
const refs = (values, allowed, label) => {
  for (const value of values ?? []) assert(allowed.has(value), `Unknown ${label}: ${value}`);
};
const codeIds = new Set(Object.keys(matrix.codeReferences));
for (const [id, code] of Object.entries(matrix.codeReferences)) {
  const lines = readFileSync(inside(code.path), "utf8").split("\n");
  assert(code.line > 0 && code.line <= lines.length, `Invalid code anchor ${id}`);
}
const open = new Set(["R1.02", "R1.03", "R2.03", "R2.04", "R8.29", "R10.01", "R10.02"]);
const counts = {};
for (const row of matrix.requirements) {
  counts[row.status] = (counts[row.status] ?? 0) + 1;
  assert(row.requirement && row.implementation && row.verification, `Incomplete ${row.id}`);
  assert(row.codeRefs.length, `No implementation for ${row.id}`);
  refs(row.codeRefs, codeIds, "code");
  const checks = ["testRefs", "calculationRefs", "integrationRefs", "browserRefs", "designRefs", "gateRefs"].flatMap((key) => row[key] ?? []);
  refs(checks, proof, "proof");
  if (row.status === "verified") {
    assert(checks.length, `No retained proof for ${row.id}`);
    assert.deepEqual(row.remainingRefs, []);
    assert(!open.has(row.id));
  } else {
    assert(open.has(row.id), `Unexpected remaining item ${row.id}`);
    assert(row.remaining && row.remainingRefs.length);
    refs(row.remainingRefs, new Set(["V13", "V14"]), "external step");
  }
  inside(row.source.path);
  if (row.id.startsWith("M")) {
    assert.equal(row.source.path, "frontend/docs/design/Planner.pen");
    assert(row.source.frameIds.length, `Missing source frame for ${row.id}`);
    refs(row.source.frameIds, new Set(registry.frames.map((item) => item.id)), "Pen frame");
  }
}
assert.deepEqual(counts, matrix.statusCounts);
assert.deepEqual(counts, { verified: 209, partial: 6, unverified: 1 });
for (const criterion of matrix.acceptanceCriteria) {
  assert.equal(criterion.status, "verified");
  assert(criterion.level.includes("local"), "External acceptance incorrectly claimed");
  refs(criterion.requirementRefs, ids, "requirement");
  refs(criterion.checkRefs, proof, "criterion proof");
}

const captures = read("evidence/design-captures.json");
assert.equal(captures.sourceCommit, revision);
assert.equal(captures.captures.length, 94);
assert.equal(new Set(captures.captures.map((item) => item.file)).size, 94);
const capturedFrames = new Set();
for (const capture of captures.captures) {
  refs([capture.penFrame], new Set(registry.frames.map((item) => item.id)), "capture frame");
  capturedFrames.add(capture.penFrame);
  assert(capture.state && capture.overflow, `Invalid capture ${capture.file}`);
  assert([320, 390, 1440].includes(capture.viewport.width));
  const image = readFileSync(resolve(audit, "evidence/final", capture.file));
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.deepEqual({ width: image.readUInt32BE(16), height: image.readUInt32BE(20) }, capture.dimensions, capture.file);
}
assert.equal(capturedFrames.size, 53);
for (const frame of matrix.frames) {
  if (frame.id === "RHvwO") continue;
  assert(capturedFrames.has(frame.id), `No app state for ${frame.id}`);
  assert(frame.renderedEvidence.length);
}
const closed = read("evidence/closed-items.json");
assert.equal(closed.sourceCommit, revision);
unique(closed.items, 29, "closed items");
for (const item of closed.items) {
  assert.equal(item.status, "closed-local");
  refs(item.codeRefs, codeIds, "closed code");
  refs(item.checkRefs, proof, "closed proof");
}

// Check local links, explicit row anchors and code line targets in current reports.
for (const path of [
  "design-qa.md", "docs/progress-and-telegram-reports.md", "frontend/docs/design/progress/README.md",
  ...["README", "requirements", "checks", "coverage", "remaining"].map((name) => `docs/progress-design-audit-2026-10-08/${name}.md`),
]) {
  const full = inside(path);
  const text = readFileSync(full, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const link = match[1];
    if (/^(?:https?:|mailto:|#)/u.test(link)) continue;
    const [target, anchor] = link.split("#");
    const linked = resolve(dirname(full), target);
    assert(existsSync(linked), `Broken link ${path}: ${link}`);
    if (/^L\d+$/u.test(anchor ?? "")) {
      assert(Number(anchor.slice(1)) <= readFileSync(linked, "utf8").split("\n").length, `Invalid line ${link}`);
    } else if (/^[crtpabdgvmfq]\d/u.test(anchor ?? "")) {
      assert(readFileSync(linked, "utf8").includes(`id="${anchor}"`), `Broken anchor ${path}: ${link}`);
    }
  }
}
assert(readFileSync(resolve(root, "design-qa.md"), "utf8").includes("final result: passed"));
const sourcePngs = execFileSync("git", ["ls-files", "frontend/docs/design/progress/*.png", "frontend/docs/design/progress/**/*.png"], { cwd: root, encoding: "utf8" });
assert.equal(sourcePngs.trim(), "", "Mockup PNG exports must not be tracked");
console.log(JSON.stringify({ revision, requirements: 216, criteria: 18, penFrames: 55, appCaptures: 94, checks: proof.size, status: "passed", remaining: ["RELEASE", "V13", "V14"] }));
