import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      // The in-app documentation module reads `../docs/*.md` and `../README.md` as
      // raw text at build time (`?raw` imports), so it renders the project's own
      // documentation instead of a second, hand-copied version of it. Both live one
      // level above this project's root, outside Vite's default allowlist.
      allow: ['..'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
} as never);
