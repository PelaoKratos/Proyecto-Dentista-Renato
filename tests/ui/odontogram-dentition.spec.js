const { test, expect } = require('@playwright/test');

test('la ficha guarda el odontograma adulto o infantil y muestra las piezas correctas', async ({ page }) => {
  const summary = {
    patient: { id: 1, first_name: 'Ana', last_name: 'Rios', dentition_type: 'adult' },
    treatments: [
      { id: 1, patient_id: 1, title: 'Adulto', dentition_type: 'adult', tooth_code: '19', status: 'planned' },
      { id: 2, patient_id: 1, title: 'Infantil', dentition_type: 'child', tooth_code: '20', status: 'completed' }
    ],
    appointments: [], payments: [], sessions: [], attachments: []
  };
  const changes = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients/1' && route.request().method() === 'PUT') {
      const data = route.request().postDataJSON();
      changes.push(data);
      Object.assign(summary.patient, data);
      return route.fulfill({ json: summary.patient });
    }
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await expect(page.locator('.odontogram [data-tooth]')).toHaveCount(32);
  await expect(page.locator('.odontogram [data-tooth="19"] svg circle')).toHaveCount(1);
  await page.locator('[data-dentition-type="child"]').click();
  await expect(page.locator('.odontogram [data-tooth]')).toHaveCount(20);
  await expect(page.locator('.odontogram [data-tooth="20"] svg circle')).toHaveCount(1);
  await expect(page.locator('.odontogram [data-tooth="19"] svg circle')).toHaveCount(0);
  await expect(page.locator('[data-dentition-type="child"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.patient-agenda').getByRole('button', { name: 'Agendar cita', exact: true }).click();
  await expect(page.getByLabel('1. Piezas dentales')).toHaveAttribute('placeholder', /hasta 20/);
  await page.locator('#actionDrawer [data-action-close]').first().click();
  await page.locator('[data-dentition-type="adult"]').click();
  await expect(page.locator('.odontogram [data-tooth]')).toHaveCount(32);
  await expect(page.locator('.odontogram [data-tooth="19"] svg circle')).toHaveCount(1);
  expect(changes).toEqual([{ dentition_type: 'child' }, { dentition_type: 'adult' }]);
});
