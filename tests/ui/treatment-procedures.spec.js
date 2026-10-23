const { test, expect } = require('@playwright/test');

test('completa el presupuesto de un tratamiento existente sin crear otra cita', async ({ page }) => {
  let saved;
  let appointmentsPosted = 0;
  let treatment = { id: 25, patient_id: 13, title: 'Limpieza y endodoncia', status: 'completed',
    estimated_price: null, final_price: null, procedure_items_json: null };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { ok: true, features: { itemized_treatments: true } } });
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 13, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/treatment-catalog') return route.fulfill({ json: [
      { id: 2, name: 'Limpieza', default_price: 65000 }, { id: 3, name: 'Endodoncia', default_price: 280000 }] });
    if (path === '/api/patient-treatments/25/procedures' && route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      treatment = { ...treatment, estimated_price: 345000, final_price: 296400,
        procedure_items_json: JSON.stringify(saved.procedures) };
      return route.fulfill({ json: treatment });
    }
    if (path === '/api/appointments' && route.request().method() === 'POST') appointmentsPosted += 1;
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/tratamientos.html');
  await page.locator('#treatmentFilter').selectOption('all');
  await page.getByRole('button', { name: 'Ingresar procedimientos' }).click();
  const dialog = page.locator('#treatmentProceduresDialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#treatmentProcedureCatalog').selectOption('2');
  await dialog.getByRole('button', { name: 'Agregar procedimiento' }).click();
  await dialog.locator('.treatment-procedure-editor').nth(0).locator('[data-procedure-teeth]').fill('3,4');
  await dialog.locator('.treatment-procedure-editor').nth(0).locator('[data-procedure-discount-value]').fill('5000');
  await dialog.locator('#treatmentProcedureCatalog').selectOption('3');
  await dialog.getByRole('button', { name: 'Agregar procedimiento' }).click();
  const second = dialog.locator('.treatment-procedure-editor').nth(1);
  await second.locator('[data-procedure-teeth]').fill('5');
  await second.locator('[data-procedure-discount-type]').selectOption('percent');
  await second.locator('[data-procedure-discount-value]').fill('10');
  await dialog.locator('[name="total_discount_type"]').selectOption('percent');
  await dialog.locator('[name="total_discount_value"]').fill('5');
  await expect(dialog.locator('#treatmentProceduresTotal')).toHaveText('Total: $296.400');
  await dialog.getByRole('button', { name: 'Guardar presupuesto' }).click();
  await expect(dialog).toBeHidden();
  expect(saved.procedures.map(item => [item.name, item.tooth_code, item.price, item.discount_type, item.discount_value]))
    .toEqual([['Limpieza', '3,4', 65000, 'amount', 5000], ['Endodoncia', '5', 280000, 'percent', 10]]);
  expect(saved.total_discount_type).toBe('percent');
  expect(saved.total_discount_value).toBe(5);
  expect(appointmentsPosted).toBe(0);
});
