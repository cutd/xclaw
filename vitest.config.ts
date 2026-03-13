import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.ts', 'channels/*/src/**/*.test.ts', 'skills/*/src/**/*.test.ts', 'extensions/*/src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
