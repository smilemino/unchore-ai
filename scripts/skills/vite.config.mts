import { defineConfig } from "vitest/config";
import path from "node:path";

const here = import.meta.dirname;
const root = path.resolve(here, "../..");
export default defineConfig({
  root,
  publicDir: false,
  logLevel: "warn",
  resolve: { alias: [
    { find: "@/lib/i18n-server", replacement: path.join(here, "i18n-server-shim.ts") },
    { find: /^@\//, replacement: root + "/" },
  ] },
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: path.join(here, "runner.ts"),
    outDir: path.join(root, "skills/unchore-recipes/scripts"),
    emptyOutDir: true, minify: false, target: "node22",
    rollupOptions: { output: { entryFileNames: "run.mjs", format: "es" } },
  },
});
