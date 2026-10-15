import { test, expect } from '@playwright/test';
test('application serves its main page', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#root')).toBeAttached();
});
