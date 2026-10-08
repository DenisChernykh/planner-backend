import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("./check-module-boundaries.mjs", import.meta.url));

async function checkFixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "planner-boundaries-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const absolute = path.join(root, "src", relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content);
    }
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("application accepts a public contract and rejects the module's executable wiring", async () => {
  const files = {
    "modules/planning/public-contracts.ts": "export class PlanningError extends Error {}",
    "modules/planning/index.ts": 'export { PlanningError } from "./public-contracts";',
    "modules/reminders/application/answer.ts":
      'import { PlanningError } from "../../planning/public-contracts";',
  };
  assert.equal((await checkFixture(files)).status, 0);
  files["modules/reminders/application/answer.ts"] =
    'import { PlanningError } from "../../planning";';
  const invalid = await checkFixture(files);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /application must use public-contracts/);
});

test("SQL and Drizzle mutations cannot delete another module's command receipts", async () => {
  for (const content of [
    'db.prepare("DELETE FROM planning_entry_commands WHERE created_at < ?")',
    "db.delete(planningEntryCommands)",
  ]) {
    const invalid = await checkFixture({
      "modules/reminders/infrastructure/repository.ts": content,
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /belongs to planning/);
    assert.equal(
      (await checkFixture({ "modules/planning/infrastructure/repository.ts": content })).status,
      0,
    );
  }
});

test("read joins are allowed but foreign goal mutations are rejected", async () => {
  const file = "modules/reminders/infrastructure/repository.ts";
  assert.equal(
    (await checkFixture({ [file]: 'db.prepare("SELECT id FROM plan_goals")' })).status,
    0,
  );
  const invalid = await checkFixture({ [file]: 'db.prepare("UPDATE plan_goals SET title = ?")' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /plan_goals belongs to planning/);
});
