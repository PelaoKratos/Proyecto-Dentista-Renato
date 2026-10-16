const { test, expect } = require('@playwright/test');

test('el formulario de pago muestra saldos y guarda notas opcionales', async ({ page }) => {
  const savedPayments = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/patients') {
      return route.fulfill({ json: [{ id: 7, first_name: 'Ana', last_name: 'Prueba' }] });
    }
    if (url.pathname === '/api/patient-treatments') {
      return route.fulfill({ json: [
        { id: 11, patient_id: 7, title: 'Resina', estimated_price: 100000, final_price: null, status: 'in_progress' },
        { id: 12, patient_id: 7, title: 'Limpieza', estimated_price: 50000, final_price: null, status: 'planned' }
      ] });
    }
    if (url.pathname === '/api/payments' && route.request().method() === 'POST') {
      savedPayments.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 23, ...savedPayments.at(-1) } });
    }
    if (url.pathname === '/api/payments') {
      return route.fulfill({ json: [
        { id: 21, patient_id: 7, patient_treatment_id: 11, amount: 20000, method: 'Transferencia', payment_date: '2026-10-03' },
        { id: 22, patient_id: 7, patient_treatment_id: 12, amount: 10000, method: 'Efectivo', payment_date: '2026-10-03' }
      ] });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto('/pagos.html', { waitUntil: 'networkidle' });
  await expect(page.locator('#paymentTreatmentBalance')).toContainText('80.000');
  await expect(page.locator('#paymentPatientBalance')).toContainText('120.000');
  await expect(page.locator('.payment-notes-details')).not.toHaveAttribute('open', '');
  await page.locator('.payment-notes-details summary').click();
  await page.getByLabel('Notas').fill('Abono en recepción');
  await page.getByRole('button', { name: 'Guardar pago' }).click();
  await expect.poll(() => savedPayments.length).toBe(1);
  expect(savedPayments[0]).toMatchObject({ patient_id: 7, patient_treatment_id: 11, amount: 80000, notes: 'Abono en recepción' });
});


test('permite abonar varios tratamientos o pagar todos los saldos', async ({ page }) => {
  const batches = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/patients') return route.fulfill({ json: [{ id: 7, first_name: 'Ana', last_name: 'Prueba' }] });
    if (url.pathname === '/api/patient-treatments') return route.fulfill({ json: [
      { id: 11, patient_id: 7, title: 'Resina', final_price: 100000 },
      { id: 12, patient_id: 7, title: 'Limpieza', final_price: 50000 }
    ] });
    if (url.pathname === '/api/payments/batch' && route.request().method() === 'POST') {
      batches.push(route.request().postDataJSON());
      return route.fulfill({ json: { total: 40000, payments: [] } });
    }
    if (url.pathname === '/api/payments') return route.fulfill({ json: [
      { id: 21, patient_id: 7, patient_treatment_id: 11, amount: 20000, method: 'Transferencia', payment_date: '2026-10-03' },
      { id: 22, patient_id: 7, patient_treatment_id: 12, amount: 10000, method: 'Efectivo', payment_date: '2026-10-03' }
    ] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/pagos.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Varios tratamientos' }).click();
  const rows = page.locator('#paymentForm [data-payment-allocation-row]');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).locator('[data-payment-include]').check();
  await rows.nth(1).locator('[data-payment-include]').check();
  await rows.nth(0).locator('[data-payment-part]').fill('30000');
  await rows.nth(1).locator('[data-payment-part]').fill('10000');
  await expect(page.locator('#paymentForm [data-payment-allocation-summary]')).toContainText('40.000');
  await page.getByRole('button', { name: 'Guardar pago' }).click();
  await expect.poll(() => batches.length).toBe(1);
  expect(batches[0].allocations).toEqual([
    { patient_treatment_id: 11, amount: 30000 }, { patient_treatment_id: 12, amount: 10000 }
  ]);
  await page.getByRole('button', { name: 'Pagar todos' }).click();
  await expect(page.locator('#paymentForm [data-payment-allocation-summary]')).toContainText('120.000');
  await page.getByRole('button', { name: 'Guardar pago' }).click();
  await expect.poll(() => batches.length).toBe(2);
  expect(batches[1].allocations).toEqual([
    { patient_treatment_id: 11, amount: 80000 }, { patient_treatment_id: 12, amount: 40000 }
  ]);
});


test('la ficha del paciente permite pagar todos sus tratamientos', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [
      { id: 7, patient_id: 1, title: 'Endodoncia', status: 'in_progress', final_price: 100 },
      { id: 8, patient_id: 1, title: 'Restauración', status: 'planned', final_price: 200 }
    ],
    appointments: [], sessions: [], payments: [], attachments: []
  };
  let batch;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/payments/batch' && route.request().method() === 'POST') {
      batch = route.request().postDataJSON();
      return route.fulfill({ json: { total: 300, payments: [] } });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Pagos' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const form = page.locator('.patient-payment-form');
  await form.getByRole('button', { name: 'Pagar todos' }).click();
  await expect(form.locator('[data-payment-allocation-summary]')).toContainText('300');
  await form.getByRole('button', { name: 'Guardar pago' }).click();
  await expect.poll(() => batch).toBeTruthy();
  expect(batch.allocations).toEqual([
    { patient_treatment_id: 7, amount: 100 }, { patient_treatment_id: 8, amount: 200 }
  ]);
});
