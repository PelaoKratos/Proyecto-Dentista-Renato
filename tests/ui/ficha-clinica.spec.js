const { test, expect } = require('@playwright/test');

const summary = {
  patient: { id: 41, first_name: 'Ana', last_name: 'Pérez', rut: '12.345.678-9', phone: '912345678', email: 'ana@example.test', birth_date: '1980-04-10', address: 'Av. Centro 12', medical_notes: 'Antecedente', allergies: 'Penicilina' },
  treatments: [{id: 3, title: 'Endodoncia', tooth_code: '36', status: 'in_progress', final_price: 120000}],
  sessions: [{id: 8, patient_treatment_id: 3, session_date: '2026-09-01 10:00', reason: 'Control', diagnosis: 'Diagnostico principal', procedure_done: 'Texto privado de procedimiento', notes: 'Texto privado de notas', next_steps: 'Texto privado de proximos pasos'}],
  appointments: [], payments: [], attachments: []
};

test('la ficha exporta el documento compacto sin campos retirados de evolución', async ({ page }, testInfo) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({json: summary});
    if (path === '/api/patients') return route.fulfill({json: [summary.patient]});
    if (path === '/api/treatment-catalog') return route.fulfill({json: []});
    return route.fulfill({json: []});
  });
  await page.goto('/paciente.html?id=41');
  const contact = page.locator('.patient-contact-line');
  await expect(contact).toContainText('Av. Centro 12');
  await expect(contact).toContainText('ana@example.test');
  await expect(contact.locator('span')).toHaveCount(5);
  await expect(page.locator('.sidebar a[href="./radiografias.html"]')).toHaveCount(0);
  await expect(page.locator('.sidebar a[href="./documentos.html"]')).toHaveCount(0);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', {name:'Exportar ficha clinica'}).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');
  await expect.poll(() => popup.locator('.clinical-patient-inline p').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  const sheet = popup.locator('.print-sheet');
  await expect(sheet).toContainText('Ana Pérez');
  await expect(sheet).toContainText('Av. Centro 12');
  await expect(sheet).toContainText('En curso');
  await expect(sheet).toContainText('Diagnostico principal');
  await expect(sheet).not.toContainText('Texto privado de procedimiento');
  await expect(sheet).not.toContainText('Texto privado de notas');
  await expect(sheet).not.toContainText('Texto privado de proximos pasos');
  await expect(sheet.locator('.clinical-patient-inline p')).toHaveCount(3);
  await popup.screenshot({path:testInfo.outputPath('ficha-exportada.png'),fullPage:true});
});

test('la vista de Documentos usa la misma ficha clínica', async ({ page }, testInfo) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary')) return route.fulfill({json: summary});
    if (path === '/api/patients') return route.fulfill({json: [summary.patient]});
    return route.fulfill({json: []});
  });
  await page.goto('/documentos.html?id=41&type=clinical');
  await expect(page.locator('#documentPreview')).toContainText('En curso');
  await expect(page.locator('#documentPreview')).not.toContainText('Texto privado de notas');
  await page.screenshot({path:testInfo.outputPath('ficha-vista-previa.png'),fullPage:true});
});
