const { test, expect } = require('@playwright/test');

test('eliminar tratamiento desde historial quita su saldo y lo oculta en pagos', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Prueba', dentition_type: 'adult' },
    treatments: [{ id: 7, patient_id: 1, title: 'Resina de prueba', tooth_code: '19', status: 'planned', final_price: 100000 }],
    appointments: [], payments: [], sessions: [], attachments: []
  };
  const deletions = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'DELETE' && path === '/api/patient-treatments/7') {
      deletions.push(path);
      summary.treatments = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/patients/1/summary') return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  const card = page.locator('[data-treatment-history="7"]');
  await expect(card).toContainText('Resina de prueba');
  await card.getByText('Ver historial y notas').click();
  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Eliminar tratamiento' }).click();
  await expect(page.locator('[data-treatment-history="7"]')).toHaveCount(0);
  expect(deletions).toEqual(['/api/patient-treatments/7']);
  await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
  await expect(page.locator('#payments')).toContainText('No hay tratamientos para calcular saldos.');
});
