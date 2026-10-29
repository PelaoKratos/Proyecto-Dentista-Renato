const { test, expect } = require('@playwright/test');

test('la búsqueda del menú encuentra pacientes por nombre, RUT y teléfono desde Pagos', async ({ page }) => {
  const patient = { id: 7, first_name: 'María', last_name: 'Soto', rut: '18.765.432-1', phone: '+56 9 1234 5678' };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path.endsWith('/summary')) return route.fulfill({ json: { patient, treatments: [], payments: [], appointments: [], sessions: [], attachments: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/pagos.html');
  await page.locator('#openPatientSearch').click();
  const dialog = page.locator('#patientSearchDialog');
  for (const query of ['maria', '187654321', '912345678']) {
    await dialog.getByRole('searchbox').fill(query);
    await expect(dialog.getByRole('link', { name: /María Soto/ })).toBeVisible();
  }
  await dialog.getByRole('link', { name: /María Soto/ }).click();
  await expect(page).toHaveURL(/paciente\.html\?id=7/);
});

test('Inicio muestra las citas atrasadas de hoy que aún deben resolverse', async ({ page }) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const futureDate = now.getHours() >= 23
    ? `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    : today;
  const futureHour = now.getHours() >= 23 ? '09:00' : '23:00';
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: [
      { id: 1, patient_id: 1, starts_at: `${today} 00:00`, reason: 'Control pendiente', status: 'scheduled' },
      { id: 2, patient_id: 1, starts_at: `${today} 00:00`, reason: 'Ya atendida', status: 'attended' },
      { id: 3, patient_id: 1, starts_at: `${today} 00:00`, reason: 'Cancelada', status: 'cancelled' },
      { id: 4, patient_id: 1, starts_at: `${futureDate} ${futureHour}`, reason: 'Más tarde', status: 'scheduled' }
    ] });
    if (path === '/api/dashboard-stats') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await expect(page.locator('#todayFollowupsCount')).toHaveText('1');
  await expect(page.locator('#todayFollowupsList')).toContainText('Control pendiente');
  await expect(page.locator('#todayFollowupsList')).not.toContainText('Ya atendida');
  await expect(page.locator('#todayFollowupsList a')).toHaveAttribute('href', './paciente.html?id=1&appointment=1');
});

test('avisa antes de descartar cambios del presupuesto en la ficha', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [{ id: 7, patient_id: 1, title: 'Endodoncia', status: 'planned', estimated_price: 100000, final_price: 100000 }],
    appointments: [], payments: [], sessions: [], attachments: []
  };
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('tab', { name: 'Plan y presupuesto' }).click();
  const card = page.locator('[data-patient-treatment-card="7"]');
  await card.getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  const editor = page.locator('#treatmentProceduresDialog');
  await editor.getByLabel('Valor final $', { exact: true }).fill('120000');
  page.once('dialog', dialog => dialog.dismiss());
  await editor.getByRole('button', { name: 'Cerrar editor de tratamiento' }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Valor final $', { exact: true })).toHaveValue('120000');
  page.once('dialog', dialog => dialog.accept());
  await editor.press('Escape');
  await expect(editor).toBeHidden();
  await card.getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  await expect(editor.getByLabel('Valor final $', { exact: true })).toHaveValue('100000');
});

test('avisa antes de cancelar la edición de un pago', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [{ id: 7, patient_id: 1, title: 'Endodoncia', final_price: 100000 }] });
    if (path === '/api/payments') return route.fulfill({ json: [{ id: 9, patient_id: 1, patient_treatment_id: 7, amount: 100000, method: 'Efectivo', payment_date: '2026-10-01' }] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/pagos.html');
  const row = page.locator('[data-payment-row="9"]');
  await row.getByRole('button', { name: 'Editar' }).click();
  await row.locator('[data-payment-amount]').fill('90000');
  await expect(row).toHaveAttribute('data-unsaved-payment', 'true');
  page.once('dialog', dialog => dialog.dismiss());
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row.locator('[data-payment-amount]')).toHaveValue('90000');
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('[data-payment-row="9"] [data-payment-amount]')).toHaveValue('100000');
});
