import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const artifactRoots = [
  "openapi/openapi.json",
  "src/shared/api/generated",
  "src/shared/api/generated-zod",
] as const;

async function collectFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) return [path];

  const files = await Promise.all(
    entries.map((entry) => {
      const child = resolve(path, entry.name);
      return entry.isDirectory() ? collectFiles(child) : [child];
    }),
  );
  return files.flat();
}

async function artifactDigest(): Promise<string> {
  const root = process.cwd();
  const files = (await Promise.all(artifactRoots.map((path) => collectFiles(resolve(root, path)))))
    .flat()
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(root, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const before = await artifactDigest();
const update = spawnSync("pnpm", ["api:update"], { cwd: process.cwd(), stdio: "inherit" });
if (update.status !== 0) process.exit(update.status ?? 1);

const after = await artifactDigest();
if (before !== after) {
  throw new Error("OpenAPI artifacts were stale; updated files are left in the working tree");
}
process.stdout.write("OpenAPI snapshot and generated clients are up to date\n");
