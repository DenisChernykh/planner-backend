import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("src");
const violations = [];
// The schema is shared mechanically; mutations still belong to each capability.
const tableOwners = {
  users: "identity-access",
  externalIdentities: "identity-access",
  external_identities: "identity-access",
  sessions: "identity-access",
  chatgptConnections: "identity-access",
  chatgpt_connections: "identity-access",
  notes: "notes",
  planGoals: "planning",
  plan_goals: "planning",
  planMonthRollovers: "planning",
  plan_month_rollovers: "planning",
  goalEntries: "planning",
  goal_entries: "planning",
  planningEntryCommands: "planning",
  planning_entry_commands: "planning",
  progressSettings: "progress",
  progress_settings: "progress",
  reminderSettings: "reminders",
  reminder_settings: "reminders",
  goalReminders: "reminders",
  goal_reminders: "reminders",
  telegramLinks: "reminders",
  telegram_links: "reminders",
  telegramLinkTokens: "reminders",
  telegram_link_tokens: "reminders",
  reminderJobs: "reminders",
  reminder_jobs: "reminders",
  progressReportSettings: "reminders",
  progress_report_settings: "reminders",
  goalProgressReports: "reminders",
  goal_progress_reports: "reminders",
};

function canWriteTable(file, table, owner, ownModule) {
  if (owner === ownModule) return true;
  // Existing report configuration atomically saves the shared start date.
  // Keep this one adapter exception explicit, rather than allowing any writer.
  return (
    table === "progress_settings" &&
    path.relative(sourceRoot, file).split(path.sep).join("/") ===
      "modules/reminders/infrastructure/d1-progress-report-repository.ts"
  );
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory()
        ? collectTypeScriptFiles(absolute)
        : Promise.resolve(entry.name.endsWith(".ts") ? [absolute] : []);
    }),
  );
  return nested.flat();
}

function moduleName(file) {
  const relative = path.relative(sourceRoot, file).split(path.sep);
  return relative[0] === "modules" ? relative[1] : undefined;
}

function resolveRelativeImport(file, specifier) {
  const resolved = path.resolve(path.dirname(file), specifier);
  if (path.extname(resolved)) return resolved;
  if (existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
  return path.join(resolved, "index.ts");
}

function report(file, message) {
  violations.push(`${path.relative(process.cwd(), file)}: ${message}`);
}

for (const file of await collectTypeScriptFiles(sourceRoot)) {
  if (file.endsWith("worker-configuration.d.ts")) continue;
  const source = await readFile(file, "utf8");
  const ownModule = moduleName(file);
  const relativeFromModule = ownModule
    ? path.relative(path.join(sourceRoot, "modules", ownModule), file).split(path.sep)
    : [];
  const ownLayer = relativeFromModule[0];

  const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/gu);
  for (const match of imports) {
    const specifier = match[1];
    if (!specifier) continue;

    if (ownLayer === "application") {
      if (
        ["hono", "@hono/", "drizzle-orm", "grammy", "jose", "wrangler", "cloudflare:"].some(
          (dependency) => specifier === dependency || specifier.startsWith(dependency),
        ) ||
        specifier.includes("/presentation/") ||
        specifier.includes("/infrastructure/")
      ) {
        report(file, `application must not import ${specifier}`);
      }
    }

    // Domain imports stay inside its own domain (or shared domain primitives).
    // Luxon is a pure calendar calculation dependency, not a runtime adapter.
    if (ownLayer === "domain" && !specifier.startsWith(".") && specifier !== "luxon") {
      report(file, `domain must not import runtime or application dependency (${specifier})`);
    }

    if (ownLayer === "presentation" && specifier.includes("/infrastructure/")) {
      report(file, `presentation must not import infrastructure (${specifier})`);
    }

    if (!specifier.startsWith(".")) continue;
    const importedFile = resolveRelativeImport(file, specifier);
    const importedModule = moduleName(importedFile);
    if (ownLayer === "domain") {
      const ownDomain = path.join(sourceRoot, "modules", ownModule, "domain") + path.sep;
      const sharedDomain = path.join(sourceRoot, "shared", "domain") + path.sep;
      if (!importedFile.startsWith(ownDomain) && !importedFile.startsWith(sharedDomain)) {
        report(
          file,
          `domain must not depend on outer layers or other module wiring (${specifier})`,
        );
      }
    }
    if (ownModule && importedModule && ownModule !== importedModule) {
      const importedRelative = path
        .relative(path.join(sourceRoot, "modules", importedModule), importedFile)
        .split(path.sep)
        .join("/");
      if (importedRelative !== "index.ts" && importedRelative !== "public-contracts.ts") {
        report(file, `cross-module import must use index.ts or public-contracts.ts (${specifier})`);
      }
      if (ownLayer === "application" && importedRelative === "index.ts") {
        report(
          file,
          `application must use public-contracts.ts without module wiring (${specifier})`,
        );
      }
    }

    const sourceArea = path.relative(sourceRoot, file).split(path.sep)[0];
    const importedArea = path.relative(sourceRoot, importedFile).split(path.sep)[0];
    if (sourceArea === "platform" && importedArea === "modules") {
      report(file, `platform must not import a product module (${specifier})`);
    }
    if (sourceArea === "app" && importedArea === "modules") {
      const importedRelative = path.relative(path.join(sourceRoot, "modules"), importedFile);
      const depth = importedRelative.split(path.sep);
      if (depth.length > 2 || !["index.ts", "public-contracts.ts"].includes(depth[1])) {
        report(file, `app must use a module root or public contract (${specifier})`);
      }
    }
  }

  // Include SQL literals and Drizzle identifiers: import paths alone cannot detect
  // a module deleting another module's command receipts.
  const mutations = [
    ...source.matchAll(
      /\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?([a-z_]+)\b/giu,
    ),
    ...source.matchAll(/\.(?:insert|update|delete)\s*\(\s*(\w+)\b/gu),
  ];
  for (const [, table] of mutations) {
    const owner = tableOwners[table];
    if (ownModule && owner && !canWriteTable(file, table, owner, ownModule)) {
      report(file, `${table} belongs to ${owner}; use its public operation`);
    }
  }
}

if (violations.length > 0) {
  console.error(`Module boundary violations:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Module boundaries are valid.");
}
