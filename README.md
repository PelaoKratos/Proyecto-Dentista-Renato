# Consulta Dental Renato

Aplicacion web local para gestionar una consulta dental en un solo computador.

Permite administrar pacientes, tratamientos, evoluciones clinicas, agenda, pagos, radiografias/documentos adjuntos y respaldos locales.

## Stack

- Frontend: HTML, CSS y JavaScript sin framework.
- Backend: Python con servidor HTTP de la libreria estandar.
- Base de datos: SQLite local.
- Archivos adjuntos: carpeta local `media/`.
- Respaldos: archivos ZIP en `backups/`.

No requiere instalar paquetes externos.

## Ejecutar en Windows

Desde PowerShell, en la carpeta del proyecto:

```powershell
.\iniciar_backend.ps1
```

Luego abrir:

```text
http://127.0.0.1:8000/
```

Tambien se puede iniciar manualmente:

```powershell
py -3 .\backend\server.py
```

## Datos locales

La aplicacion crea y usa archivos locales que no se suben al repositorio:

- `data/consulta_dental.sqlite3`: base de datos SQLite.
- `media/`: radiografias, fotos y documentos.
- `backups/`: copias ZIP creadas desde la pantalla de respaldos.

Estas carpetas estan excluidas en `.gitignore` para evitar publicar informacion clinica o archivos sensibles.

## Respaldos

La pantalla `Respaldos` crea un ZIP con:

- `data/consulta_dental.sqlite3`
- `media/`

Para restaurar datos manualmente, primero cierre el servidor, descomprima el respaldo y copie esos elementos dentro de la carpeta del proyecto.

## Pruebas

```powershell
py -3 -m unittest discover
```

## Documentacion

- `docs/arquitectura-inicial.md`
- `docs/modelo-base-datos.md`
- `docs/backend-local.md`
## Pruebas visuales con Playwright

Playwright permite abrir la aplicacion en Chromium de forma automatica, revisar pantallas principales, detectar errores de consola, comprobar desbordes horizontales y generar capturas de escritorio y movil.

Instalar dependencias del proyecto:

```powershell
npm install
npx playwright install chromium
```

Ejecutar pruebas visuales:

```powershell
npm run test:ui
```

Abrir el reporte HTML despues de una ejecucion:

```powershell
npm run test:ui:report
```

Los reportes y capturas se generan en `test-results/` y `playwright-report/`, carpetas ignoradas por Git.
