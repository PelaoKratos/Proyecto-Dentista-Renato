# Backend local

## Stack

- Python 3.12.
- Servidor HTTP de la libreria estandar.
- SQLite local en `data/consulta_dental.sqlite3`.
- Adjuntos en carpetas locales bajo `media/pacientes/`.
- Respaldos ZIP bajo `backups/`.

No requiere instalar paquetes externos.

## Ejecutar

```powershell
& "C:\Users\amaro\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" .\backend\server.py
```

Luego abrir:

```text
http://127.0.0.1:8000
```

## Endpoints iniciales

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/health` | Estado del servidor |
| GET | `/api/auth/status` | Estado de configuracion y sesion |
| POST | `/api/auth/setup` | Define la clave inicial de administrador |
| POST | `/api/auth/login` | Inicia una sesion de 30 minutos |
| POST | `/api/auth/logout` | Cierra la sesion actual |
| GET | `/api/dashboard-stats?date=YYYY-MM-DD` | Metricas agregadas para el panel principal |
| GET | `/api/patients` | Listado de pacientes |
| GET | `/api/patients?search=texto` | Buscar pacientes |
| POST | `/api/patients` | Crear paciente |
| GET | `/api/patients/{id}` | Ver paciente |
| PUT | `/api/patients/{id}` | Actualizar paciente |
| GET | `/api/patients/{id}/summary` | Ficha completa del paciente |
| GET/POST | `/api/treatment-catalog` | Catalogo de tratamientos |
| GET/POST | `/api/patient-treatments` | Tratamientos por paciente |
| GET/POST | `/api/clinical-sessions` | Evoluciones clinicas; inicia el tratamiento vinculado en la misma transaccion |
| POST | `/api/appointments/{id}/attend` | Registra la evolucion y marca la cita como atendida en una sola transaccion |
| GET/POST | `/api/appointments` | Agenda |
| GET/POST | `/api/payments` | Pagos |
| GET/POST | `/api/attachments` | Adjuntos/radiografias |
| GET | `/api/backup-status` | Estado de base, adjuntos y ultimo respaldo |
| POST | `/api/backups` | Crear respaldo ZIP |

## Validaciones y seguridad

El backend valida los datos antes de escribirlos en SQLite: identificadores positivos, fechas y horas, fin posterior al inicio de una cita, montos finitos no negativos, longitudes máximas de texto, formato de correo y relaciones entre paciente, tratamiento, sesión, pago y adjunto. Los conflictos con restricciones de la base responden HTTP 409; los errores internos no exponen detalles de implementación.

Las escrituras HTTP aceptan únicamente solicitudes del mismo origen local. El servidor publica las páginas y recursos de la aplicación, pero no expone carpetas privadas como `data/`, `backups/`, `backend/` o `docs/`.

Los adjuntos admitidos son JPG, PNG, GIF, WEBP y PDF, con validación de firma y un máximo de 25 MB por archivo. Documentos deben ser PDF; radiografías y fotos deben ser imágenes. El MIME se determina desde el contenido.

El respaldo usa una copia consistente de SQLite. Las copias automaticas semanales incluyen base y adjuntos; las manuales pueden omitir adjuntos. Cada ZIP incorpora metadatos y hashes SHA-256 y se restaura en una carpeta temporal para comprobar SQLite antes de publicarlo.

## Eliminaciones

| Metodo | Ruta | Uso |
| --- | --- | --- |
| DELETE | `/api/patients/{id}` | Desactiva el paciente sin borrar su historia clinica |
| DELETE | `/api/attachments/{id}` | Elimina el registro del adjunto en la base |

Los pacientes se desactivan con eliminacion logica para proteger la historia clinica.

## Pruebas

```powershell
& "C:\Users\amaro\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m unittest discover
```

## Adjuntos

Para subir archivos, enviar `multipart/form-data` a `/api/attachments` con:

- `patient_id`
- `file`
- `file_type`: `radiography`, `photo`, `document` u `other`
- `category`
- `notes`
- `taken_at`

El servidor limita el tamaño a 25 MB y valida extensión, firma y compatibilidad entre tipo y formato. Guarda el archivo con un nombre aleatorio en:

```text
media/pacientes/000002/radiografias/
```

Y registra los metadatos en la tabla `attachments`.

## Consultas acotadas de agenda y pagos

Las fechas se interpretan en hora local de la consulta. Los filtros inválidos devuelven HTTP 400.

- `GET /api/appointments?date_from=2026-10-26&date_to=2026-11-01`: ambos días incluidos, orden por inicio e identificador. Admite `status`, `patient_id` y `patient_treatment_id`.
- `GET /api/appointments?overdue_before=2026-10-29T12:00:00`: citas confirmadas anteriores al límite, incluidas las de días pasados. Se consulta independientemente del calendario visible.
- `GET /api/payments?page=1&page_size=20`: objeto con `items`, `total`, `page`, `page_size` y `total_pages`. Máximo 20 registros; una página fuera de rango se ajusta a la última disponible. Una consulta vacía conserva página 1.
- Pagos paginados admite `view=payments|balances`, `state=pending|partial|paid|unlinked`, `date_from`, `date_to`, `patient_id` y `patient_treatment_id` (identificador o `none`). En `balances`, la fecha corresponde al inicio del tratamiento; en `payments`, a la fecha del abono. El estado se calcula con todos los pagos del tratamiento.
- `GET /api/payments?summary=1&date=2026-10-29`: indicadores del día/mes y un resumen de montos y asignaciones por paciente/tratamiento. No contiene los movimientos ni notas individuales.
- `GET /api/payments?patient_treatment_id=7`: movimientos de un tratamiento para corregir una asignación. La consulta previa sin `page` ni `summary` conserva la respuesta en arreglo para los consumidores existentes.

Los filtros usan parámetros SQL. Los índices se crean al iniciar; no se requiere copiar ni reemplazar la base. Total y registros de cada página se leen en la misma transacción. Reiniciar la aplicación activa estas consultas si el servidor seguía abierto con una versión anterior.
