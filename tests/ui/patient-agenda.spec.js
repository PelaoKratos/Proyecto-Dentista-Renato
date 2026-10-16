const { test, expect } = require('@playwright/test');
test('gestionar citas y filtrar historial desde la ficha', async ({ page }, testInfo) => {
  const summary = {
    patient: {id:1, first_name:'Ana', last_name:'Prueba'},
    treatments: [{id:7, patient_id:1, title:'Endodoncia', tooth_code:'19', status:'in_progress', final_price:100}, {id:8, patient_id:1, title:'Limpieza', tooth_code:'8', status:'completed', final_price:50}],
    appointments: [{id:1,patient_id:1,patient_treatment_id:7,starts_at:'2026-09-01 10:00',ends_at:'2026-09-01 11:00',status:'scheduled',notes:'Conservar indicaciones'}],
    payments: [], sessions: [], attachments: []
  };
  const writes = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PUT') {
      const data = route.request().postDataJSON(); writes.push({path,data});
      if (path.includes('/appointments/')) Object.assign(summary.appointments[0], data);
      else Object.assign(summary.treatments[0], data);
      return route.fulfill({json:data});
    }
    if (path.endsWith('/summary')) return route.fulfill({json:summary});
    return route.fulfill({json:[]});
  });
  await page.goto('/paciente.html?id=1');
  await expect(page.getByRole('heading', {name:'Citas pendientes', exact:false})).toBeVisible();
  await expect(page.locator('[data-patient-appointment="1"]')).toContainText('Por registrar');
  await page.locator('[data-patient-appointment="1"]').getByRole('button',{name:'Cambiar fecha'}).click();
  await page.getByLabel('Nueva fecha').fill('2026-10-15');
  await page.locator('select[name="reschedule_time"]').selectOption('12:30');
  await page.getByRole('button',{name:'Guardar nueva fecha'}).click();
  await expect(page.locator('[data-patient-appointment="1"]')).toContainText('12:30');
  expect(writes[0].data).toEqual({starts_at:'2026-10-15 12:30',ends_at:'2026-10-15 13:30'});
  await page.locator('[data-patient-appointment="1"]').getByRole('button',{name:'Marcar atendida'}).click();
  await expect(page.locator('[data-patient-appointment="1"]')).toHaveCount(0);
  expect(summary.appointments[0].notes).toBe('Conservar indicaciones');
  await page.getByRole('tab',{name:'Historial',exact:true}).click();
  await page.getByLabel('Buscar tratamiento o pieza').fill('19');
  await expect(page.locator('[data-treatment-history="7"]')).toBeVisible();
  await expect(page.locator('[data-treatment-history="8"]')).toBeHidden();
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('[data-treatment-history="7"]').getByRole('button',{name:'Finalizar tratamiento',exact:true}).click();
  await expect(page.locator('[data-treatment-history="7"]')).toContainText('Completado');
  await expect(page.getByLabel('Buscar tratamiento o pieza')).toHaveValue('19');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({path:testInfo.outputPath('historial.png'),fullPage:true});
  await page.getByRole('tab',{name:'Agenda y piezas',exact:true}).click();
  await page.locator('.patient-agenda').getByRole('button',{name:'Agendar cita',exact:true}).click();
  await page.getByLabel('1. Piezas dentales').fill('31,32');
  await expect(page.locator('input[name="tooth_code"]')).toHaveValue('31,32');
  await expect(page.locator('[data-appointment-catalog]')).toHaveAttribute('required','');
  await page.screenshot({path:testInfo.outputPath('agendar.png'),fullPage:true});
});


