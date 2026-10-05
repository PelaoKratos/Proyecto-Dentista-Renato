const { test, expect } = require('@playwright/test');

test('las secciones de la ficha se pueden recorrer con teclado', async ({ page }) => {
  await page.goto('/paciente.html?id=2', { waitUntil: 'networkidle' });
  const agenda = page.getByRole('tab', { name: 'Agenda y piezas' });
  const history = page.getByRole('tab', { name: 'Historial' });
  await expect(agenda).toHaveAttribute('aria-selected', 'true');
  await agenda.focus();
  await agenda.press('ArrowRight');
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(agenda).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tabpanel', { name: 'Historial' })).toBeVisible();
  await history.press('Home');
  await expect(agenda).toBeFocused();
});

test('al cerrar el formulario el foco vuelve al boton que lo abrio', async ({ page }) => {
  await page.goto('/paciente.html?id=2', { waitUntil: 'networkidle' });
  const opener = page.locator('.patient-agenda [data-action="appointment"]');
  await opener.click();
  const drawer = page.getByRole('region', { name: 'Agendar cita' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('input, select, textarea').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.locator('.sidebar [aria-current="page"]')).toHaveCount(1);
});

const mainPages = [
  '/index.html', '/pacientes.html', '/paciente.html?id=2', '/tratamientos.html',
  '/procedimientos.html', '/agenda.html', '/pagos.html', '/respaldos.html'
];

for (const path of mainPages) {
  test(`${path} expone controles y referencias accesibles`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    const issues = await page.evaluate(() => {
      const result = [];
      const byId = new Map();
      document.querySelectorAll('[id]').forEach((element) => {
        if (byId.has(element.id)) result.push(`ID duplicado: ${element.id}`);
        byId.set(element.id, element);
      });
      document.querySelectorAll('[aria-labelledby], [aria-controls]').forEach((element) => {
        for (const attribute of ['aria-labelledby', 'aria-controls']) {
          const ids = (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean);
          ids.forEach((id) => { if (!document.getElementById(id)) result.push(`${attribute} sin destino: ${id}`); });
        }
      });
      document.querySelectorAll('button, input, select, textarea').forEach((element) => {
        if (element.closest('[hidden], [aria-hidden="true"]') || element.type === 'hidden') return;
        const visible = element.getClientRects().length > 0;
        if (!visible) return;
        const name = element.getAttribute('aria-label') || element.getAttribute('title') ||
          (element.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim() ||
          Array.from(element.labels || []).map((label) => label.textContent).join(' ').trim() ||
          (element.tagName === 'BUTTON' ? element.textContent.trim() : '');
        if (!name) result.push(`Control sin nombre: ${element.outerHTML.slice(0, 100)}`);
      });
      return result;
    });
    expect(issues, path).toEqual([]);
  });
}

test('registrar un abono desde la ficha conserva su tratamiento asociado', async ({ page }, testInfo) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba' },
    treatments: [
      { id: 7, patient_id: 1, title: 'Endodoncia', status: 'in_progress', final_price: 100 },
      { id: 8, patient_id: 1, title: 'Restauración', status: 'planned', final_price: 200 }
    ],
    appointments: [], sessions: [], payments: [], attachments: []
  };
  let payment;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/payments' && route.request().method() === 'POST') {
      payment = route.request().postDataJSON();
      summary.payments.push({ id: 9, ...payment });
      return route.fulfill({ json: { id: 9, ...payment } });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Pagos' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const form = page.locator('.patient-payment-form');
  await expect(form.locator('[data-payment-treatment-balance]')).toContainText('100');
  await expect(form.locator('[data-payment-patient-balance]')).toContainText('300');
  await form.locator('select[name="patient_treatment_id"]').selectOption('8');
  await expect(form.locator('[data-payment-treatment-balance]')).toContainText('200');
  await expect(form.locator('input[name="amount"]')).toHaveValue('200');
  await form.locator('select[name="patient_treatment_id"]').selectOption('7');
  await expect(form.locator('input[name="amount"]')).toHaveValue('100');
  await expect(form.locator('.patient-payment-notes')).not.toHaveAttribute('open', '');
  await form.screenshot({ path: testInfo.outputPath('paciente-pago.png') });
  await form.locator('.patient-payment-notes summary').click();
  await form.getByLabel('Notas').fill('Abono de control');
  await form.getByLabel('Monto').fill('50');
  await form.getByRole('button', { name: 'Guardar pago' }).click();
  await expect.poll(() => summary.payments.length).toBe(1);
  expect(payment).toMatchObject({ patient_id: 1, patient_treatment_id: 7, amount: 50, notes: 'Abono de control' });
  await expect(page.getByRole('tabpanel', { name: 'Pagos' })).toContainText('Endodoncia');
});
