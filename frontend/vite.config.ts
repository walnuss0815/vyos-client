/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Vite otherwise auto-injects a small inline <script> into the
    // built index.html to polyfill `<link rel="modulepreload">` for
    // browsers lacking native support - which the backend's strict
    // Content-Security-Policy (script-src 'self', no 'unsafe-inline')
    // blocks outright (see backend/internal/api/security_headers.go).
    // Every browser this app targets already supports modulepreload
    // natively, so the polyfill has no purpose here beyond tripping
    // that CSP - disabling it removes the inline script entirely
    // rather than carving out a CSP exception for it.
    modulePreload: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    // Allow importing shared/sensitive-fields.json from outside the
    // frontend package root (the monorepo's single source of truth,
    // also consumed by the Go backend).
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
