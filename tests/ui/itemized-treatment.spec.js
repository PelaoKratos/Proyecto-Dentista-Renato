const { test, expect } = require('@playwright/test');

test('la ficha y el listado muestran el desglose sin permitir alterar el total calculado', async ({ page }) => {
  const patient = { id: 1, first_name: 'Ana', last_name: 'Prueba', dentition_type: 'adult' };
  const treatment = { id: 7, patient_id: 1, title: 'Plan integral', tooth_code: '4,5', status: 'in_progress',
    estimated_price: 100000, final_price: 95000, total_discount_type: 'amount', total_discount_value: 5000,
    procedure_items_json: JSON.stringify([
      { name: 'Endodoncia', tooth_code: '4', price: 80000, discount_type: 'amount', discount_value: 0 },
      { name: 'Resina', tooth_code: '5', price: 20000, discount_type: 'amount', discount_value: 0 }
    ]) };
  let saved;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patient-treatments/7/procedures' && route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      Object.assign(treatment, { title: saved.title, procedure_items_json: JSON.stringify(saved.procedures) });
      return route.fulfill({ json: treatment });
    }
    if (path === '/api/patients/1/summary') return route.fulfill({ json: { patient, treatments: [treatment], appointments: [], payments: [], sessions: [], attachments: [] } });
    if (path === '/api/patients') return route.fulfill({ json: [patient] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: [treatment] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('tab', { name: 'Plan y presupuesto' }).click();
  const card = page.locator('[data-patient-treatment-card="7"]');
  await expect(card).toContainText('Endodoncia');
  await expect(card).toContainText('Resina');
  await card.getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  const editor = page.locator('#treatmentProceduresDialog');
  await expect(editor.locator('[name="final_price"]')).toBeHidden();
  await editor.getByLabel('Nombre del tratamiento', { exact: true }).fill('Plan integral actualizado');
  await editor.getByRole('button', { name: 'Guardar tratamiento', exact: true }).click();
  await expect(editor).toBeHidden();
  expect(saved.title).toBe('Plan integral actualizado');
  expect(saved).not.toHaveProperty('final_price');
  expect(saved).not.toHaveProperty('tooth_code');
  expect(saved.procedures).toHaveLength(2);
  await page.goto('/tratamientos.html');
  const listing = page.locator('[data-treatment-card="7"]');
  await expect(listing).toContainText('2 procedimientos');
  await expect(listing).toContainText('Resina');
  await listing.getByRole('button', { name: 'Editar tratamiento', exact: true }).click();
  await expect(editor.locator('[name="final_price"]')).toBeHidden();
  await expect(editor.locator('#treatmentProceduresTotal')).toContainText('95.000');
});
