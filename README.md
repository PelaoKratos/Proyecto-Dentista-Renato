# Consulta Dental Renato

Aplicacion web local para gestionar una consulta dental en un solo computador.

Permite administrar pacientes, tratamientos, evoluciones clinicas, agenda, pagos, radiografias/documentos adjuntos, documentos imprimibles y respaldos locales.

## Stack

- Frontend: HTML, CSS y JavaScript sin framework.
- Backend: Python con servidor HTTP de la libreria estandar.
- Base de datos: SQLite local.
- Archivos adjuntos: carpeta local `media/`.
- Respaldos: archivos ZIP en `backups/`.
- Pruebas visuales: Playwright con Chromium.

La aplicacion no requiere paquetes externos para funcionar en el computador local. Las dependencias npm se usan para pruebas automatizadas.

## Ejecutar en Windows

Desde PowerShell, en la carpeta del proyecto:

```powershell
npm start
```

Luego abrir:

```text
http://127.0.0.1:8000/
```

Tambien se puede iniciar solo el backend:

```powershell
npm run start:backend
```

## Acceso directo

Para crear o actualizar el acceso directo del Escritorio:

```powershell
npm run shortcut
```

El acceso se llama `Consulta Dental Renato` y abre la aplicacion en `http://127.0.0.1:8000/`. Si el servidor local no esta corriendo, lo inicia automaticamente en segundo plano.

## Estructura del proyecto

```text
assets/      Estilos, JavaScript, imagenes e iconos de la app
backend/     Servidor local, SQLite y validaciones
docs/        Documentacion tecnica del proyecto
scripts/     Arranque, apertura, pruebas e instalacion del acceso directo
tests/       Pruebas backend y pruebas visuales Playwright
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

## Pruebas backend

```powershell
npm run test:backend
```

## Pruebas visuales con Playwright

Playwright abre la aplicacion en Chromium de forma automatica, revisa pantallas principales, detecta errores de consola, comprueba desbordes horizontales y genera capturas de escritorio y movil.

Instalar dependencias del proyecto:

```powershell
npm install
npx playwright install chromium
```

Ejecutar pruebas visuales:

```powershell
npm test
```

Abrir el reporte HTML despues de una ejecucion:

```powershell
npm run test:ui:report
```

Los reportes y capturas se generan en `test-results/` y `playwright-report/`, carpetas ignoradas por Git.

## Documentacion

- `docs/arquitectura-inicial.md`
- `docs/modelo-base-datos.md`
- `docs/backend-local.md`
- `docs/flujo-funcional.md`