test('muestra horas ocupadas y bloquea agendar o reprogramar en ellas', async ({ page }) => {
  const appointments = [
    { id: 1, patient_id: 1, starts_at: '2026-10-15 09:00', status: 'scheduled', reason: 'Control general' },
    { id: 2, patient_id: 2, starts_at: '2026-10-15 10:00', ends_at: '2026-10-15 11:00', status: 'scheduled', reason: 'Otra cita' }
  ];
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    appointments: [appointments[0]], treatments: [], payments: [], sessions: [], attachments: []
  };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    if (path === '/api/appointments') return route.fulfill({ json: appointments });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.locator('.patient-agenda').getByRole('button', { name: 'Agendar cita', exact: true }).click();
  const form = page.locator('form[data-form="appointment"]');
  await form.locator('input[name="appointment_date"]').fill('2026-10-15');
  await expect(form.locator('option[value="10:00"]')).toHaveText('10:00 · Ocupada');
  await expect(form.locator('option[value="11:00"]')).toHaveText('11:00 · Disponible');
  await form.locator('select[name="appointment_time"]').selectOption('10:30');
  await expect(form.locator('[data-time-availability]')).toContainText('ya está ocupada');
  await expect(form.getByRole('button', { name: 'Agendar cita' })).toBeDisabled();
  await form.locator('select[name="appointment_time"]').selectOption('11:00');
  await expect(form.locator('[data-time-availability]')).toContainText('disponible');
  await expect(form.getByRole('button', { name: 'Agendar cita' })).toBeEnabled();
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await page.locator('[data-patient-appointment="1"]').getByRole('button', { name: 'Cambiar fecha' }).click();
  const reschedule = page.locator('form[data-form="reschedule"]');
  await expect(reschedule.locator('option[value="09:00"]')).toHaveText('09:00 · Disponible');
  await reschedule.locator('select[name="reschedule_time"]').selectOption('10:00');
  await expect(reschedule.getByRole('button', { name: 'Guardar nueva fecha' })).toBeDisabled();
});


test('agenda cuatro martes para un mismo tratamiento en una sola acción', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [{ id: 7, patient_id: 1, title: 'Endodoncia', tooth_code: '19', status: 'in_progress', final_price: 100000 }],
    appointments: [], payments: [], sessions: [], attachments: []
  };
  let batch;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/appointments/batch' && route.request().method() === 'POST') {
      batch = route.request().postDataJSON();
      const created = batch.starts_at.map((starts_at, index) => ({
        id: index + 1, patient_id: 1, patient_treatment_id: 7, starts_at, status: 'scheduled', reason: batch.reason
      }));
      summary.appointments.push(...created);
      return route.fulfill({ json: created });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    if (path === '/api/appointments') return route.fulfill({ json: summary.appointments });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  await page.locator('[data-treatment-history="7"]').getByRole('button', { name: 'Agendar continuacion' }).click();
  const form = page.locator('form[data-form="appointment"]');
  await form.locator('input[name="appointment_date"]').fill('2026-10-20');
  await form.locator('select[name="appointment_time"]').selectOption('10:00');
  await form.locator('select[name="weekly_count"]').selectOption('4');
  await expect(form.locator('[data-time-availability]')).toContainText('4 citas disponibles');
  await form.getByRole('button', { name: 'Agendar cita', exact: true }).click();
  expect(batch.starts_at).toEqual([
    '2026-10-20 10:00', '2026-10-27 10:00', '2026-11-03 10:00', '2026-11-10 10:00'
  ]);
  expect(batch.patient_treatment_id).toBe(7);
  expect(batch.new_treatment).toBeUndefined();
  await expect(page.locator('[data-treatment-history="7"]')).toContainText('4 citas registradas');
  await expect(page.locator('[data-treatment-history="7"] .history-next')).toContainText('20-10-2026');
  await page.getByRole('tab', { name: 'Agenda y piezas', exact: true }).click();
  await expect(page.locator('[data-patient-appointment]')).toHaveCount(4);
});


test('bloquea el grupo semanal si una fecha posterior ya está ocupada', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [{ id: 7, patient_id: 1, title: 'Endodoncia', tooth_code: '19', status: 'in_progress', final_price: 100000 }],
    appointments: [], payments: [], sessions: [], attachments: []
  };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    if (path === '/api/appointments') return route.fulfill({ json: [{
      id: 8, patient_id: 2, starts_at: '2026-10-27 10:00', status: 'scheduled'
    }] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  await page.locator('[data-treatment-history="7"]').getByRole('button', { name: 'Agendar continuacion' }).click();
  const form = page.locator('form[data-form="appointment"]');
  await form.locator('input[name="appointment_date"]').fill('2026-10-20');
  await form.locator('select[name="appointment_time"]').selectOption('10:00');
  await form.locator('select[name="weekly_count"]').selectOption('4');
  await expect(form.locator('[data-time-availability]')).toContainText('27-10-2026');
  await expect(form.getByRole('button', { name: 'Agendar cita', exact: true })).toBeDisabled();
});
