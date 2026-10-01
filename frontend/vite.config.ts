import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/** Проверяет server-only origin локального backend для Vite proxy. */
export function parseDevApiProxyTarget(value: string | undefined): string {
  const candidate = value ?? "http://localhost:8787";
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error("DEV_API_PROXY_TARGET must be an absolute HTTP(S) origin");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("DEV_API_PROXY_TARGET must be an absolute HTTP(S) origin");
  }

  return url.origin;
}

export default defineConfig(({ command, mode }) => {
  const server =
    command === "serve"
      ? (() => {
          const env = loadEnv(mode, process.cwd(), "");
          const target = parseDevApiProxyTarget(env.DEV_API_PROXY_TARGET);

          return {
            proxy: {
              "^/api(?:/|$)": { target, changeOrigin: true },
              "^/health(?:/|$)": { target, changeOrigin: true },
            },
          };
        })()
      : undefined;

  return {
    ...(mode === "chatgpt"
      ? {
          base: "./",
          build: {
            outDir: "dist-chatgpt",
            assetsInlineLimit: 10_000_000,
            rolldownOptions: { input: "chatgpt.html", output: { codeSplitting: false } },
          },
        }
      : {}),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server,
    test: {
      clearMocks: true,
      css: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
