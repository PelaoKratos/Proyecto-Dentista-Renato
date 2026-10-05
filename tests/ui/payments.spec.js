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
