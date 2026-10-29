const { test, expect } = require('@playwright/test');
const patient = { id: 1, first_name: 'Ana', last_name: 'Prueba', rut: '12.345.678-5' };
const image = { name: 'radiografia-prueba.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGDcAAAAASUVORK5CYII=', 'base64') };
async function fixture(page, handler) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (handler && await handler(route, path)) return;
    if (path.endsWith('/summary')) return route.fulfill({ json: { patient, treatments: [], payments: [], sessions: [], attachments: [], appointments: [] } });
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path === '/api/health') return route.fulfill({ json: { features: { itemized_treatments: true } } });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [{ id: 4, name: 'Resina', default_price: 30000 }] });
    return route.fulfill({ json: [] });
  });
}
async function booking(page) {
  await page.goto('/index.html');
  await page.locator('[data-calendar-book]').first().click();
  const form = page.locator('#calendarBookingForm');
  await form.getByLabel('Buscar paciente por nombre o RUT').fill('Ana');
  await form.getByRole('button', { name: /Ana Prueba.*12.345/ }).click();
  return form;
}
test('cerrar una cita con cambios permite conservar procedimientos y archivo', async ({ page }) => {
  await fixture(page);
  const form = await booking(page);
  await form.getByRole('combobox', { name: 'Procedimiento', exact: true }).selectOption('4');
  await form.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  await form.getByText('Notas y radiografía (opcional)', { exact: true }).click();
  await form.locator('[name="file"]').setInputFiles(image);
  page.once('dialog', dialog => dialog.dismiss());
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#calendarBookingDialog')).toBeVisible();
  await expect(form.locator('[data-booking-procedure-list]')).toContainText('Resina');
  expect(await form.locator('[name="file"]').evaluate(input => input.files[0].name)).toBe(image.name);
  page.once('dialog', dialog => dialog.accept());
  await form.press('Escape');
  await expect(page.locator('#calendarBookingDialog')).toBeHidden();
});
test('salir de pacientes avisa y conservar mantiene los datos sin almacenamiento persistente', async ({ page }) => {
  await fixture(page);
  await page.goto('/pacientes.html');
  const form = page.locator('#patientForm');
  await form.locator('[name="first_name"]').fill('Nombre pendiente');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page).toHaveURL(/pacientes.html$/);
  await expect(form.locator('[name="first_name"]')).toHaveValue('Nombre pendiente');
  expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))).not.toContain('Nombre pendiente');
  const blocked = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(blocked).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page).toHaveURL(/index.html$/);
});
test('el cajón conserva una nota al rechazar el cierre y el cambio de pestaña', async ({ page }) => {
  await fixture(page);
  await page.goto('/paciente.html?id=1');
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-form="edit"]');
  await form.getByLabel('Alergias', { exact: true }).fill('Alergia pendiente');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Agenda y piezas', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(form.getByLabel('Alergias', { exact: true })).toHaveValue('Alergia pendiente');
  page.once('dialog', dialog => dialog.dismiss());
  await form.getByLabel('Alergias', { exact: true }).press('Escape');
  await expect(form).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
  await expect(page.locator('#actionDrawer')).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Pagos', exact: true })).toHaveAttribute('aria-selected', 'true');
});
test('una subida conserva el archivo al cancelar el reingreso y lo reintenta tras autenticarse', async ({ page }) => {
  let attempts = 0, logins = 0;
  const uploads = [];
  await fixture(page, async (route, path) => {
    if (path === '/api/attachments' && route.request().method() === 'POST') {
      attempts += 1;
      uploads.push({ contentType: route.request().headers()['content-type'], body: route.request().postDataBuffer().toString('latin1') });
      await route.fulfill(attempts < 3 ? { status: 401, json: { error: 'Sesión vencida' } } : { json: { id: 25 } }); return true;
    }
    if (path === '/api/auth/login') { logins += 1; await route.fulfill({ json: { ok: true } }); return true; }
    return false;
  });
  await page.goto('/radiografias.html');
  const form = page.locator('#attachmentForm');
  await form.locator('[name="file"]').setInputFiles(image);
  await form.getByRole('button', { name: 'Guardar adjunto' }).click();
  let login = page.getByRole('dialog', { name: 'Tu sesión venció' });
  await expect(login).toBeVisible();
  await login.getByRole('button', { name: 'Volver al formulario' }).click();
  await expect(form.locator('#attachmentStatus')).toContainText('El formulario se conserva');
  expect(await form.locator('[name="file"]').evaluate(input => input.files[0].name)).toBe(image.name);
  await form.getByRole('button', { name: 'Guardar adjunto' }).click();
  login = page.getByRole('dialog', { name: 'Tu sesión venció' });
  await login.getByLabel('Contraseña').fill('clave-de-prueba');
  await login.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(form.locator('#attachmentStatus')).toContainText('Adjunto guardado');
  expect(attempts).toBe(3); expect(logins).toBe(1);
  expect(uploads.every(upload => upload.contentType.includes('multipart/form-data; boundary=') && upload.body.includes(image.name))).toBe(true);
});
test('reintentar un adjunto fallido no duplica la cita guardada', async ({ page }) => {
  let appointments = 0, uploads = 0;
  await fixture(page, async (route, path) => {
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      appointments += 1; await route.fulfill({ json: { id: 12, patient_treatment_id: 7 } }); return true;
    }
    if (path === '/api/attachments' && route.request().method() === 'POST') {
      uploads += 1; await route.fulfill(uploads === 1 ? { status: 500, json: { error: 'No se pudo guardar el archivo' } } : { json: { id: 14 } }); return true;
    }
    return false;
  });
  const form = await booking(page);
  await form.getByRole('combobox', { name: 'Tipo de cita', exact: true }).selectOption('observation');
  await form.getByLabel('Costo de la observación').fill('15000');
  await form.getByText('Notas y radiografía (opcional)', { exact: true }).click();
  await form.locator('[name="file"]').setInputFiles(image);
  await form.getByRole('button', { name: 'Agendar cita', exact: true }).click();
  await expect(form.locator('[data-booking-status]')).toContainText('La cita ya está guardada');
  await expect(page.locator('#calendarBookingDialog')).toBeVisible();
  await form.getByRole('button', { name: 'Reintentar adjunto', exact: true }).click();
  await expect(page.locator('#calendarBookingDialog')).toBeHidden();
  expect(appointments).toBe(1); expect(uploads).toBe(2);
});
