const { test, expect } = require('@playwright/test');

test('Pagos consulta páginas de 20 y conserva totales y saldos del historial completo', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00'));
  const headers = { Origin: 'http://127.0.0.1:8765' };
  const patientResponse = await page.request.post('/api/patients', { headers, data: { first_name: 'Paginacion', last_name: 'Prueba' } });
  expect(patientResponse.ok()).toBeTruthy();
  const patient = await patientResponse.json();
  const treatmentResponse = await page.request.post('/api/patient-treatments', { headers, data: { patient_id: patient.id, title: 'Plan de paginación', start_date: '2026-10-01', procedures: [{ name: 'Resina', price: 100000 }] } });
  expect(treatmentResponse.ok()).toBeTruthy();
  const treatment = await treatmentResponse.json();
  for (let index = 0; index < 45; index += 1) {
    const response = await page.request.post('/api/payments', { headers, data: { patient_id: patient.id, patient_treatment_id: treatment.id, amount: 100, method: 'Efectivo', payment_date: index < 25 ? '2026-10-01' : '2026-10-29' } });
    expect(response.ok()).toBeTruthy();
  }
  const summary = await (await page.request.get('/api/payments?summary=1&date=2026-10-29')).json();
  const requests = [];
  page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/payments') requests.push(new URL(request.url())); });
  await page.goto('/pagos.html');
  await page.locator('#paymentPatientFilter').selectOption(String(patient.id));
  await expect(page.locator('#paymentResultsCount')).toContainText('de 45 abonos');
  await expect(page.locator('[data-payment-row]')).toHaveCount(20);
  const firstIds = await page.locator('[data-payment-row]').evaluateAll(rows => rows.map(row => row.dataset.paymentRow));
  const metrics = await page.locator('[data-payment-metric]').allTextContents();
  await expect(page.locator('[data-payment-metric="month"]')).toContainText(Number(summary.metrics.month_total).toLocaleString('es-CL'));
  await page.locator('#paymentsPaginationTop').getByRole('button', { name: 'Pagina siguiente', exact: true }).click();
  await expect(page.locator('#paymentResultsCount')).toContainText('Página 2 de 3');
  const secondIds = await page.locator('[data-payment-row]').evaluateAll(rows => rows.map(row => row.dataset.paymentRow));
  expect(firstIds.some(id => secondIds.includes(id))).toBe(false);
  expect(await page.locator('[data-payment-metric]').allTextContents()).toEqual(metrics);
  await page.locator('#paymentsPaginationBottom').getByRole('button', { name: 'Pagina siguiente', exact: true }).click();
  await expect(page.locator('#paymentResultsCount')).toContainText('Página 3 de 3');
  await expect(page.locator('[data-payment-row]')).toHaveCount(5);
  await page.locator('#paymentDateFrom').fill('2026-10-29');
  await page.locator('#paymentDateFrom').dispatchEvent('change');
  await expect(page.locator('#paymentResultsCount')).toContainText('de 20 abonos');
  await expect(page.locator('#paymentsPaginationTop')).toBeHidden();
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page.locator('#paymentPatientFilter').selectOption(String(patient.id));
  await page.getByRole('button', { name: 'Saldos pendientes', exact: true }).click();
  const balance = page.locator(`[data-pending-treatment="${treatment.id}"]`);
  await expect(balance).toContainText('$4.500');
  await expect(balance).toContainText('$95.500');
  expect(requests.every(url => url.searchParams.has('summary') || url.searchParams.has('page'))).toBe(true);
  expect(requests.some(url => url.searchParams.get('page') === '3')).toBe(true);
  expect((await page.request.get('/api/payments?page=0')).status()).toBe(400);
});

test('el calendario consulta el período visible y conserva atrasadas en una consulta separada', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00'));
  const requests = [];
  const rows = [
    { id: 1, patient_id: 1, starts_at: '2026-09-01 09:00', status: 'scheduled', reason: 'Pendiente anterior' },
    { id: 2, patient_id: 1, starts_at: '2026-10-29 10:00', status: 'scheduled', reason: 'Cita de hoy' },
    { id: 3, patient_id: 1, starts_at: '2026-11-05 10:00', status: 'scheduled', reason: 'Semana siguiente' }
  ];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/appointments') {
      requests.push(url);
      const query = url.searchParams;
      const result = query.has('overdue_before') ? rows.filter(row => row.starts_at.replace(' ', 'T') < query.get('overdue_before'))
        : rows.filter(row => row.starts_at.slice(0, 10) >= query.get('date_from') && row.starts_at.slice(0, 10) <= query.get('date_to'));
      return route.fulfill({ json: result });
    }
    if (url.pathname === '/api/patients') return route.fulfill({ json: [{ id: 1, first_name: 'Ana', last_name: 'Prueba' }] });
    if (url.pathname === '/api/dashboard-stats') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await expect(page.locator('#dashboardCalendar')).toContainText('Cita de hoy');
  await expect(page.locator('#todayFollowupsList')).toContainText('Pendiente anterior');
  await page.locator('#calendarNext').click();
  await expect(page.locator('#dashboardCalendar')).toContainText('Semana siguiente');
  await expect(page.locator('#dashboardCalendar')).not.toContainText('Cita de hoy');
  await expect(page.locator('#todayFollowupsList')).toContainText('Pendiente anterior');
  expect(requests.some(url => url.searchParams.get('date_from') === '2026-10-26' && url.searchParams.get('date_to') === '2026-11-01')).toBe(true);
  expect(requests.some(url => url.searchParams.get('date_from') === '2026-11-02')).toBe(true);
  expect(requests.every(url => url.searchParams.has('date_from') || url.searchParams.has('overdue_before'))).toBe(true);
  await page.goto('/agenda.html');
  await expect(page.locator('#dayTimeline')).toContainText('Cita de hoy');
  await page.locator('#agendaNext').click();
  await expect(page.locator('#dayTimeline')).toContainText('Semana siguiente');
});

test('una respuesta anterior lenta no reemplaza la última semana elegida', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/appointments') {
      const start = url.searchParams.get('date_from');
      if (start === '2026-11-02') await new Promise(resolve => setTimeout(resolve, 400));
      return route.fulfill({ json: start === '2026-11-09' ? [{ id: 1, patient_id: 1, starts_at: '2026-11-12 10:00', status: 'scheduled', reason: 'Semana más reciente' }] : [] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/index.html');
  await expect(page.locator('#dashboardCalendar [data-calendar-book]').first()).toBeVisible();
  const previousWeek = page.waitForResponse(response => new URL(response.url()).searchParams.get('date_from') === '2026-11-02');
  await page.locator('#calendarNext').click();
  await page.locator('#calendarNext').click();
  await expect(page.locator('#dashboardCalendar')).toContainText('Semana más reciente');
  await expect.poll(() => page.locator('#dashboardCalendar').getAttribute('aria-busy')).toBe('false');
  await previousWeek;
  await expect(page.locator('#dashboardCalendar')).toContainText('Semana más reciente');
});
