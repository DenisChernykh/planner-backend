import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requiredOperations = [
  ["/health", "get"],
  ["/api/reminders/settings", "get"],
  ["/api/reminders/settings", "put"],
  ["/api/reminders/goals/{month}", "get"],
  ["/api/reminders/goals/{goalId}", "put"],
  ["/api/reminders/telegram/connect", "post"],
  ["/api/reminders/telegram", "delete"],
  ["/api/auth/telegram/start", "get"],
  ["/api/auth/telegram/callback", "get"],
  ["/api/auth/me", "get"],
  ["/api/auth/logout", "post"],
  ["/api/notes", "get"],
  ["/api/notes", "post"],
  ["/api/notes/{noteId}", "get"],
  ["/api/notes/{noteId}", "patch"],
  ["/api/notes/{noteId}", "delete"],
  ["/api/plans/{month}", "get"],
  ["/api/plans/{month}/trash", "get"],
  ["/api/plans/{month}/goals", "post"],
  ["/api/plans/{month}/goals/order", "put"],
  ["/api/goals/{goalId}", "patch"],
  ["/api/goals/{goalId}", "delete"],
  ["/api/goals/{goalId}/restore", "post"],
  ["/api/goals/{goalId}/entries/{date}", "put"],
  ["/api/goals/{goalId}/entries/{date}", "delete"],
] as const;

type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

export function validateOpenApiDocument(value: unknown): OpenApiDocument {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("openapi" in value) ||
    typeof value.openapi !== "string" ||
    !value.openapi.startsWith("3.") ||
    !("paths" in value) ||
    value.paths === null ||
    typeof value.paths !== "object" ||
    Array.isArray(value.paths)
  ) {
    throw new Error("Expected a non-empty OpenAPI 3 JSON document");
  }

  const document = value as OpenApiDocument;
  for (const [path, method] of requiredOperations) {
    if (document.paths[path]?.[method] === undefined) {
      throw new Error(`OpenAPI document is missing ${method.toUpperCase()} ${path}`);
    }
  }

  return document;
}

export function normalizeForOrval(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForOrval);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === "pattern" && typeof entry === "string") {
        if (entry === "^\\/") return [key, "^/"];
        if (entry.endsWith("/u")) return [key, entry.slice(0, -2)];
      }
      return [key, normalizeForOrval(entry)];
    }),
  );
}

export async function readBackendOpenApi(): Promise<OpenApiDocument> {
  const backendModulePath: string = "../../../backend/src/app/create-app.ts";
  const backend = (await import(backendModulePath)) as {
    createApp: () => { request: (url: string) => Promise<Response> };
  };
  const { createApp } = backend;
  const response = await createApp().request("http://openapi.local/openapi.json");
  if (!response.ok) throw new Error(`Backend OpenAPI request failed with HTTP ${response.status}`);
  return validateOpenApiDocument(await response.json());
}

export async function syncOpenApi(destination: string): Promise<void> {
  const document = await readBackendOpenApi();
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(normalizeForOrval(document), null, 2)}\n`);
}

async function main() {
  const destination = resolve(process.cwd(), "openapi/openapi.json");
  await syncOpenApi(destination);
  process.stdout.write("OpenAPI snapshot updated from ../backend createApp()\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
