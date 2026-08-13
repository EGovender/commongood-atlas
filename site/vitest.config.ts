/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Reuses Astro's own Vite config (aliases, plugins) so tests resolve
// imports exactly like the app does -- no separate module-resolution setup.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
