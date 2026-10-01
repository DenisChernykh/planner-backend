import { createServer } from "node:http";
import worker from "../dist/server/index.js";

try {
  process.loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const origin = "http://127.0.0.1:8790";
createServer(async (incoming, outgoing) => {
  try {
    if (incoming.headers.host !== "127.0.0.1:8790") {
      outgoing.writeHead(403).end("Forbidden Host");
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    // Local loopback development simulates the identity injected by private Sites.
    headers.delete("oai-authenticated-user-email");
    if (process.env.RITM_OWNER_EMAIL) {
      headers.set("oai-authenticated-user-email", process.env.RITM_OWNER_EMAIL);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 65_536) {
        outgoing.writeHead(413).end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(new URL(incoming.url, origin), {
      method: incoming.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const response = await worker.fetch(request, process.env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500).end("Запрос Ритма не выполнен");
  }
}).listen(8790, "127.0.0.1", () => console.log(`Ритм: ${origin}/mcp`));
