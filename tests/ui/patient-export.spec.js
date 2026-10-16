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

test('selector de ficha muestra inicio y permite recorrer muchos tratamientos', async ({ page }, testInfo) => {
  const treatments = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    patient_id: 1,
    title: `Tratamiento ${index + 1}`,
    tooth_code: String(index + 1),
    status: 'planned',
    start_date: index === 0 ? null : `2026-10-${String(index + 1).padStart(2, '0')}`,
    final_price: 10000
  }));
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba', dentition_type: 'adult' },
    treatments, appointments: [], payments: [], sessions: [], attachments: []
  };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/patients/1/summary' ? summary : [] });
  });
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto('/paciente.html?id=1');
  await page.locator('#exportClinicalBtn').click();
  const dialog = page.locator('#clinicalExportDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('label').nth(0)).toContainText('Inicio: Sin fecha registrada');
  await expect(dialog.locator('label').nth(1)).toContainText('Inicio: 02/10/2026');
  const list = dialog.locator('.clinical-export-list');
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(dialog.locator('#confirmClinicalExport')).toBeVisible();
  const last = list.locator('label').last();
  await last.scrollIntoViewIfNeeded();
  await last.locator('input').uncheck();
  await expect(dialog.locator('#clinicalExportCount')).toContainText('11 de 12');
  await dialog.getByRole('button', { name: 'Seleccionar todos' }).click();
  await expect(dialog.locator('#clinicalExportCount')).toContainText('12 de 12');
  await page.screenshot({ path: testInfo.outputPath('exportar-muchos-tratamientos.png') });
});


test('la ficha resume solo los tratamientos elegidos y rotula el saldo pendiente', async ({ page }) => {
  await page.goto('/paciente.html');
  const html = await page.evaluate(() => DentalClinicalExport.render({
    patient: { first_name: 'Ana', last_name: 'Prueba' },
    treatments: [
      { id: 1, title: 'Tratamiento incluido', final_price: 100000 },
      { id: 2, title: 'Tratamiento excluido', final_price: 900000 }
    ],
    payments: [
      { patient_treatment_id: 1, amount: 30000 },
      { patient_treatment_id: 2, amount: 500000 }
    ],
    appointments: []
  }, '', [1]));
  const section = html.split('<h3>Tratamientos y citas</h3>')[1];
  expect(section).toMatch(/Valor total:<\/strong> \$100\.000/);
  expect(section).toMatch(/Abonos:<\/strong> \$30\.000/);
  expect(section).toMatch(/Saldo pendiente:<\/strong> \$70\.000/);
  expect(section).toContain('Tratamiento incluido');
  expect(section).not.toContain('Tratamiento excluido');
  expect(section).not.toContain('Saldo:</strong>');
});
