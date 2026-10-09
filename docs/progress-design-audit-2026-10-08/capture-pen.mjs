import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Only live MCP reads. Never parse .pen or save mockup raster exports.
const [sdkRoot, sourcePath, previousReadFolder] = process.argv.slice(2);
if (!sdkRoot || !sourcePath)
  throw new Error("Usage: node capture-pen.mjs <MCP SDK root> <open Planner.pen path> [previous MCP layer JSON folder]");
const { Client } = await import(pathToFileURL(resolve(sdkRoot, "dist/esm/client/index.js")).href);
const { StdioClientTransport } = await import(
  pathToFileURL(resolve(sdkRoot, "dist/esm/client/stdio.js")).href
);
const registry = JSON.parse(
  await readFile(resolve(import.meta.dirname, "../../frontend/docs/design/progress/frames.json"), "utf8"),
);
const frames = [...registry.frames, { id: registry.componentFrame, name: "Прогресс / 00 · Компоненты" }];
const client = new Client({ name: "planner-design-acceptance", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: "/Applications/Pen.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64",
  args: ["--app", "desktop", "--agent", `plannerProgressAcceptance${process.pid}`],
  stderr: "pipe",
  cwd: resolve(dirname(sourcePath), "../../.."),
});
const call = (input) =>
  client.callTool({ name: "execute", arguments: { filePath: sourcePath, input } }, undefined, {
    timeout: 60000,
  });
const textOf = (result) => result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
const printed = (result, prefix) => JSON.parse(textOf(result).split("\n").find((line) => line.startsWith(prefix)) ?? "null");
const evidencePath = resolve(import.meta.dirname, "evidence/pen-inspection.json");
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const hashTree = (tree) => createHash("sha256").update(JSON.stringify(canonical(tree))).digest("hex");
let previous;
try { previous = JSON.parse(await readFile(evidencePath, "utf8")); } catch { /* First inspection. */ }
try {
  await client.connect(transport);
  const inspected = [];
  async function readTree(id) {
    const result = await call(`Print(Get(${JSON.stringify(id)},{depth:6,resolveInstances:true}));`);
    if (result.isError) throw new Error(textOf(result));
    const tree = printed(result, '{');
    if (!tree?.id) throw new Error(`No live node for ${id}`);
    async function expand(node) {
      if (!node || typeof node !== "object") return node;
      if (node.children === "..." || (Array.isArray(node.children) && node.children.includes("...")))
        return readTree(node.id);
      if (Array.isArray(node.children)) {
        const children = [];
        for (const child of node.children) children.push(await expand(child));
        node.children = children;
      }
      return node;
    }
    return expand(tree);
  }
  for (const frame of frames) {
    const tree = await readTree(frame.id);
    const nodes = [];
    function visit(node) {
      nodes.push(node);
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
    const treeSha256 = hashTree(tree);
    const old = previous?.frames?.find((item) => item.id === frame.id);
    const reference = previousReadFolder
      ? JSON.parse(await readFile(resolve(previousReadFolder, `${frame.id}.json`), "utf8"))
      : undefined;
    const unchanged = reference ? hashTree(reference.tree) === treeSha256 : old?.hashEncoding === "canonical-json" && old.treeSha256 === treeSha256;
    inspected.push({
      ...frame,
      width: tree.width,
      height: tree.height,
      layerCount: nodes.length,
      capturedAt: new Date().toISOString(),
      treeSha256,
      hashEncoding: "canonical-json",
      ...(old || reference ? { previousCapturedAt: old?.capturedAt, unchangedSincePreviousInspection: unchanged } : {}),
      texts: nodes.filter((node) => node.type === "text").map((node) => ({
        id: node.id, name: node.name, text: node.content, fontSize: node.fontSize,
        fontFamily: node.fontFamily, fill: node.fill,
      })),
      ...(unchanged ? { layoutProblems: reference?.layout.filter((node) => node.problem) ?? old?.layoutProblems, layoutInspectionAt: reference ? "2026-10-08T18:48:00Z" : old?.layoutInspectionAt ?? old?.capturedAt } : {}),
    });
    console.log(`${inspected.length}/${frames.length}: ${frame.id} ${frame.name}`);
  }
  const variables = printed(await call("Print(GetVariables());"), '{"variables":');
  if (!variables) throw new Error("No live semantic variables returned");
  await writeFile(evidencePath, JSON.stringify({
    source: "frontend/docs/design/Planner.pen",
    method: "Read-only live pen.dev MCP Get/GetVariables. Only IDs, layers, hashes and variables are persisted. Unchanged trees retain the earlier MCP layout observations with their own timestamp. No mockup raster export is saved or committed.",
    capturedAt: new Date().toISOString(),
    frames: inspected,
    variables,
  }, null, 2) + "\n");
} finally {
  await client.close();
}
