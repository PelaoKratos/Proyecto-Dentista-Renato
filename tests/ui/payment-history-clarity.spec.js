const {test, expect} = require('@playwright/test');

test('distingue abonos de saldos, muestra fechas y exige editar los pagos parciales', async ({page}) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/patients') return route.fulfill({json:[{id:1,first_name:'Ana',last_name:'Prueba'}]});
    if (path === '/api/patient-treatments') return route.fulfill({json:[{id:7,patient_id:1,title:'Plan',final_price:100000,start_date:'2026-10-01'}]});
    if (path === '/api/payments') return route.fulfill({json:[
      {id:1,patient_id:1,patient_treatment_id:7,amount:10000,method:'Efectivo',payment_date:'2026-10-02'},
      {id:2,patient_id:1,patient_treatment_id:7,amount:20000,method:'Tarjeta',payment_date:'2026-10-03'}
    ]});
    return route.fulfill({json:[]});
  });
  await page.goto('/pagos.html');
  const row = page.locator('[data-payment-row="1"]');
  await expect(row).toContainText('02-10-2026');
  await expect(row.locator('[data-payment-amount]')).toBeHidden();
  await row.getByRole('button',{name:'Editar',exact:true}).click();
  await expect(row.locator('[data-payment-amount]')).toBeVisible();
  await row.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Saldos pendientes',exact:true}).click();
  await expect(page.locator('[data-pending-treatment]')).toHaveCount(1);
  await expect(page.locator('[data-pending-treatment]')).toContainText('$30.000');
  await expect(page.locator('[data-pending-treatment]')).toContainText('$70.000');
  await page.getByRole('button',{name:'Este mes',exact:true}).click();
  await expect(page.locator('#paymentDateFrom')).not.toHaveValue('');
  await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
  await expect(page.locator('#paymentDateFrom')).toHaveValue('');
});
