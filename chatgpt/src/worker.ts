import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { PlannerFetch, SiteEnvironment } from "./planner-client.ts";
import { createServer, VERSION } from "./server.ts";

async function boundedRequest(request: Request): Promise<Request | null> {
  const limit = 65_536;
  if (Number(request.headers.get("Content-Length")) > limit) return null;
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body });
}

export function createWorker(fetchPlanner: PlannerFetch = fetch, ui = "") {
  return {
    async fetch(request: Request, env: SiteEnvironment): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(
          `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Ритм — цели и привычки</title><h1>Ритм — цели и привычки</h1><p>Версия ${VERSION}</p></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      if (url.pathname !== "/mcp") return new Response("Не найдено", { status: 404 });
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin)
        return new Response("Недопустимый источник запроса", { status: 403 });
      if (request.method === "POST") {
        const bounded = await boundedRequest(request);
        if (!bounded) return new Response("Слишком большой запрос", { status: 413 });
        request = bounded;
      }

      const server = createServer(request, env, fetchPlanner, ui);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      try {
        await server.connect(transport);
        return await transport.handleRequest(request);
      } finally {
        await server.close();
      }
    },
  };
}

export default createWorker();
