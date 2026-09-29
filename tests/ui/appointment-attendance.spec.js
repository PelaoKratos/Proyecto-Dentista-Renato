const { test, expect } = require('@playwright/test');

test('registrar atención guarda la evolución y cierra la cita en una sola solicitud', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [{ id: 7, patient_id: 1, title: 'Endodoncia', tooth_code: '36', status: 'in_progress', final_price: 100 }],
    appointments: [{ id: 1, patient_id: 1, patient_treatment_id: 7, starts_at: '2026-09-01 10:00', status: 'scheduled', reason: 'Control', notes: 'Alergia comunicada por paciente' }],
    payments: [], sessions: [], attachments: []
  };
  const writes = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') writes.push({ path, method: route.request().method(), data: route.request().postDataJSON() });
    if (path === '/api/appointments/1/attend') {
      const session = { id: 4, ...route.request().postDataJSON() };
      summary.sessions.push(session);
      summary.appointments[0].status = 'attended';
      return route.fulfill({ json: { session, appointment: summary.appointments[0] } });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1&appointment=1');
  await page.locator('[data-action="appointment-session"]').click();
  await page.getByRole('button', { name: 'Guardar evolucion y cerrar cita' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].path).toBe('/api/appointments/1/attend');
  expect(writes[0].method).toBe('POST');
  expect(writes[0].data).toMatchObject({ patient_id: 1, patient_treatment_id: 7, reason: 'Control' });
  await expect(page.locator('[data-patient-appointment="1"]')).toHaveCount(0);
  expect(summary.appointments[0].notes).toBe('Alergia comunicada por paciente');
});

test('marcar atendida conserva las notas originales de la cita', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [], payments: [], sessions: [], attachments: [],
    appointments: [{ id: 1, patient_id: 1, starts_at: '2026-09-01 10:00', status: 'scheduled', reason: 'Control', notes: 'Alergia comunicada por paciente' }]
  };
  const writes = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT') {
      const data = route.request().postDataJSON();
      writes.push({ path, data });
      Object.assign(summary.appointments[0], data);
      return route.fulfill({ json: summary.appointments[0] });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/paciente.html?id=1&appointment=1');
  await page.locator('[data-action="complete-appointment"]').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ path: '/api/appointments/1', data: { status: 'attended' } });
  expect(summary.appointments[0].notes).toBe('Alergia comunicada por paciente');
});
