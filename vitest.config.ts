import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    exclude: ['server/**', 'node_modules/**', 'dist/**'],
  },
});
