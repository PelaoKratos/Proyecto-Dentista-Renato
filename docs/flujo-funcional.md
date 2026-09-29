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
- Respaldos: crea ZIP local con una copia consistente de SQLite y permite incluir o excluir `media/`; muestra si el último respaldo incluye adjuntos.

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


## Citas de continuacion de un tratamiento

Desde la ficha, el historial de tratamientos permite usar **Agendar continuacion**. Tambien se puede seleccionar un tratamiento vigente al agendar desde una pieza o desde Agenda. Cada nueva cita queda vinculada al mismo tratamiento y pieza; conserva su presupuesto y abonos, sin crear otra deuda. Para iniciar un tratamiento distinto se selecciona **Nuevo tratamiento / control general**.

El historial muestra por separado el estado clinico, el estado de pago, el numero de citas registradas y las atendidas, con fechas y estados al desplegar **Ver citas**. Las cancelaciones e inasistencias se conservan pero no cuentan como atenciones. Finalizar una cita no finaliza automaticamente el tratamiento; se finaliza desde Tratamientos o desde la pieza. Al registrar una evolucion desde una cita pendiente, la evolucion y el cambio de estado a atendida se guardan en una misma transaccion; si falla uno de los pasos no queda una evolucion suelta ni se pierden las notas de la cita.

Al iniciar el backend se agrega automaticamente el vinculo a las bases existentes. Se recupera el vinculo de una cita antigua solo cuando su paciente, motivo exacto generado por el formulario (tratamiento y pieza) y fecha de inicio coinciden con un unico tratamiento. Las coincidencias ambiguas permanecen en el historial general. El alta de un nuevo tratamiento junto con su primera cita es atomica.


Solo se permite una cita pendiente por paciente y pieza, incluso entre tratamientos distintos o fechas distintas. Las citas atendidas, canceladas y con inasistencia permanecen en el historial y permiten agendar la siguiente. Una cita vencida que siga confirmada debe marcarse como atendida, cancelada o inasistencia antes de crear otra.

Cancelar una cita vinculada cancela su tratamiento si no queda otra cita pendiente del mismo tratamiento; los tratamientos ya completados se conservan. El historial muestra Cancelado y los abonos registrados, sin modificar precios ni pagos. Reagendar el mismo tratamiento reutiliza su presupuesto y lo reactiva. Las cancelaciones antiguas con vinculo se sincronizan una sola vez al actualizar la base.


## Procedimientos base

El apartado **Procedimientos** del menu permite buscar, crear y editar los nombres, descripciones y precios base del catalogo. Tambien se accede desde **Tratamientos > Procedimientos base > Administrar**. Los procedimientos guardados estan disponibles en los selectores de nuevos tratamientos y citas. Cambiar el catalogo conserva los nombres y presupuestos ya asignados a pacientes.


## Agenda e historial desde la ficha

En **Agenda y piezas** se muestran todas las citas pendientes, incluidas las vencidas por registrar. Cada cita permite **Marcar atendida**, **Cambiar fecha**, **Cancelar cita** o **No asistio**. Cambiar fecha actualiza la misma cita, mantiene su duracion y conserva el tratamiento y los pagos.

**Agendar cita** permite elegir la pieza directamente, continuar un tratamiento existente sin nuevo cobro o seleccionar un procedimiento nuevo, y definir fecha y hora. Las notas y radiografias opcionales se despliegan cuando se necesitan.

En **Historial**, cada tratamiento muestra su pieza, estado clinico, estado de pago y cantidad de citas. Se puede buscar por nombre o pieza y filtrar por estado. Las fechas, notas y detalles financieros se consultan al desplegar el registro. Las citas y notas sin tratamiento vinculado quedan en **Otros registros y notas generales**. Al terminar las sesiones, **Finalizar tratamiento** queda disponible si no hay citas pendientes. **Plan y presupuesto** mantiene los campos de edicion dentro de un apartado desplegable.


## Exportar ficha clinica

Desde la ficha del paciente, **Exportar ficha clinica** abre la hoja de impresion con sus datos actuales. En el dialogo del navegador se puede elegir **Guardar como PDF**. El bloque de identificacion ocupa tres lineas compactas. Los tratamientos muestran su estado en español. La seccion de evolucion clinica muestra fecha, motivo y diagnostico; omite procedimiento, notas y proximos pasos. Radiografias y Documentos ya no ocupan espacio en el menu lateral; sus funciones siguen disponibles desde la ficha del paciente y las vistas directas.
