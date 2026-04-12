import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      // Production instance API
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      // Named instance APIs: /test/api, /staging/api, etc.
      // Match /{word}/api pattern
      "^/[a-z0-9_-]+/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
