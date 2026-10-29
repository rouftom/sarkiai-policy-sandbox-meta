import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import tailwindcss from "@tailwindcss/vite";

const INPUT = process.env.INPUT || "src/mcp-app.html";

export default defineConfig({
  plugins: [react(), viteSingleFile(), tailwindcss()],
  define: {
    "process.env.SERVERS": process.env.SERVERS || "[]",
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: INPUT,
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
