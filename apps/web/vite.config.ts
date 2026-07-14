import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export function normalizeBasePath(configuredBasePath: string | undefined): string {
  const pathWithoutOuterSlashes = configuredBasePath?.trim().replace(/^\/+|\/+$/g, "");
  return pathWithoutOuterSlashes ? `/${pathWithoutOuterSlashes}/` : "/";
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "VITE_");

  return {
    base: normalizeBasePath(environment.VITE_BASE_PATH),
    plugins: [react()],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
