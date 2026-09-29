const { test, expect } = require('@playwright/test');

test('crear y editar procedimientos actualiza el catalogo compartido', async ({ page }, testInfo) => {
  let catalog = [{ id: 1, name: 'Limpieza', description: 'Control preventivo', default_price: 30000 }];
  let failSave = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith('/api/treatment-catalog')) {
      if (method === 'GET') return route.fulfill({ json: catalog });
      if (failSave) return route.fulfill({ status: 400, json: { error: 'No se pudo guardar el procedimiento.' } });
      const data = route.request().postDataJSON();
      const id = method === 'POST' ? 2 : Number(path.split('/').pop());
      const saved = { id, ...data };
      catalog = catalog.filter(item => item.id !== id).concat(saved);
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/procedimientos.html');
  await expect(page.getByRole('heading', { name: 'Procedimientos base' })).toBeVisible();
  await page.getByLabel('Nombre del procedimiento').fill('Restauracion');
  await page.getByLabel('Descripcion', { exact: true }).fill('Resina por pieza');
  await page.getByLabel('Precio base (CLP)').fill('45000');
  await page.getByRole('button', { name: 'Crear procedimiento', exact: true }).click();
  await expect(page.locator('#procedureStatus')).toContainText('Procedimiento creado');
  await page.reload();
  await page.locator('[data-procedure-id="2"]').getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByLabel('Precio base (CLP)')).toHaveValue('45000');
  await page.getByLabel('Nombre del procedimiento').fill('Restauracion de resina');
  await page.getByLabel('Precio base (CLP)').fill('0');
  failSave = true;
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#procedureStatus')).toContainText('No se pudo guardar');
  await expect(page.getByLabel('Nombre del procedimiento')).toHaveValue('Restauracion de resina');
  failSave = false;
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#procedureStatus')).toContainText('Procedimiento actualizado');
  await page.getByLabel('Buscar procedimiento').fill('resina');
  await expect(page.locator('.procedure-item')).toHaveCount(1);
  expect(catalog).toHaveLength(2);
  expect(catalog.find(item => item.id === 2).default_price).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath('procedimientos.png'), fullPage: true });
  await page.getByRole('link', { name: 'Tratamientos', exact: true }).click();
  await page.locator('#newTreatmentCatalog').selectOption('2');
  await expect(page.locator('#newTreatmentTitle')).toHaveValue('Restauracion de resina');
  await expect(page.locator('#newTreatmentPrice')).toHaveValue('0');
});
