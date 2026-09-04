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
| GET | `/api/dashboard-stats?date=YYYY-MM-DD` | Metricas agregadas para el panel principal |
| GET | `/api/patients` | Listado de pacientes |
| GET | `/api/patients?search=texto` | Buscar pacientes |
| POST | `/api/patients` | Crear paciente |
| GET | `/api/patients/{id}` | Ver paciente |
| PUT | `/api/patients/{id}` | Actualizar paciente |
| GET | `/api/patients/{id}/summary` | Ficha completa del paciente |
| GET/POST | `/api/treatment-catalog` | Catalogo de tratamientos |
| GET/POST | `/api/patient-treatments` | Tratamientos por paciente |
| GET/POST | `/api/clinical-sessions` | Evoluciones clinicas |
| GET/POST | `/api/appointments` | Agenda |
| GET/POST | `/api/payments` | Pagos |
| GET/POST | `/api/attachments` | Adjuntos/radiografias |
| GET | `/api/backup-status` | Estado de base, adjuntos y ultimo respaldo |
| POST | `/api/backups` | Crear respaldo ZIP |

## Validaciones iniciales

El backend ahora valida datos antes de escribir en SQLite:

- Paciente: requiere nombres y apellidos al crear.
- Tratamientos: valida estados `planned`, `in_progress`, `completed`, `cancelled`.
- Agenda: valida fechas `YYYY-MM-DD HH:MM`.
- Pagos: valida fecha, monto numerico y monto no negativo.
- Adjuntos: valida tipo `radiography`, `photo`, `document` u `other`.

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

El servidor guarda el archivo en:

```text
media/pacientes/000002/radiografias/
```

Y registra los metadatos en la tabla `attachments`.
