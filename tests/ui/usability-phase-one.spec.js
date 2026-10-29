const { test, expect } = require('@playwright/test');

const patient = { id: 1, first_name: 'Ana', last_name: 'Prueba', rut: '12.345.678-5', dentition_type: 'adult' };
const catalog = [{ id: 4, name: 'Resina', default_price: 30000 }];
function summary() { return { patient: { ...patient }, treatments: [], appointments: [], sessions: [], payments: [], attachments: [] }; }

async function fixtures(page, handler) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (handler && await handler(route, path)) return;
    if (path.endsWith('/summary')) return route.fulfill({ json: summary() });
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: catalog });
    if (path === '/api/health') return route.fulfill({ json: {ok: true, features: {itemized_treatments: true}} });
    if (path === '/api/dashboard-stats') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
}

test('el calendario conserva la observación con costo en el formulario compartido', async ({ page }) => {
  let saved;
  await fixtures(page, async (route, path) => {
    if (path === '/api/appointments' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      await route.fulfill({json:{id:10, ...saved}}); return true;
    }
    return false;
  });
  await page.goto('/index.html');
  await page.locator('[data-calendar-book]').first().click();
  const dialog = page.locator('#calendarBookingDialog');
  await dialog.getByLabel('Buscar paciente por nombre o RUT').fill('Ana');
  await dialog.getByRole('button', {name:/Ana Prueba.*12.345/}).click();
  await dialog.getByRole('combobox', {name:'Tipo de cita', exact:true}).selectOption('observation');
  await dialog.getByLabel('Costo de la observación').fill('15000');
  await dialog.getByRole('button', {name:'Agendar cita', exact:true}).click();
  await expect(dialog).toBeHidden();
  expect(saved.new_treatment).toMatchObject({title:'Observación clínica', final_price:15000});
});

test('la ficha agenda varias fechas con procedimientos y presupuesto único', async ({ page }) => {
  let saved;
  await fixtures(page, async (route, path) => {
    if (path === '/api/appointments/batch' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: [{ id: 10, patient_treatment_id: 7 }] }); return true;
    }
    return false;
  });
  await page.goto('/paciente.html?id=1');
  await expect(page.getByText('Sin informar. Confirma este dato con el paciente.')).toBeVisible();
  await page.getByRole('button', { name: 'Agendar cita', exact: true }).click();
  const dialog = page.locator('#calendarBookingDialog');
  await expect(dialog).toContainText('Agendar cita · Ana Prueba');
  await dialog.getByRole('combobox', { name: 'Procedimiento', exact: true }).selectOption('4');
  await dialog.getByLabel('Piezas dentales', { exact: true }).fill('1,2');
  await dialog.getByRole('button', { name: 'Agregar procedimiento al tratamiento' }).click();
  await dialog.getByLabel('Fecha', { exact: true }).fill('2026-11-12');
  await dialog.getByRole('combobox', { name: 'Hora', exact: true }).selectOption('10:00');
  await dialog.getByRole('combobox', { name: 'Programación', exact: true }).selectOption('custom');
  await dialog.getByRole('button', { name: '+ Agregar otra cita' }).click();
  await dialog.getByLabel('Fecha adicional').fill('2026-11-17');
  await dialog.getByRole('combobox', { name: 'Hora adicional', exact: true }).selectOption('11:30');
  await dialog.getByRole('button', {name: 'Agendar cita', exact: true}).click();
  await expect(dialog).toBeHidden();
  expect(saved.starts_at).toEqual(['2026-11-12 10:00', '2026-11-17 11:30']);
  expect(saved.patient_id).toBe(1);
  expect(saved.new_treatment.title).toBe('1° Tratamiento');
  expect(saved.new_treatment.procedures[0]).toMatchObject({name:'Resina', tooth_code:'1,2', price:30000});
});

test('Tratamientos usa el mismo compositor sin crear una cita', async ({ page }) => {
  const writes = [];
  await fixtures(page, async (route, path) => {
    if (route.request().method() === 'POST') {
      writes.push({path, body: route.request().postDataJSON()});
      await route.fulfill({json: {id: 7}}); return true;
    }
    return false;
  });
  await page.goto('/tratamientos.html');
  await page.getByRole('button', {name:'Crear tratamiento', exact:true}).click();
  const dialog = page.locator('#calendarBookingDialog');
  await dialog.getByLabel('Buscar paciente por nombre o RUT').fill('Ana');
  await dialog.getByRole('button', {name: /Ana Prueba.*12.345/}).click();
  await dialog.getByRole('combobox', {name:'Procedimiento', exact:true}).selectOption('4');
  await dialog.getByRole('button', {name:'Agregar procedimiento al tratamiento'}).click();
  await dialog.getByRole('button', {name:'Guardar tratamiento', exact:true}).click();
  await expect(dialog).toBeHidden();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe('/api/patient-treatments');
  expect(writes[0].body.procedures).toHaveLength(1);
});

test('una sesión vencida permite reingresar y guardar sin perder el formulario', async ({ page }) => {
  let attempts = 0;
  let saved;
  await fixtures(page, async (route, path) => {
    if (path === '/api/patients/1' && route.request().method() === 'PUT') {
      attempts += 1;
      if (attempts === 1) await route.fulfill({status:401, json:{error:'La sesión expiró'}});
      else { saved = route.request().postDataJSON(); await route.fulfill({json:saved}); }
      return true;
    }
    if (path === '/api/auth/login') { await route.fulfill({json:{ok:true}}); return true; }
    return false;
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('button', {name:'Editar datos', exact:true}).click();
  const form = page.locator('[data-form="edit"]');
  await form.getByLabel('Alergias', {exact:true}).fill('Dato que debe conservarse');
  await form.getByRole('button', {name:'Guardar cambios'}).click();
  const login = page.getByRole('dialog', {name:'Tu sesión venció'});
  await expect(login).toBeVisible();
  await expect(form.getByLabel('Alergias', {exact:true})).toHaveValue('Dato que debe conservarse');
  await login.getByLabel('Contraseña').fill('clave-ficticia');
  await login.getByRole('button', {name:'Continuar', exact:true}).click();
  await expect(login).toHaveCount(0);
  expect(saved.allergies).toBe('Dato que debe conservarse');
  await expect(page).toHaveURL(/paciente.html\?id=1$/);
});
