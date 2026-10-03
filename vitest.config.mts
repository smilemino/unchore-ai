import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30_000,
    env: { UNCHORE_SECRET_KEY: "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy0wMTIzNDU2Nzg=" } },
});
