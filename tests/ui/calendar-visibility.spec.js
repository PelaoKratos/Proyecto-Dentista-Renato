const { test, expect } = require('@playwright/test');

test('todas las citas se ven en mes, semana, día y agenda', async ({ page }) => {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const hours = ['09:00', '09:30', '10:00', '15:30', '16:00'];
  const appointments = hours.map((hour, index) => ({
    id: index + 1, patient_id: 1, starts_at: `${date} ${hour}`,
    reason: `Control ${index + 1}`, status: 'scheduled'
  }));
  appointments.push({
    id: 6, patient_id: 1, starts_at: `${date} 16:00`,
    reason: 'Segundo turno de las 16', status: 'scheduled'
  });
  appointments.reverse(); // Simula una respuesta del servidor en orden inverso al de creación.
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (path === '/api/appointments') return route.fulfill({ json: appointments });
    if (path === '/api/dashboard-stats') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.locator('.month-cell.today .calendar-appointment')).toHaveCount(6);
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.locator('.week-row').filter({ has: page.locator('time', { hasText: '09:30' }) }).locator('.calendar-appointment')).toHaveCount(1);
  await expect(page.locator('.week-row').filter({ has: page.locator('time', { hasText: '16:00' }) }).locator('.calendar-appointment')).toHaveCount(2);
  await expect(page.locator('.week-row').filter({ has: page.locator('time', { hasText: '16:00' }) }).locator('.calendar-appointment').first()).toContainText('Control 5');
  await page.locator('[data-calendar-view="day"]').click();
  await expect(page.locator('.day-grid .calendar-appointment')).toHaveCount(6);
  await expect(page.locator('.day-row').filter({ has: page.locator('time', { hasText: '16:00' }) }).locator('.calendar-appointment').first()).toContainText('Control 5');
  await page.goto('/agenda.html');
  await expect(page.locator('.appointment-editor')).toHaveCount(6);
  await expect(page.locator('.appointment-editor').nth(4)).toContainText('Control 5');
  await expect(page.locator('.appointment-editor').nth(5)).toContainText('Segundo turno de las 16');
  await expect(page.locator('.agenda-date-filter button.selected')).toContainText('6 citas');
});
