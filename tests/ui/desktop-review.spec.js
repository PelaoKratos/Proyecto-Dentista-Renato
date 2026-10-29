const { test, expect } = require('@playwright/test');

for (const path of ['/index.html', '/pacientes.html', '/paciente.html?id=2', '/tratamientos.html', '/pagos.html', '/respaldos.html']) {
  test(`escritorio con zoom mantiene el encuadre en ${path}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(path, { waitUntil: 'networkidle' });
    for (const zoom of [1.25, 1.5]) {
      await page.evaluate(value => { document.documentElement.style.zoom = value; }, zoom);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `desbordamiento global al ${zoom * 100}%`).toBeLessThanOrEqual(2);
      await expect(page.locator('.main-content')).toBeVisible();
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('zoom-150.png'), fullPage: true });
  });
}

test('flujo real de alta, cita, atención, abono por procedimiento y exportación', async ({ page }, testInfo) => {
  await page.goto('/pacientes.html#nuevo');
  const newPatient = page.locator('#patientForm');
  await newPatient.getByLabel('Nombres', { exact: true }).fill('Revision');
  await newPatient.getByLabel('Apellidos', { exact: true }).fill('Entrega');
  await newPatient.getByRole('button', { name: 'Guardar ficha' }).click();
  await expect(page).toHaveURL(/paciente.html\?id=/);
  const id = new URL(page.url()).searchParams.get('id');
  const booking = page.locator('#calendarBookingDialog');
  await expect(booking).toBeVisible();
  const catalog = await (await page.request.get('/api/treatment-catalog')).json();
  expect(catalog.length).toBeGreaterThanOrEqual(2);
  for (const [index, amount] of [[0, 20000], [1, 10000]]) {
    await booking.getByRole('combobox', { name: 'Procedimiento', exact: true }).selectOption(String(catalog[index].id));
    await booking.locator('[name="procedure_price"]').fill(String(amount));
    await booking.locator('[name="procedure_teeth"]').fill(index === 0 ? '1,2' : '3');
    await booking.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  }
  await booking.getByLabel('Fecha', { exact: true }).fill('2026-12-15');
  await booking.getByRole('combobox', { name: 'Hora', exact: true }).selectOption('16:00');
  await booking.locator('[name="total_discount_value"]').fill('5000');
  await expect(booking.locator('[data-booking-total]')).toHaveText('$25.000');
  await booking.getByRole('button', { name: 'Agendar cita', exact: true }).click();
  await expect(booking).toBeHidden();
  await page.locator('[data-patient-appointment]').getByRole('button', { name: 'Marcar atendida', exact: true }).click();
  await page.locator('[data-followup-pay]').click();
  const payment = page.locator('.patient-payment-form');
  await payment.locator('[name="amount"]').fill('10000');
  await payment.locator('[data-procedure-payments] summary').click();
  await payment.locator('[data-procedure-part]').nth(0).fill('7000');
  await payment.locator('[data-procedure-part]').nth(1).fill('3000');
  await payment.getByRole('button', { name: 'Guardar pago', exact: true }).click();
  await expect(payment).toBeHidden();
  const summary = await (await page.request.get(`/api/patients/${id}/summary`)).json();
  expect(summary.appointments).toHaveLength(1);
  expect(summary.appointments[0].status).toBe('attended');
  expect(summary.treatments[0].final_price).toBe(25000);
  expect(summary.payments[0].amount).toBe(10000);
  expect(JSON.parse(summary.payments[0].procedure_allocations_json).map(part => part.amount)).toEqual([7000, 3000]);
  await page.getByRole('button', { name: 'Exportar ficha clinica' }).click();
  const popupPromise = page.waitForEvent('popup');
  const started = Date.now();
  await page.getByRole('dialog', { name: 'Elegir tratamientos para exportar' }).getByRole('button', { name: 'Exportar ficha', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.locator('.print-sheet')).toContainText('Saldo pendiente: $15.000');
  await expect(popup.locator('.print-sheet')).toContainText('Renato A. Saldivia Salas');
  await testInfo.attach('exportacion.json', { body: JSON.stringify({ elapsedMs: Date.now() - started }), contentType: 'application/json' });
  await popup.screenshot({ path: testInfo.outputPath('ficha-exportada.png'), fullPage: true });
});
