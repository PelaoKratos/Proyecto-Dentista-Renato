# Flujo funcional revisado

## Pantallas principales

- Inicio: carga metricas, agenda del dia, pacientes, ficha activa y adjuntos recientes.
- Pacientes: permite buscar, listar, exportar y crear fichas.
- Ficha paciente: centraliza datos clinicos, odontograma, evoluciones, tratamientos, radiografias, pagos, agenda y documentos.
- Tratamientos: permite revisar tratamientos activos/finalizados y crear nuevos planes clinicos.
- Agenda: permite ver jornada, filtrar estados, crear citas y abrir atencion desde una cita.
- Radiografias: permite listar, filtrar, previsualizar, adjuntar y eliminar registros de adjuntos.
- Pagos: permite registrar abonos, asociarlos a tratamientos y revisar saldos.
- Documentos: genera ficha clinica, presupuesto, comprobante y consentimiento imprimibles.
- Respaldos: crea ZIP local con base SQLite y carpeta `media/`, y muestra estado real de respaldo.

## Conexiones API cubiertas

- `/api/health`
- `/api/dashboard-stats`
- `/api/patients`
- `/api/patients/{id}/summary`
- `/api/treatment-catalog`
- `/api/patient-treatments`
- `/api/clinical-sessions`
- `/api/appointments`
- `/api/payments`
- `/api/attachments`
- `/api/backup-status`
- `/api/backups`

## Validacion automatizada

Playwright revisa las pantallas en escritorio y movil, comprueba errores de consola, desbordes horizontales, navegacion principal, botones de trabajo y conexion con endpoints principales.

El backend conserva pruebas unitarias para validaciones y operaciones de base de datos.

## Acceso local

El acceso directo del Escritorio ejecuta `scripts/open-app.ps1`. Ese script verifica el servidor local, lo inicia en segundo plano si hace falta y abre `http://127.0.0.1:8000/`.
