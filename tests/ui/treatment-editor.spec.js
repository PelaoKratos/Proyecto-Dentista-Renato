const { test, expect } = require('@playwright/test');

test('el editor compartido conserva abonos y guarda nombre y presupuesto juntos desde la ficha', async ({ page }, testInfo) => {
  const headers = { Origin: 'http://127.0.0.1:8765' };
  const response = await page.request.post('/api/patients', { headers, data: { first_name: 'Editor', last_name: 'Prueba' } });
  expect(response.ok()).toBeTruthy();
  const patient = await response.json();
  const created = await page.request.post('/api/patient-treatments', { headers, data: { patient_id: patient.id, title: 'Plan original',
    procedures: [{ name: 'Resina', price: 10000, tooth_code: '1,2' }, { name: 'Limpieza', price: 20000 }] } });
  expect(created.ok()).toBeTruthy();
  const treatment = await created.json();
  const lines = JSON.parse(treatment.procedure_items_json);
  expect((await page.request.post('/api/payments', { headers, data: { patient_id: patient.id, patient_treatment_id: treatment.id,
    amount: 5000, payment_date: '2026-10-29', procedure_allocations: [{ line_id: lines[0].line_id, amount: 5000 }] } })).ok()).toBeTruthy();
  await page.goto(`/paciente.html?id=${patient.id}`);
  await page.getByRole('tab', { name: 'Plan y presupuesto', exact: true }).click();
  const card = page.locator(`[data-patient-treatment-card="${treatment.id}"]`);
  await expect(card).toContainText('Saldo pendiente $25.000');
  await expect(card.locator('.treatment-card-details')).not.toHaveAttribute('open', '');
  await card.getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  const editor = page.locator('#treatmentProceduresDialog');
  await editor.getByLabel('Nombre del tratamiento', { exact: true }).fill('Plan actualizado');
  const first = editor.locator('.treatment-procedure-editor').first();
  await first.locator('[data-procedure-price]').fill('4000');
  await editor.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(editor.locator('#treatmentProceduresStatus')).toContainText('abonos asignados');
  const before = await (await page.request.get(`/api/patients/${patient.id}/summary`)).json();
  expect(before.treatments[0].title).toBe('Plan original');
  expect(before.treatments[0].final_price).toBe(30000);
  await first.locator('[data-procedure-price]').fill('12000');
  await editor.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(card).toContainText('Plan actualizado');
  await expect(card).toContainText('Saldo pendiente $27.000');
  await page.goto('/tratamientos.html');
  await page.locator('#treatmentSearch').fill('Plan actualizado');
  await page.locator(`[data-treatment-card="${treatment.id}"]`).getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  await expect(editor.getByLabel('Nombre del tratamiento', { exact: true })).toHaveValue('Plan actualizado');
  await expect(editor.locator('.treatment-procedure-editor').first().locator('[data-procedure-price]')).toHaveValue('12000');
  await editor.screenshot({ path: testInfo.outputPath('editor-compartido.png') });
});

test('muchos procedimientos se desplazan dentro del editor en escritorio pequeño', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const patient = { id: 1, first_name: 'Ana', last_name: 'Prueba' };
  const treatment = { id: 7, patient_id: 1, title: 'Plan con varios procedimientos', status: 'planned', final_price: 120000,
    procedure_items_json: JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ line_id: `line-${index}`, name: `Procedimiento ${index + 1}`, price: 10000, tooth_code: '1,2' }))) };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/tratamientos.html');
  await expect(page.locator('.treatment-sidebar')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('tratamientos-compactos.png') });
  await page.getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  const editor = page.locator('#treatmentProceduresDialog');
  const dimensions = await editor.evaluate(element => {
    const body = element.querySelector('.shared-treatment-body');
    const rect = element.getBoundingClientRect();
    return { fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      scrolls: body.scrollHeight > body.clientHeight, noHorizontalOverflow: body.scrollWidth <= body.clientWidth + 1 };
  });
  expect(dimensions).toEqual({ fits: true, scrolls: true, noHorizontalOverflow: true });
  await expect(editor.getByRole('button', { name: 'Guardar tratamiento', exact: true })).toBeInViewport();
  await editor.locator('[data-procedure-name]').last().scrollIntoViewIfNeeded();
  await expect(editor.locator('[data-procedure-name]').last()).toBeInViewport();
  await editor.screenshot({ path: testInfo.outputPath('editor-escritorio-pequeno.png') });
});
