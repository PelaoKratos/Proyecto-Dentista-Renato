const { test, expect } = require('@playwright/test');

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

test('el clic en una cita abre acciones y permite atender, finalizar y abonar sin salir del calendario', async ({ page }, testInfo) => {
  const appointment = { id: 3, patient_id: 1, patient_treatment_id: 7,
    starts_at: `${today()} 10:00`, reason: 'Endodoncia', status: 'scheduled' };
  const treatment = { id: 7, patient_id: 1, title: 'Endodoncia', status: 'in_progress',
    tooth_code: '4', estimated_price: 80000, final_price: 70000 };
  const writes = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'PUT' || method === 'POST') {
      const data = route.request().postDataJSON();
      writes.push({ path, data });
      if (path === '/api/appointments/3') Object.assign(appointment, data);
      if (path === '/api/patient-treatments/7') Object.assign(treatment, data);
      return route.fulfill({ json: { id: 1, ...data } });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: [appointment] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    if (path === '/api/payments') return route.fulfill({ json: [] });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('.calendar-appointment').first().click();
  const dialog = page.locator('#calendarAppointmentDialog');
  await expect(dialog).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('acciones-cita.png') });
  await expect(page).toHaveURL(/index\.html/);
  await dialog.getByRole('button', { name: 'Marcar atendida' }).click();
  await expect(dialog).toContainText('Cita marcada como atendida');
  await dialog.getByRole('button', { name: 'Finalizar tratamiento' }).click();
  await expect(dialog).toContainText('Tratamiento finalizado');
  await dialog.getByRole('button', { name: 'Abonar' }).click();
  await dialog.getByLabel('Abono', { exact: true }).fill('20000');
  await dialog.getByRole('button', { name: 'Guardar abonos', exact: true }).click();
  await expect(dialog).toContainText('Abono registrado correctamente');
  expect(writes).toEqual([
    { path: '/api/appointments/3', data: { status: 'attended' } },
    { path: '/api/patient-treatments/7', data: { status: 'completed', end_date: today() } },
    { path: '/api/payments/batch', data: { patient_id: 1,
      payment_date: today(), method: 'Transferencia', notes: 'Abono registrado desde la agenda',
      allocations: [{ patient_treatment_id: 7, amount: 20000, procedure_allocations: [] }] } }
  ]);
  await dialog.getByRole('button', { name: 'Agendar próxima cita' }).click();
  await expect(page.locator('#calendarBookingDialog [name="patient_id"]')).toHaveValue('1');
  await expect(page.locator('#calendarBookingDialog [name="treatment_choice"]')).toHaveValue('new');
});

