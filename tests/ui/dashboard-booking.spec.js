const { test, expect } = require('@playwright/test');

test('agenda una observación desde la semana sin tratamiento ni cobro', async ({ page }) => {
  const appointments = [];
  let saved;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      appointments.push({ id: 1, ...saved });
      return route.fulfill({ json: appointments[0] });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: appointments });
    if (path === '/api/dashboard-stats') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await page.locator('.week-slot [data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('select[name="patient_id"]').selectOption('1');
  await dialog.locator('select[name="booking_type"]').selectOption('observation');
  await expect(dialog.locator('[data-booking-treatment]')).toBeHidden();
  await dialog.getByRole('button', { name: 'Agendar cita' }).click();
  expect(saved.patient_treatment_id).toBeNull();
  expect(saved.new_treatment).toBeUndefined();
  expect(saved.reason).toBe('Observación clínica');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.week-slot .calendar-appointment')).toHaveCount(1);
});

test('agenda un tratamiento con varios procedimientos, piezas y descuentos desde el calendario', async ({ page }, testInfo) => {
  let saved;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, features: { itemized_treatments: true } } });
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { id: 1, ...saved } });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [{ id: 2, name: 'Endodoncia', default_price: 85000 }] });
    if (path === '/api/appointments' || path === '/api/patient-treatments') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('[data-calendar-view="day"]').click();
  await page.locator('.day-row [data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  await dialog.locator('select[name="patient_id"]').selectOption('1');
  await dialog.locator('input[name="title"]').fill('Rehabilitación');
  await dialog.locator('select[name="catalog_id"]').selectOption('2');
  await dialog.locator('input[name="procedure_teeth"]').fill('4, 5');
  await dialog.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  await dialog.locator('select[name="catalog_id"]').selectOption('');
  await dialog.locator('input[name="procedure_name"]').fill('Resina');
  await dialog.locator('input[name="procedure_teeth"]').fill('6');
  await dialog.locator('input[name="procedure_price"]').fill('30000');
  await dialog.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  await dialog.locator('[data-booking-procedure="1"] [data-procedure-field="tooth_code"]').fill('6,7');
  const first = dialog.locator('[data-booking-procedure="0"]');
  await first.locator('[data-procedure-field="discount_type"]').selectOption('percent');
  await first.locator('[data-procedure-field="discount_value"]').fill('10');
  await dialog.locator('select[name="total_discount_type"]').selectOption('percent');
  await dialog.locator('input[name="total_discount_value"]').fill('5');
  await expect(dialog.locator('[data-booking-total]')).toHaveText('$101.175');
  await dialog.locator('select[name="total_discount_type"]').selectOption('amount');
  await dialog.locator('input[name="total_discount_value"]').fill('5000');
  await expect(dialog.locator('[data-booking-total]')).toHaveText('$101.500');
  await expect(dialog.locator('[data-booking-footer-total]')).toHaveText('Total: $101.500');
  await dialog.screenshot({ path: testInfo.outputPath('procedimientos-calendario.png') });
  await dialog.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(dialog).toBeHidden();
  expect(saved.new_treatment).toMatchObject({ title: 'Rehabilitación', total_discount_type: 'amount', total_discount_value: 5000 });
  expect(saved.new_treatment.procedures).toEqual([
    { name: 'Endodoncia', catalog_treatment_id: 2, tooth_code: '4,5', price: 85000, discount_type: 'percent', discount_value: '10' },
    { name: 'Resina', catalog_treatment_id: null, tooth_code: '6,7', price: 30000, discount_type: 'amount', discount_value: 0 }
  ]);
});

test('impide crear un tratamiento sin presupuesto si el servidor sigue en una versión anterior', async ({ page }) => {
  let posted = false;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      posted = true;
      return route.fulfill({ json: {} });
    }
    if (path === '/api/health') return route.fulfill({ json: { ok: true } });
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments' || path === '/api/patient-treatments' || path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('.week-slot [data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  await dialog.locator('select[name="patient_id"]').selectOption('1');
  await dialog.locator('input[name="title"]').fill('Control y limpieza');
  await dialog.locator('input[name="procedure_name"]').fill('Limpieza');
  await dialog.locator('input[name="procedure_price"]').fill('30000');
  await dialog.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  await dialog.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(dialog.locator('[data-booking-status]')).toContainText('versión anterior');
  expect(posted).toBe(false);
});

test('reutiliza un tratamiento existente y diferencia visualmente las filas', async ({ page }) => {
  let saved;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, features: { itemized_treatments: true } } });
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { id: 1, ...saved } });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [{ id: 7, patient_id: 1, title: 'Ortodoncia', tooth_code: '4,5', status: 'in_progress', final_price: 80000 }] });
    if (path === '/api/appointments' || path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  const colors = await page.locator('.week-row').evaluateAll(rows => rows.slice(0, 2).map(row => getComputedStyle(row).backgroundColor));
  expect(colors[0]).not.toBe(colors[1]);
  await page.locator('.week-slot [data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  await dialog.locator('select[name="patient_id"]').selectOption('1');
  await dialog.locator('select[name="treatment_choice"]').selectOption('7');
  await expect(dialog.locator('[data-booking-procedure="0"]')).toContainText('Ortodoncia');
  await dialog.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(dialog).toBeHidden();
  expect(saved.patient_treatment_id).toBe(7);
  expect(saved.new_treatment).toBeUndefined();
  expect(saved.treatment_update).toBeUndefined();
});

