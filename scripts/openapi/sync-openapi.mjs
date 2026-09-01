import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredOperations = [
  ["/health", "get"],
  ["/api/auth/telegram/start", "get"],
  ["/api/auth/telegram/callback", "get"],
  ["/api/auth/me", "get"],
  ["/api/auth/logout", "post"],
  ["/api/notes", "get"],
  ["/api/notes", "post"],
  ["/api/notes/{noteId}", "get"],
  ["/api/notes/{noteId}", "patch"],
  ["/api/notes/{noteId}", "delete"],
];

export function validateOpenApiDocument(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.openapi !== "string" ||
    !value.openapi.startsWith("3.") ||
    value.paths === null ||
    typeof value.paths !== "object" ||
    Array.isArray(value.paths)
  ) {
    throw new Error("Expected a non-empty OpenAPI 3 JSON document");
  }

  for (const [path, method] of requiredOperations) {
    if (value.paths[path]?.[method] === undefined) {
      throw new Error(`OpenAPI document is missing ${method.toUpperCase()} ${path}`);
    }
  }

  return value;
}

export function normalizeForOrval(value) {
  if (Array.isArray(value)) return value.map(normalizeForOrval);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "pattern" && entry === "^\\/" ? "^/" : normalizeForOrval(entry),
    ]),
  );
}

export async function readOpenApiSource(source) {
  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`OpenAPI download failed with HTTP ${response.status}`);
    return response.text();
  }

  const path = source.startsWith("file:") ? fileURLToPath(source) : resolve(process.cwd(), source);
  return readFile(path, "utf8");
}

export async function syncOpenApi({ source, destination }) {
  const raw = await readOpenApiSource(source);
  if (raw.trim() === "") throw new Error("OpenAPI source is empty");

  const parsed = validateOpenApiDocument(JSON.parse(raw));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(normalizeForOrval(parsed), null, 2)}\n`);
}

async function main() {
  const source = process.env.OPENAPI_SPEC_SOURCE ?? "http://localhost:8787/openapi.json";
  const destination = resolve(process.cwd(), "openapi/openapi.json");
  await syncOpenApi({ source, destination });
  process.stdout.write(`OpenAPI snapshot updated from ${source}\n`);
}

if (process.argv[1] !== undefined) {
  const invokedUrl = pathToFileURL(resolve(process.argv[1])).href;
  if (import.meta.url === invokedUrl) await main();
}
