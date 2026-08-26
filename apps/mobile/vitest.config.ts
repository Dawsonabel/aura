import { defineConfig } from 'vitest/config';

/* Node environment, no jsdom, no React Native: this suite only covers the pure functions in
   src/lib (auraTab, phone). Screen/component behavior is verified in the simulator — RN component
   testing would drag in jest-expo and a mock of the native layer for little confidence in return.
   If a lib module ever imports react-native, it doesn't belong in this suite. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts']
  }
});
