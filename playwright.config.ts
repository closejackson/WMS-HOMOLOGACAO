import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* Tempo máximo de cada teste (30 segundos) */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  /* Roda em paralelo para ganhar tempo */
  fullyParallel: true,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    /* Sessão do André (Google/Microsoft) */
    storageState: 'playwright/.auth/user.json', 
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Sobe o seu WMS automaticamente */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // Dá 2 minutos para o Vite acordar
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});