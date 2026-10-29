async function choosePatient(dialog, query = 'Ana') {
  await dialog.getByLabel('Buscar paciente por nombre o RUT').fill(query);
  await dialog.locator('[data-booking-pick-patient]').first().click();
}
async function sharedBookingRoutes(route, path, summary, catalog = []) {
  if (route.request().method() !== 'GET') return false;
  const data = path === '/api/patients' ? [summary.patient] : path === '/api/patient-treatments' ? summary.treatments
    : path === '/api/appointments' ? summary.appointments : path === '/api/treatment-catalog' ? catalog
      : path === '/api/health' ? { features: { itemized_treatments: true } } : undefined;
  if (data === undefined) return false;
  await route.fulfill({ json: data }); return true;
}
module.exports = { choosePatient, sharedBookingRoutes };
