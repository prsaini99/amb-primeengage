import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/quiz/**/*.test.ts"],
    environment: "node",
  },
});
