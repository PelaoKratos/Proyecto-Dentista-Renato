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
    if (path === '/api/patients') return route.fulfill({ json: [summary.patient] });
    if (path === '/api/patient-treatments') return route.fulfill({ json: summary.treatments });
    if (path.endsWith('/summary')) return route.fulfill({ json: summary });
    return route.fulfill({ json: [] });
  });
  await page.goto('/paciente.html?id=1');
  await expect(page.locator('.odontogram [data-tooth]')).toHaveCount(32);
  expect(await page.locator('.tooth-row.upper [data-tooth]').evaluateAll(items => items.map(item => Number(item.dataset.tooth)))).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
  expect(await page.locator('.tooth-row.lower [data-tooth]').evaluateAll(items => items.map(item => Number(item.dataset.tooth)))).toEqual(Array.from({ length: 16 }, (_, index) => index + 17));
  expect(await page.evaluate(() => window.PatientDomain.toothDescription('17', 'adult'))).toContain('inferior derecho');
  expect(await page.evaluate(() => window.PatientDomain.toothDescription('32', 'adult'))).toContain('inferior izquierdo');
  await expect(page.locator('.odontogram [data-tooth="19"] svg circle')).toHaveCount(1);
  await page.locator('[data-dentition-type="child"]').click();
  await expect(page.locator('.odontogram [data-tooth]')).toHaveCount(20);
  expect(await page.locator('.tooth-row.upper [data-tooth]').evaluateAll(items => items.map(item => Number(item.dataset.tooth)))).toEqual(Array.from({ length: 10 }, (_, index) => index + 1));
  expect(await page.locator('.tooth-row.lower [data-tooth]').evaluateAll(items => items.map(item => Number(item.dataset.tooth)))).toEqual(Array.from({ length: 10 }, (_, index) => index + 11));
  expect(await page.locator('.tooth-row.upper [data-tooth]').evaluateAll(items => items.map(item => item.dataset.letter))).toEqual('ABCDEFGHIJ'.split(''));
  expect(await page.locator('.tooth-row.lower [data-tooth]').evaluateAll(items => items.map(item => item.dataset.letter))).toEqual('TSRQPONMLK'.split(''));
  await expect(page.locator('.odontogram [data-tooth="1"]')).toHaveAttribute('aria-label', 'Pieza 1 (A)');
  await expect(page.locator('.odontogram [data-tooth="20"] svg')).toContainText('20K');
  await page.locator('.odontogram [data-tooth="20"]').click();
  await expect(page.locator('#toothNote strong')).toContainText('Pieza 20 (K)');
  await expect(page.locator('.odontogram [data-tooth="20"] svg circle')).toHaveCount(1);
  await expect(page.locator('.odontogram [data-tooth="19"] svg circle')).toHaveCount(0);
  await expect(page.locator('[data-dentition-type="child"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.patient-agenda').getByRole('button', { name: 'Agendar cita', exact: true }).click();
  await expect(page.getByLabel('Piezas dentales', { exact: true })).toHaveAttribute('placeholder', /hasta 20/);
  await page.locator('#calendarBookingForm [data-booking-close]').first().click();
  await page.locator('[data-dentition-type="adult"]').click();
  await expect(page.locator('.odontogram [data-tooth]')).toHaveCount(32);
  await expect(page.locator('.odontogram [data-tooth="19"] svg circle')).toHaveCount(1);
  expect(changes).toEqual([{ dentition_type: 'child' }, { dentition_type: 'adult' }]);
});
