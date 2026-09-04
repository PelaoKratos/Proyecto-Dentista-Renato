# Arquitectura inicial - Consulta dental

## Objetivo

Aplicacion web local para una consulta dental usada en un solo computador. Debe permitir gestionar pacientes, tratamientos, sesiones clinicas y adjuntar imagenes de radiografias u otros documentos relacionados.

## Enfoque recomendado

- Aplicacion web ejecutandose en `localhost`.
- Base de datos local con SQLite.
- Archivos adjuntos guardados en el disco, no dentro de la base de datos.
- La base de datos guarda rutas, nombres, tipos y metadatos de cada archivo.
- Copias de seguridad simples: archivo `.sqlite3` + carpeta de adjuntos.

Este enfoque evita depender de internet o servicios cloud, mantiene bajo el costo de operacion y permite transportar o respaldar toda la informacion copiando una carpeta.

## Estructura funcional

### Modulos principales

1. Pacientes
   - Ficha del paciente.
   - Datos de contacto.
   - Antecedentes medicos relevantes.
   - Alertas clinicas visibles.

2. Tratamientos
   - Catalogo de tratamientos/procedimientos.
   - Planes de tratamiento por paciente.
   - Estado del tratamiento: planificado, en curso, completado, cancelado.
   - Presupuesto estimado y monto real.

3. Sesiones clinicas
   - Registro de atenciones.
   - Fecha, motivo, diagnostico, observaciones y procedimientos realizados.
   - Asociacion con tratamientos activos.

4. Radiografias y adjuntos
   - Imagenes de radiografia.
   - Fotografias clinicas.
   - Documentos firmados o consentimientos.
   - Clasificacion por tipo, fecha y paciente.

5. Pagos
   - Registro de abonos y pagos.
   - Metodo de pago.
   - Saldo por tratamiento o paciente.

6. Agenda simple
   - Citas futuras.
   - Estado: programada, asistida, no asistida, cancelada.
   - Motivo de consulta.

## Estructura sugerida del proyecto

```text
consulta-dental/
  app/
    pacientes/
    tratamientos/
    citas/
    pagos/
    adjuntos/
    usuarios/
  data/
    consulta_dental.sqlite3
  media/
    pacientes/
      {paciente_id}/
        radiografias/
        fotos/
        documentos/
  backups/
  docs/
    arquitectura-inicial.md
    modelo-base-datos.md
```

## Gestion local de archivos

Los archivos adjuntos se guardan en carpetas organizadas por paciente:

```text
media/pacientes/000001/radiografias/2026-09-03-panoramica.jpg
media/pacientes/000001/documentos/2026-09-03-consentimiento.pdf
```

En la base de datos se guarda:

- Paciente asociado.
- Tipo de archivo.
- Ruta relativa del archivo.
- Nombre original.
- Fecha de carga.
- Observacion clinica opcional.

No conviene guardar imagenes grandes como BLOB dentro de SQLite, porque hace mas pesado el respaldo, complica la inspeccion manual y puede degradar el rendimiento.

## Seguridad local

Aunque se use en un solo computador, la informacion es sensible. Recomendaciones minimas:

- Usuario administrador con clave.
- Sesion local con cierre automatico opcional.
- Backups periodicos.
- Evitar guardar la base de datos en carpetas sincronizadas publicas.
- Restringir permisos de la carpeta del sistema en Windows.

## Backup recomendado

Crear una copia comprimida de:

```text
data/consulta_dental.sqlite3
media/
```

Formato sugerido:

```text
backups/consulta-dental-backup-YYYY-MM-DD-HHMM.zip
```

La aplicacion puede incluir despues un boton "Crear respaldo" que genere este ZIP automaticamente.
