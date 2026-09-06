const { test, expect } = require('@playwright/test');

const pages = [
  { name: 'inicio', path: '/index.html', heading: 'Panel principal' },
  { name: 'pacientes', path: '/pacientes.html', heading: 'Gestion de pacientes' },
  { name: 'ficha-paciente', path: '/paciente.html?id=2', heading: /Mario Araya|Ficha/ },
  { name: 'tratamientos', path: '/tratamientos.html', heading: 'Planes clinicos' },
  { name: 'agenda', path: '/agenda.html', heading: 'Calendario de atenciones' },
  { name: 'radiografias', path: '/radiografias.html', heading: 'Biblioteca de adjuntos' },
  { name: 'pagos', path: '/pagos.html', heading: 'Control financiero' },
  { name: 'documentos', path: '/documentos.html?id=2', heading: 'Impresion clinica' },
  { name: 'respaldos', path: '/respaldos.html', heading: 'Copias locales' }
];

for (const appPage of pages) {
  test(`${appPage.name} carga sin errores visuales basicos`, async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto(appPage.path, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('heading', { name: appPage.heading }).first()).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow, 'La pagina no debe tener scroll horizontal global').toBeLessThanOrEqual(2);
    expect(consoleErrors, 'La consola del navegador no debe tener errores').toEqual([]);

    await page.screenshot({ path: testInfo.outputPath(`${appPage.name}.png`), fullPage: true });
  });
}

test('formulario de pacientes mantiene campos clave faciles de encontrar', async ({ page }) => {
  await page.goto('/pacientes.html#nuevo', { waitUntil: 'networkidle' });
  await expect(page.getByLabel('Nombres')).toBeVisible();
  await expect(page.getByLabel('Apellidos')).toBeVisible();
  await expect(page.getByLabel('Telefono')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar ficha' })).toBeVisible();
});

test('documentos genera vista previa imprimible desde un paciente', async ({ page }) => {
  await page.goto('/documentos.html?id=2', { waitUntil: 'networkidle' });
  await expect(page.locator('.print-sheet')).toContainText('Mario Araya');
  await page.locator('#documentTypeSelect').selectOption('budget');
  await expect(page.locator('.print-sheet')).toContainText('Presupuesto dental');
});

test('navegacion principal recorre todas las secciones', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'networkidle' });
  const links = [
    ['Pacientes', /Gestion de pacientes/],
    ['Tratamientos', /Planes clinicos/],
    ['Agenda', /Calendario de atenciones/],
    ['Radiografias', /Biblioteca de adjuntos/],
    ['Pagos', /Control financiero/],
    ['Documentos', /Impresion clinica/],
    ['Respaldos', /Copias locales/]
  ];

  for (const [label, heading] of links) {
    await page.getByRole('link', { name: new RegExp(label) }).click();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }
});

test('botones principales enfocan los formularios de trabajo', async ({ page }) => {
  await page.goto('/agenda.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Nueva cita' }).click();
  await expect(page.locator('#appointmentForm')).toBeInViewport();

  await page.goto('/tratamientos.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Crear tratamiento' }).click();
  await expect(page.locator('#newTreatmentForm')).toBeInViewport();

  await page.goto('/radiografias.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Adjuntar archivo' }).click();
  await expect(page.locator('#attachmentForm')).toBeInViewport();

  await page.goto('/pagos.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.locator('#paymentForm')).toBeInViewport();
});

test('endpoints principales mantienen conexion con el backend', async ({ request }) => {
  const endpoints = [
    '/api/health',
    '/api/dashboard-stats?date=2026-09-06',
    '/api/patients',
    '/api/patients/2/summary',
    '/api/treatment-catalog',
    '/api/patient-treatments',
    '/api/clinical-sessions',
    '/api/appointments',
    '/api/payments',
    '/api/attachments',
    '/api/backup-status',
    '/api/backups'
  ];

  for (const endpoint of endpoints) {
    const response = await request.get(endpoint);
    expect(response.ok(), `${endpoint} debe responder correctamente`).toBeTruthy();
  }
});
