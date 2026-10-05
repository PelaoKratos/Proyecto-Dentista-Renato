const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

test('la exportacion CSV conserva los datos como texto seguro', async ({ page }) => {
  await page.route('**/api/patients', route => route.fulfill({
    json: [{
      id: 1, first_name: '=1+1', last_name: 'Paciente', rut: '12345678-9',
      phone: '+56 9 1234 5678', email: 'test@example.com', active_alert: '@alerta'
    }]
  }));
  await page.route('**/api/appointments', route => route.fulfill({ json: [] }));
  await page.route('**/api/patient-treatments', route => route.fulfill({ json: [] }));

  await page.goto('/pacientes.html');
  await expect(page.locator('#patientsTable')).toContainText('=1+1 Paciente');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;
  const csv = readFileSync(await download.path(), 'utf8');

  expect(csv).toContain('"' + "'=1+1 Paciente" + '"');
  expect(csv).toContain('"' + "'+56 9 1234 5678" + '"');
  expect(csv).toContain('"' + "'@alerta" + '"');
});
