import { defineConfig } from "vite";

export default defineConfig({
  root: "docs",
  build: {
    outDir: "../docs-dist",
    emptyOutDir: true,
  },
});