test('cambia la fecha de una cita y abre el agendamiento siguiente con el tratamiento seleccionado', async ({ page }) => {
  const appointment = { id: 4, patient_id: 1, patient_treatment_id: 7,
    starts_at: `${today()} 09:00`, reason: 'Control', status: 'scheduled' };
  const treatment = { id: 7, patient_id: 1, title: 'Endodoncia', status: 'in_progress',
    tooth_code: '4', estimated_price: 80000, final_price: 80000 };
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 7);
  const nextDay = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
  const occupied = { id: 9, patient_id: 2, patient_treatment_id: null,
    starts_at: `${nextDay} 10:00`, reason: 'Evaluación', status: 'scheduled' };
  const writes = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      writes.push(data);
      appointment.status = 'attended';
      return route.fulfill({ json: { id: 10, ...data } });
    }
    if (path === '/api/appointments/4' && route.request().method() === 'PUT') {
      const data = route.request().postDataJSON();
      writes.push(data);
      Object.assign(appointment, data);
      return route.fulfill({ json: appointment });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: [appointment, occupied] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    if (path === '/api/health') return route.fulfill({ json: { features: { itemized_treatments: true } } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('.calendar-appointment').first().click();
  const dialog = page.locator('#calendarAppointmentDialog');
  await dialog.getByRole('button', { name: 'Cambiar fecha' }).click();
  await dialog.locator('[name="time"]').selectOption('11:30');
  await dialog.getByRole('button', { name: 'Guardar nueva fecha' }).click();
  await expect(dialog).toContainText('Fecha de la cita actualizada');
  expect(writes).toEqual([{ starts_at: `${today()} 11:30` }]);
  expect(appointment.status).toBe('scheduled');
  await dialog.getByRole('button', { name: 'Agendar próxima cita' }).click();
  const booking = page.locator('#calendarBookingDialog');
  await expect(booking).toBeVisible();
  await expect(booking.locator('[name="patient_id"]')).toHaveValue('1');
  await expect(booking.locator('[name="treatment_choice"]')).toHaveValue('7');
  await expect(booking.locator('[name="booking_time"]')).toHaveValue('11:30');
  await expect(booking.locator('[data-booking-followup-note]')).toBeVisible();
  await expect(booking.locator('[name="booking_time"] option[value="10:00"]')).toHaveText('10:00 · Ocupada');
  await expect(booking.locator('[name="booking_time"] option[value="11:30"]')).toHaveText('11:30 · Disponible');
  await booking.locator('[name="booking_time"]').selectOption('10:00');
  await expect(booking.locator('[data-booking-status]')).toContainText('Esta hora ya está ocupada');
  await booking.locator('[name="booking_time"]').selectOption('11:30');
  await booking.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(booking).not.toBeVisible();
  expect(writes[1].followup_for_appointment_id).toBe(4);
  expect(appointment.status).toBe('attended');
});

test('marca una inasistencia y permite abrir el registro clínico desde el menú', async ({ page }) => {
  const appointment = { id: 5, patient_id: 1, patient_treatment_id: null,
    starts_at: `${today()} 10:30`, reason: 'Observación', status: 'scheduled' };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments/5' && route.request().method() === 'PUT') {
      Object.assign(appointment, route.request().postDataJSON());
      return route.fulfill({ json: appointment });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: [appointment] });
    if (path === '/api/patients/1/summary') return route.fulfill({ json: { patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
      appointments: [appointment], treatments: [], payments: [], sessions: [], attachments: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await page.locator('.calendar-appointment').first().click();
  const dialog = page.locator('#calendarAppointmentDialog');
  await dialog.getByRole('button', { name: 'No asistió' }).click();
  await expect(dialog).toContainText('Inasistencia registrada');
  await dialog.getByRole('button', { name: 'Marcar atendida' }).click();
  await expect(dialog).toContainText('Cita marcada como atendida');
  await dialog.getByRole('button', { name: 'Registrar evolución' }).click();
  await expect(page).toHaveURL(/paciente\.html\?id=1&appointment=5/);
  await expect(page.locator('#actionDrawer')).toBeVisible();
});

test('Registrar atención abre directamente el formulario clínico de la cita', async ({ page }) => {
  const appointment = { id: 6, patient_id: 1, patient_treatment_id: 7,
    starts_at: `${today()} 12:00`, reason: 'Control endodoncia', status: 'scheduled' };
  const patient = { id: 1, first_name: 'Ana', last_name: 'Prueba' };
  const treatment = { id: 7, patient_id: 1, title: 'Endodoncia', tooth_code: '4', status: 'in_progress' };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path === '/api/appointments') return route.fulfill({ json: [appointment] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    if (path === '/api/patients/1/summary') return route.fulfill({ json: {
      patient, appointments: [appointment], treatments: [treatment], payments: [], sessions: [], attachments: [] } });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('.calendar-appointment').first().click();
  await page.locator('#calendarAppointmentDialog').getByRole('button', { name: 'Registrar atención' }).click();
  await expect(page).toHaveURL(/paciente\.html\?id=1&appointment=6/);
  await expect(page.locator('#actionDrawer [data-form="appointment-session"]')).toBeVisible();
});

test('no finaliza un tratamiento que todavía tiene otra cita pendiente', async ({ page }) => {
  const appointments = [
    { id: 7, patient_id: 1, patient_treatment_id: 9, starts_at: `${today()} 09:00`, status: 'attended', reason: 'Primera sesión' },
    { id: 8, patient_id: 1, patient_treatment_id: 9, starts_at: `${today()} 09:30`, status: 'scheduled', reason: 'Segunda sesión' }
  ];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: appointments });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [{ id: 9, patient_id: 1, title: 'Endodoncia', status: 'in_progress' }] });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('[data-calendar-appointment="7"]').click();
  const dialog = page.locator('#calendarAppointmentDialog');
  await expect(dialog.getByRole('button', { name: 'Finalizar tratamiento' })).toBeDisabled();
  await expect(dialog).toContainText('resuelve primero sus otras citas pendientes');
});
