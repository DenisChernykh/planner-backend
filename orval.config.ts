import { defineConfig } from "orval";

const openApiSnapshot = "./openapi/openapi.json";

export default defineConfig({
  api: {
    input: { target: openApiSnapshot },
    output: {
      target: "./src/shared/api/generated/index.ts",
      schemas: "./src/shared/api/generated/model",
      operationSchemas: "./src/shared/api/generated/operation",
      client: "react-query",
      httpClient: "axios",
      mode: "tags-split",
      clean: true,
      urlEncodeParameters: true,
      override: {
        mutator: {
          path: "./src/shared/api/client/orval-mutator.ts",
          name: "apiMutator",
        },
        useNamedParameters: true,
        useTypeOverInterfaces: true,
        enumGenerationType: "union",
        query: { version: 5, signal: true },
      },
    },
  },
  apiZod: {
    input: { target: openApiSnapshot },
    output: {
      target: "./src/shared/api/generated-zod/index.ts",
      client: "zod",
      mode: "tags-split",
      fileExtension: ".zod.ts",
      clean: true,
      override: {
        zod: {
          version: 4,
          strict: {
            response: true,
            body: true,
            query: true,
            param: true,
            header: true,
          },
          generate: {
            response: true,
            body: true,
            query: true,
            param: true,
            header: true,
          },
          generateEachHttpStatus: true,
        },
      },
    },
  },
});
