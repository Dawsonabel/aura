import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';

// Deliberately separate from vite.config.ts — the Start/Cloudflare plugins there do route-tree
// generation and Workers-specific environment setup that a component/unit test run doesn't need
// and would just add friction to.
export default defineConfig({
  plugins: [viteReact()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts']
  }
});
