import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config — proxies /api to local FastAPI backend in dev
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
