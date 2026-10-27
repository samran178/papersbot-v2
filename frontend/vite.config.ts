import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// In development the Django API runs on :8000 and Vite proxies to it, so the
// browser sees one origin and session + CSRF cookies work exactly as in production.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/django-admin": backend,
      "/static": backend,
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
