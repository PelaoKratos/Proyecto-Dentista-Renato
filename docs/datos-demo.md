# Datos demo

El proyecto incluye un cargador de datos demo para trabajar la aplicacion como si la consulta ya tuviera pacientes atendidos y pacientes por atender.

Desde PowerShell, en la carpeta del proyecto:

```powershell
npm run seed:demo
```

El comando crea pacientes con RUT `DEMO-*`, tratamientos, evoluciones clinicas, agenda, pagos y radiografias adjuntas en la base SQLite local. Tambien copia imagenes de muestra dentro de `media/pacientes/`.

La carga es segura para datos reales: antes de insertar, solo limpia registros asociados a pacientes cuyo RUT empieza con `DEMO-`. Los pacientes reales o ingresados manualmente no se eliminan.

Los datos generados quedan solo en este computador:

- `data/consulta_dental.sqlite3`
- `media/pacientes/`

Ambas rutas estan ignoradas por Git para evitar subir informacion clinica o archivos sensibles.
