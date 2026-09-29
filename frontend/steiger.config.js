import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    ignores: ["./src/shared/api/generated/**", "./src/shared/api/generated-zod/**"],
  },
  {
    rules: {
      "fsd/insignificant-slice": "warn",
    },
  },
]);
