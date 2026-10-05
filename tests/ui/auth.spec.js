const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

test('la ficha exige iniciar sesión y cerrar sesión bloquea de nuevo el acceso', async ({ page }) => {
  await page.goto('/pacientes.html');
  await expect(page).toHaveURL(/login\.html/);
  await page.getByLabel('Clave de administrador').fill('pruebas-locales-no-produccion-2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestion de pacientes' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/login\.html/);
  const response = await page.request.get('/api/patients', { headers: { Cookie: '' } });
  expect(response.status()).toBe(401);
});


test('repetir clave solo aparece al configurar el acceso por primera vez', async ({ page }) => {
  await page.goto('/login.html', { waitUntil: 'networkidle' });
  await expect(page.getByLabel('Repite la clave')).toBeHidden();
  await expect(page.locator('#confirmPassword')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();

  await page.route('**/api/auth/status', (route) => route.fulfill({ json: { setup_required: true, authenticated: false } }));
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByLabel('Repite la clave')).toBeVisible();
  await expect(page.locator('#confirmPassword')).toBeVisible();
  await expect(page.locator('#confirmPassword')).toHaveAttribute('required', '');
  await expect(page.getByRole('button', { name: 'Crear clave e ingresar' })).toBeVisible();
});


test('si el servidor rechaza el cierre de sesión la pantalla permanece abierta', async ({ page }) => {
  await page.goto('/pacientes.html');
  await page.getByLabel('Clave de administrador').fill('pruebas-locales-no-produccion-2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestion de pacientes' })).toBeVisible();
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 503, json: { error: 'Temporalmente no disponible' } }));
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo cerrar la sesión');
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
  await expect(page).toHaveURL(/pacientes\.html/);
});
