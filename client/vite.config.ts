import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:4000";
const testProxyTarget = process.env.VITE_ENABLE_TEST_AUTH === "true" ? "http://127.0.0.1:4100" : "";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    proxy: {
      ...(testProxyTarget
        ? {
            "/api/test": testProxyTarget,
          }
        : {}),
      "/api": devProxyTarget,
    },
  },
  preview: {
    host: true,
  },
})
