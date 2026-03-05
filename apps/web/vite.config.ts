import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const useEmbeddedFrontend = process.env.BOOKLITE_FRONTEND_EMBEDDED === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 4173,
    proxy: useEmbeddedFrontend
      ? undefined
      : {
          "/api": {
            target: "http://localhost:6060",
            changeOrigin: true
          }
        }
  }
});