test('continúa un tratamiento y modifica sus procedimientos sin crear otro cobro', async ({ page }) => {
  let saved;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, features: { itemized_treatments: true } } });
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { id: 1, ...saved } });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [{ id: 7, patient_id: 1, title: 'Plan inicial', tooth_code: '4', status: 'in_progress', estimated_price: 80000, final_price: 80000,
      procedure_items_json: JSON.stringify([{ name: 'Endodoncia', catalog_treatment_id: null, tooth_code: '4', price: 80000, discount_type: 'amount', discount_value: 0 }]) }] });
    if (path === '/api/appointments' || path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('.week-slot [data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  await dialog.locator('select[name="patient_id"]').selectOption('1');
  await dialog.locator('select[name="treatment_choice"]').selectOption('7');
  await dialog.locator('input[name="title"]').fill('Plan integral');
  await dialog.locator('input[name="procedure_name"]').fill('Resina');
  await dialog.locator('input[name="procedure_teeth"]').fill('5');
  await dialog.locator('input[name="procedure_price"]').fill('20000');
  await dialog.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  await dialog.getByRole('button', { name: 'Agendar cita' }).click();
  await expect(dialog).toBeHidden();
  expect(saved.patient_treatment_id).toBe(7);
  expect(saved.new_treatment).toBeUndefined();
  expect(saved.treatment_update).toMatchObject({ title: 'Plan integral', procedures: [expect.any(Object), expect.objectContaining({ name: 'Resina', tooth_code: '5', price: 20000 })] });
});

test('busca por RUT sin puntuación y crea un paciente sin salir de nueva cita', async ({ page }) => {
  const patients = [{ id: 1, first_name: 'Ana', last_name: 'Prueba', rut: '12.345.678-9' }];
  let createdPatient;
  let savedAppointment;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients' && route.request().method() === 'POST') {
      createdPatient = route.request().postDataJSON();
      const patient = { id: 2, ...createdPatient };
      patients.push(patient);
      return route.fulfill({ json: patient });
    }
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      savedAppointment = route.request().postDataJSON();
      return route.fulfill({ json: { id: 1, ...savedAppointment } });
    }
    if (path === '/api/patients') return route.fulfill({ json: patients });
    if (path === '/api/appointments' || path === '/api/patient-treatments' || path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/index.html');
  await page.locator('.week-slot [data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  const originalDate = await dialog.locator('input[name="booking_date"]').inputValue();
  await dialog.locator('input[name="patient_search"]').fill('123456789');
  await expect(dialog.locator('select[name="patient_id"] option')).toHaveCount(2);
  await dialog.locator('select[name="patient_id"]').selectOption('1');
  await dialog.locator('input[name="patient_search"]').fill('María');
  await expect(dialog.locator('[data-booking-no-patients]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Crear paciente nuevo' }).click();
  await dialog.locator('input[name="new_first_name"]').fill('María');
  await dialog.locator('input[name="new_last_name"]').fill('Soto');
  await dialog.locator('input[name="new_rut"]').fill('123456789');
  await dialog.getByRole('button', { name: 'Guardar paciente y continuar' }).click();
  await expect(dialog.locator('[data-booking-create-status]')).toContainText('ya está registrado');
  expect(createdPatient).toBeUndefined();
  await dialog.locator('input[name="new_rut"]').fill('187654321');
  await dialog.locator('input[name="new_phone"]').fill('912345678');
  await dialog.getByRole('button', { name: 'Guardar paciente y continuar' }).click();
  await expect(dialog.locator('select[name="patient_id"]')).toHaveValue('2');
  await expect(dialog.locator('input[name="booking_date"]')).toHaveValue(originalDate);
  expect(createdPatient).toMatchObject({ first_name: 'María', last_name: 'Soto', rut: '18.765.432-1', phone: '+56 912345678' });
  await dialog.locator('select[name="booking_type"]').selectOption('observation');
  await dialog.getByRole('button', { name: 'Agendar cita' }).click();
  expect(savedAppointment.patient_id).toBe(2);
  await expect(dialog).toBeHidden();
});

test('oculta Agendar en horas ocupadas y lo recupera al cancelar la cita', async ({ page }) => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const appointments = [
    { id: 1, patient_id: 1, starts_at: `${date} 09:00`, ends_at: `${date} 10:00`, reason: 'Control', status: 'scheduled' },
    { id: 2, patient_id: 2, starts_at: `${date} 16:00`, reason: 'Última hora', status: 'scheduled' }
  ];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments/1' && route.request().method() === 'PUT') {
      appointments[0].status = route.request().postDataJSON().status;
      return route.fulfill({ json: appointments[0] });
    }
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: appointments });
    if (path === '/api/dashboard-stats') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await page.locator('[data-calendar-view="day"]').click();
  const rowAt = hour => page.locator('.day-row').filter({ has: page.locator('time', { hasText: hour }) });
  await expect(rowAt('09:00').locator('[data-calendar-book]')).toHaveCount(0);
  await expect(rowAt('09:30').locator('[data-calendar-book]')).toHaveCount(0);
  await expect(rowAt('10:00').locator('[data-calendar-book]')).toHaveCount(1);
  await expect(rowAt('16:00').locator('[data-calendar-book]')).toContainText('Otro paciente');
  await page.goto('/agenda.html');
  page.on('dialog', dialog => dialog.accept());
  const card = page.locator('[data-appointment-card="1"]');
  await card.locator('summary').click();
  await card.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(card).toHaveClass(/status-cancelled/);
  await page.goBack();
  await page.locator('[data-calendar-view="day"]').click();
  await expect(rowAt('09:00').locator('[data-calendar-book]')).toHaveCount(1);
  await expect(rowAt('09:30').locator('[data-calendar-book]')).toHaveCount(1);
});
