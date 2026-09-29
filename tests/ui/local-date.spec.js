const { test, expect } = require('@playwright/test');

test.use({ timezoneId: 'America/Santiago' });

test('las fechas clinicas usan el dia local de Chile', async ({ page }) => {
  await page.goto('/index.html');
  const date = await page.evaluate(() => DentalAPI.localDateString(new Date('2026-09-29T01:30:00Z')));
  expect(date).toBe('2026-09-28');
});
