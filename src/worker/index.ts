export type WorkerBindings = {
  API: { fetch(request: Request): Promise<Response> };
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export function isApiRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function handleRequest(request: Request, bindings: WorkerBindings): Promise<Response> {
  if (isApiRequest(request)) return bindings.API.fetch(request);
  return bindings.ASSETS.fetch(request);
}

export default {
  fetch(request: Request, bindings: WorkerBindings): Promise<Response> {
    return handleRequest(request, bindings);
  },
};
