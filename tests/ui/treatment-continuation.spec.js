const { test, expect } = require('@playwright/test');

test('continuar tratamiento conserva presupuesto y muestra historial', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [{ id: 7, patient_id: 1, title: 'Endodoncia', tooth_code: '36', status: 'in_progress', final_price: 100 }],
    payments: [{ id: 1, patient_treatment_id: 7, amount: 100, payment_date: '2026-09-01' }],
    appointments: [{ id: 1, patient_id: 1, patient_treatment_id: 7, starts_at: '2026-09-01 10:00', status: 'attended' }],
    sessions: [], attachments: []
  };
  let booking;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      booking = route.request().postDataJSON();
      summary.appointments.push({ id: 2, ...booking });
      return route.fulfill({ json: { id: 2, ...booking } });
    }
    if (path === '/api/appointments/2' && route.request().method() === 'PUT') {
      const update = route.request().postDataJSON();
      Object.assign(summary.appointments[1], update);
      summary.treatments[0].status = 'cancelled';
      return route.fulfill({ json: summary.appointments[1] });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [{ id: 3, name: 'Endodoncia', default_price: 100 }] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  const history = page.locator('[data-treatment-history="7"]');
  await expect(history).toContainText('Pagado');
  await expect(history).toContainText('1 citas registradas');
  await expect(page.getByRole('heading', { name: 'Ultimas evoluciones' })).toHaveCount(0);
  await history.getByRole('button', { name: 'Agendar continuacion' }).click();
  await expect(page.locator('[data-existing-treatment]')).toHaveValue('7');
  await expect(page.locator('[data-appointment-cost]')).toBeHidden();
  await page.locator('#actionDrawer').getByRole('button', { name: 'Agendar cita', exact: true }).click();
  await expect(history).toContainText('2 citas registradas');
  await expect(history).toContainText('1 atendidas');
  expect(booking.patient_treatment_id).toBe(7);
  expect(booking.new_treatment).toBeUndefined();
  await expect(history).toContainText('Pagado');
  await expect(history).toContainText('Cita pendiente:');
  await expect(history.getByRole('button', { name: 'Agendar continuacion' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Agenda y piezas', exact: true }).click();
  await page.locator('[data-tooth="36"]').click();
  await page.locator('#toothNote').getByRole('button', { name: 'Agendar tratamiento para esta pieza' }).click();
  await expect(page.locator('[data-duplicate-message]')).toBeVisible();
  await expect(page.locator('#actionDrawer').getByRole('button', { name: 'Agendar cita', exact: true })).toBeDisabled();
  await page.locator('#actionDrawer [data-action-close]').first().click();
  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-patient-appointment="2"]').getByRole('button', { name: 'Cancelar cita', exact: true }).click();
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(history).toContainText('Cancelado');
  await expect(history).not.toContainText('Pendiente');
  await expect(history).toContainText('Abonos registrados');
  await history.getByRole('button', { name: 'Reagendar tratamiento' }).click();
  await expect(page.locator('#actionDrawer').getByRole('button', { name: 'Agendar cita', exact: true })).toBeEnabled();
  await expect(page.locator('[data-existing-treatment]')).toHaveValue('7');
});
