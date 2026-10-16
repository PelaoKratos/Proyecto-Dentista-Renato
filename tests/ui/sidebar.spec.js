const { test, expect } = require('@playwright/test');

test('la navegacion deja espacio a pagos y se expande sin mover el contenido', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/pagos.html', { waitUntil: 'networkidle' });
  await page.mouse.move(600, 300);

  const sidebar = page.locator('.sidebar');
  const width = () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  const mainLeft = () => page.locator('.main-content').evaluate((element) => Math.round(element.getBoundingClientRect().left));

  await expect.poll(width).toBe(72);
  expect(await mainLeft()).toBe(72);
  await page.screenshot({ path: testInfo.outputPath('sidebar-cerrado.png') });
  await sidebar.hover();
  await expect.poll(width).toBe(256);
  expect(await mainLeft()).toBe(72);
  await page.screenshot({ path: testInfo.outputPath('sidebar-abierto.png') });
  await page.mouse.move(600, 300);
  await expect.poll(width).toBe(72);

  await page.getByRole('link', { name: 'Pacientes' }).focus();
  await expect.poll(width).toBe(256);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});
