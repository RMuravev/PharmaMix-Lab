import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/app/**/*.test.ts',
      'src/application/**/*.test.ts',
      'src/domain/**/*.test.ts',
      'src/infrastructure/**/*.test.ts',
      'src/pages/**/*.test.ts',
      'src/shared/**/*.test.ts',
    ],
  },
});
