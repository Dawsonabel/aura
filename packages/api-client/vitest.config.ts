import { defineConfig } from 'vitest/config';

/* jsdom because these are React hook tests (renderHook mounts a real component tree). What's NOT
   here: per-hook "calls fetch with the right query string" tests — those mirror the hook's own
   source and break only when both sides are edited together. The suite covers hooks that own real
   logic, useAuraRound's state machine first among them; the wire contract itself is covered
   black-box by apps/api's suite. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts']
  }
});
