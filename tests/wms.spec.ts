import { test, expect } from '@playwright/test';

test('Validar carregamento do sistema', async ({ page }) => {
  await page.goto('/');
  // Verifica se o título da página contém "WMS" ou algo que você definiu
  await expect(page).toHaveTitle(/WMS/i);
});