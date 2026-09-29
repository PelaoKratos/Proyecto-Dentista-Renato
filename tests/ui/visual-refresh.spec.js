const { test, expect } = require('@playwright/test');

test('el panel muestra indicadores reales y accesos a cada tarea', async ({ page }) => {
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/dashboard-stats') {
      return route.fulfill({ json: {
        today_appointments: 3, scheduled_appointments: 2,
        active_patients: 5, patients_with_alerts: 1,
        active_treatments: 4, in_progress_treatments: 3,
        pending_balance: 150000, patients_with_balance: 2
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await expect(page.locator('#metricToday')).toHaveText('3');
  await expect(page.locator('#metricPatients')).toHaveText('5');
  await expect(page.locator('#metricTreatments')).toHaveText('4');
  await expect(page.locator('#metricBalance')).toContainText('150.000');
  await expect(page.locator('.metrics-grid a[href="./agenda.html"]')).toBeVisible();
  await expect(page.locator('#dashboardDate')).not.toBeEmpty();
});

test('la agenda agrupa acciones y conserva las notas al cambiar el estado', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-29T12:00:00'));
  const appointment = { id: 1, patient_id: 1, starts_at: '2026-09-29 10:00', status: 'scheduled', reason: 'Endodoncia', notes: 'Paciente requiere seguimiento' };
  const writes = [];
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT') {
      const data = route.request().postDataJSON();
      writes.push(data);
      Object.assign(appointment, data);
      return route.fulfill({ json: appointment });
    }
    if (pathname === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (pathname === '/api/appointments') return route.fulfill({ json: [appointment] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/agenda.html');
  await page.locator('[data-date="2026-09-29"]').click();
  const card = page.locator('[data-appointment-card="1"]');
  await expect(card).toContainText('Paciente requiere seguimiento');
  await card.getByText('Más acciones').click();
  await card.getByLabel('Estado de la cita').selectOption('attended');
  await card.getByRole('button', { name: 'Guardar estado' }).click();
  await expect(card).toContainText('Atendida');
  expect(writes[0]).toEqual({ status: 'attended' });
  expect(appointment.notes).toBe('Paciente requiere seguimiento');
});

