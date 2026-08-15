import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // SPA mode — no public SEO surface, everything meaningful is behind Clerk auth
    tanstackStart({ spa: { enabled: true } }),
    tailwindcss(),
    // react's plugin must come after start's, per TanStack Start's own setup docs
    viteReact()
  ]
});
