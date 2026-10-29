const { test, expect } = require('@playwright/test');

const patient = { id: 1, first_name: 'Ana', last_name: 'Prueba' };
const treatment = { id: 7, patient_id: 1, title: 'Plan integral', status: 'in_progress', final_price: 27000,
  procedure_items_json: JSON.stringify([
    { line_id: 'resina', name: 'Resina', price: 10000, tooth_code: '1,2' },
    { line_id: 'limpieza', name: 'Limpieza', price: 20000, tooth_code: '' }
  ]) };
const legacy = { id: 10, patient_id: 1, patient_treatment_id: 7, amount: 1000, payment_date: '2026-10-29' };

test('un abono real persiste por procedimiento y permite corregir una asignación anterior', async ({ page }, testInfo) => {
  const headers = { Origin: 'http://127.0.0.1:8765' };
  const newPatient = await page.request.post('/api/patients', { headers, data: { first_name: 'Asignacion', last_name: 'Prueba' } });
  expect(newPatient.ok()).toBeTruthy();
  const createdPatient = await newPatient.json();
  const newTreatment = await page.request.post('/api/patient-treatments', { headers, data: {
    patient_id: createdPatient.id, title: 'Plan asignado', total_discount_value: 3000,
    procedures: [{ name: 'Resina', price: 10000, tooth_code: '1,2' }, { name: 'Limpieza', price: 20000 }]
  } });
  expect(newTreatment.ok()).toBeTruthy();
  const plan = await newTreatment.json();
  const lines = JSON.parse(plan.procedure_items_json);
  const oldPayment = await page.request.post('/api/payments', { headers, data: {
    patient_id: createdPatient.id, patient_treatment_id: plan.id, amount: 1000, payment_date: '2026-10-29'
  } });
  expect(oldPayment.ok()).toBeTruthy();
  const previous = await oldPayment.json();
  await page.goto('/pagos.html');
  await page.locator('#paymentPatient').selectOption(String(createdPatient.id));
  const form = page.locator('#paymentForm');
  await form.locator('input[name="amount"]').fill('8000');
  await form.locator('[data-procedure-payments] summary').click();
  await expect(form).toContainText('Abonos sin asignar: $1.000');
  await form.getByLabel('Asignar a Resina', { exact: true }).fill('5000');
  await form.getByLabel('Asignar a Limpieza', { exact: true }).fill('3000');
  await expect(form.locator('[data-procedure-payment-summary]')).toContainText('Sin asignar de este abono: $0');
  await form.screenshot({ path: testInfo.outputPath('abono-por-procedimiento.png') });
  await form.getByRole('button', { name: 'Guardar pago', exact: true }).click();
  await expect(page.locator('#paymentStatus')).toContainText('Pago guardado');
  const saved = await (await page.request.get(`/api/payments?patient_id=${createdPatient.id}`)).json();
  const received = saved.find(payment => Number(payment.amount) === 8000);
  expect(JSON.parse(received.procedure_allocations_json)).toEqual([
    { line_id: lines[0].line_id, amount: 5000 }, { line_id: lines[1].line_id, amount: 3000 }
  ]);
  const row = page.locator(`[data-payment-row="${previous.id}"]`);
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await row.locator('[data-payment-procedure-edit] summary').click();
  await row.getByLabel('Asignar a Limpieza', { exact: true }).fill('1000');
  await row.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Editar', exact: true })).toBeVisible();
  const corrected = await (await page.request.get(`/api/payments?patient_id=${createdPatient.id}`)).json();
  expect(JSON.parse(corrected.find(payment => payment.id === previous.id).procedure_allocations_json))
    .toEqual([{ line_id: lines[1].line_id, amount: 1000 }]);
});

async function mock(page, capture) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      capture.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 12 } });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: { patient, treatments: [treatment], payments: [legacy], appointments: [], sessions: [], attachments: [] } });
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    if (path === '/api/payments') return route.fulfill({ json: [legacy] });
    if (path === '/api/appointments') return route.fulfill({ json: [{ id: 9, patient_id: 1, patient_treatment_id: 7, starts_at: `${today} 10:00`, status: 'scheduled', reason: 'Plan integral' }] });
    return route.fulfill({ json: [] });
  });
}

test('la ficha permite asignar abonos en varios tratamientos', async ({ page }) => {
  const writes = [];
  await mock(page, writes);
  await page.goto('/paciente.html?id=1');
  await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  const form = page.locator('.patient-payment-form');
  await form.getByRole('button', { name: 'Varios tratamientos', exact: true }).click();
  const row = form.locator('[data-payment-allocation-row]');
  await row.locator('[data-payment-include]').check();
  await row.locator('[data-payment-part]').fill('2000');
  await row.locator('summary').click();
  await row.getByLabel('Asignar a Resina', { exact: true }).fill('2000');
  await form.getByRole('button', { name: 'Guardar pago', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].allocations[0]).toEqual({ patient_treatment_id: 7, amount: 2000, procedure_allocations: [{ line_id: 'resina', amount: 2000 }] });
});

test('el calendario asigna al procedimiento elegido sin reparto proporcional', async ({ page }) => {
  const writes = [];
  await mock(page, writes);
  await page.goto('/index.html');
  await page.locator('[data-calendar-appointment]').first().click();
  const dialog = page.locator('#calendarAppointmentDialog');
  await dialog.getByRole('button', { name: 'Abonar', exact: true }).click();
  await dialog.locator('[data-menu-payment-amount]').fill('4000');
  await dialog.locator('[data-procedure-payments] summary').click();
  await expect(dialog).toContainText('Abonos sin asignar: $1.000');
  await dialog.getByLabel('Asignar a Limpieza', { exact: true }).fill('4000');
  await dialog.getByRole('button', { name: 'Guardar abonos', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].allocations[0].procedure_allocations).toEqual([{ line_id: 'limpieza', amount: 4000 }]);
});
