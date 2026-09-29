const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

test('la ficha exige iniciar sesión y cerrar sesión bloquea de nuevo el acceso', async ({ page }) => {
  await page.goto('/pacientes.html');
  await expect(page).toHaveURL(/login\.html/);
  await page.getByLabel('Clave de administrador').fill('pruebas-locales-no-produccion-2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestion de pacientes' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesion' }).click();
  await expect(page).toHaveURL(/login\.html/);
  const response = await page.request.get('/api/patients', { headers: { Cookie: '' } });
  expect(response.status()).toBe(401);
});
