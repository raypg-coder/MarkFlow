import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split heavy dependencies into their own chunks so the main
        // bundle is small (faster cold start). Mermaid/cytoscape are
        // only loaded when the user opens a doc containing diagrams.
        manualChunks: (id) => {
          if (id.includes("node_modules/mermaid")) return "vendor-mermaid";
          if (id.includes("node_modules/cytoscape")) return "vendor-cytoscape";
          if (id.includes("node_modules/html2canvas")) return "vendor-html2canvas";
          if (id.includes("node_modules/jspdf")) return "vendor-jspdf";
          if (id.includes("node_modules/@milkdown")) return "vendor-milkdown";
          if (id.includes("node_modules/@codemirror") || id.includes("node_modules/@lezer")) {
            return "vendor-codemirror";
          }
          if (id.includes("node_modules/react-force-graph") || id.includes("node_modules/d3")) {
            return "vendor-graph";
          }
          if (id.includes("node_modules/marked")) return "vendor-marked";
        },
      },
    },
  },
}));
