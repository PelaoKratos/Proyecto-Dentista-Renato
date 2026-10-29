# Mejoras de usabilidad

Rama: `codex/mejoras-usabilidad`. Inicio: 29 de octubre de 2026.

## Primera etapa implementada

- Un formulario compartido para agendar desde Inicio y la ficha, y para crear presupuestos desde Tratamientos o la ficha.
- Procedimientos múltiples, piezas, descuentos, observaciones con costo y nombre automático del tratamiento.
- Selección del paciente directamente desde resultados alfabéticos por nombre o RUT.
- Citas semanales o fechas y horas distintas, con un único tratamiento y presupuesto.
- Guardado atómico de próximas citas, cambios de presupuesto y cierre de la cita anterior: si una fecha falla, se revierte todo.
- Renovación de sesión en la misma pantalla para solicitudes JSON de DentalAPI; conserva el formulario en memoria y reintenta la solicitud después del ingreso. No se guardan datos clínicos en almacenamiento del navegador.
- Alergias vacías se muestran como “Sin informar”; las alergias registradas también aparecen en el aviso clínico.
- Acción Abonar después de registrar atención cuando hay saldo.
- Pendientes de días anteriores visibles en Inicio; primeros tres y resto desplegable.
- Contador de confirmadas referido al día y actualización de métricas después de guardar.
- Resumen inicial compacto y No asistió mantiene el rojo al pasar el mouse.

Validación: 54 pruebas de servidor y 8 pruebas de interfaz de escritorio seleccionadas, aprobadas. Se comprobó la sintaxis de los archivos modificados. No se ejecutó toda la suite de interfaz; algunas pruebas antiguas describen los formularios reemplazados y deberán migrarse.

## Segunda etapa implementada

- Pagos abre sin paciente seleccionado y presenta los nombres ordenados con su RUT.
- El monto del abono queda vacío; pagar el saldo completo es una acción explícita en Pagos, ficha y calendario. Varios tratamientos también requiere ingresar sus montos; Pagar todos sigue siendo una acción explícita.
- Historial con fecha y modo de consulta; cualquier abono, parcial o completo, requiere Editar para modificarlo.
- Dos vistas: Abonos registrados y Saldos pendientes. La segunda reúne presupuesto, abonado y deuda en una fila por tratamiento, incluidos los que tienen abonos parciales.
- Atajos Hoy, Este mes y Limpiar filtros, manteniendo la paginación de 20 registros.
- Corrección de fechas sin hora: se interpretan como fecha local para evitar mostrar el día anterior en Chile.

## Tercera etapa implementada

- Asignaciones reales de cada abono a uno o más procedimientos desde Pagos, ficha y calendario, en una sección plegable.
- Total de cada procedimiento después de descuentos, monto efectivamente asignado y saldo. El descuento general se prorratea en pesos completos; los abonos no se distribuyen por estimación.
- Los pagos previos conservan su monto y saldo del tratamiento, y se muestran como sin asignar. En Pagos → Editar se puede completar o corregir su asignación sin registrar otro pago.
- El historial permite consultar la distribución de cada abono. Las reasignaciones sin cambio de monto quedan en el registro de cambios.
- Identificadores estables de procedimientos para conservar los abonos al reordenarlos. No se puede eliminar un procedimiento abonado ni bajar su precio neto bajo lo asignado, incluidos los descuentos generales.
- Guardado atómico de pagos compartidos y validación en el servidor de pertenencia, duplicados, montos enteros por procedimiento y límites de saldo.
- Migración automática y aditiva al iniciar el servidor; no se inventan asignaciones de pagos anteriores. Las pruebas usan bases aisladas.

Validación: 77 pruebas de servidor y 8 pruebas de interfaz seleccionadas aprobadas, incluida persistencia real de un abono y corrección de un pago anterior en la base de prueba. Revisión visual del formulario de abono de escritorio; sintaxis JavaScript y formato comprobados.

## Cuarta etapa implementada

- Editor compartido de tratamientos para la lista general, Plan y presupuesto e Historial de la ficha. Una sola acción Editar tratamiento reemplaza los editores separados.
- Nombre, estado, procedimientos, piezas y descuentos en la misma ventana; fechas y notas clínicas plegables. Los presupuestos anteriores sin desglose siguen siendo editables.
- Guardado del presupuesto detallado y los datos del tratamiento en una misma transacción. Conflictos de piezas o de abonos conservan el formulario y revierten todos los cambios del envío.
- Tarjetas compactas con presupuesto, estado y procedimientos/notas desplegables; saldo y abonado visibles en la ficha. Finalizar conserva el verde intenso y Eliminar queda en Más acciones.
- La lista general ocupa todo el ancho. Catálogo y accesos rápidos quedan plegados; el resumen financiero de la ficha se integra arriba del listado.
- Encabezado y pie del editor visibles mientras los procedimientos se desplazan, comprobado a 1100 × 760. Protección de cambios sin guardar al cerrar o pulsar Escape.
- Eliminados los formularios y estilos sustituidos para mantener una sola implementación de edición.

Validación: 79 pruebas de servidor y 11 de interfaz de escritorio aprobadas; persistencia real desde la ficha, reapertura desde Tratamientos, protección de cambios y revisión visual a 1100 × 760. Sintaxis y formato correctos.

## Quinta etapa implementada

- DentalAPI.upload comparte la renovación de sesión con las solicitudes JSON. Los archivos se envían como multipart con su boundary correcto y se reintentan únicamente después de un 401 y un reingreso satisfactorio.
- La cancelación o el error de autenticación conserva el archivo seleccionado y los datos en memoria. Las cargas desde ficha, calendario y Biblioteca de adjuntos usan el mismo mecanismo.
- Aviso al cerrar una cita o un cajón, cambiar una pestaña, reemplazar un formulario con datos pendientes, salir mediante enlaces o cerrar/recargar la pestaña. Incluye alta del paciente, evolución clínica, pago, procedimientos y notas del documento.
- Los formularios que guardan bloquean el descarte mientras la solicitud está en curso. Los guardados satisfactorios actualizan su estado para no pedir descartar datos ya guardados.
- Si una cita se guarda y falla su radiografía, el formulario conserva el archivo y ofrece Reintentar adjunto. Ese botón envía solo la radiografía; no crea otra cita. Cerrar permite adjuntarla después desde la ficha.
- Los formularios que desaparecen se retiran del registro de protección. No se almacenan borradores clínicos ni contraseñas en localStorage o sessionStorage.

Validación: 23 pruebas de interfaz de escritorio aprobadas en una base aislada, incluyendo multipart después de renovar sesión, cancelación conservando archivos, aviso al cerrar/recargar y reintento del adjunto con una sola cita creada. Sintaxis y formato correctos.

## Sexta etapa implementada

- Inicio consulta solo las citas del mes, semana o día visible. Agenda solicita los siete días de su selector; navegar vuelve a consultar el período elegido.
- Las atenciones pendientes anteriores se consultan por separado, de modo que no desaparecen al cambiar el calendario. La disponibilidad del formulario solicita únicamente citas confirmadas y los abonos del calendario se consultan por paciente.
- Pagos obtiene páginas de hasta 20 movimientos o tratamientos con deuda, con filtros aplicados en el servidor, orden estable por fecha e identificador y contadores arriba y abajo.
- Los indicadores y saldos usan un resumen agregado independiente de la página: incluye todos los abonos y sus asignaciones reales por procedimiento, sin descargar sus notas ni cada movimiento histórico.
- Editar un abono consulta el historial del tratamiento correspondiente para validar sus asignaciones. Se mantiene compatibilidad con el formato anterior mientras un servidor previo siga abierto.
- Las consultas descartan respuestas fuera de orden y muestran errores recuperables. Durante la carga se desactiva la edición del listado anterior para proteger borradores.
- Índices de fechas y relaciones, validación de filtros y lectura consistente del total y la página en una transacción.

Validación: 84 pruebas del servidor y 14 de interfaz aprobadas. Prueba real con 45 abonos: páginas de 20, 20 y 5; filtros por fecha y paciente, total global estable y saldo completo. Comprobados cruces de mes, pendientes fuera de la semana visible y respuestas retrasadas. No se ha medido una mejora de tiempo en equipos del cliente.

## Validación final y entrega

- 84 pruebas del servidor y las 98 pruebas completas de escritorio aprobadas, con bases de prueba aisladas.
- Flujo real validado: alta del paciente, dos procedimientos con descuento, cita, atención, abono asignado y exportación de ficha con saldo correcto.
- Revisión de teclado, retorno de foco, nombres accesibles y encuadre a 125 % y 150 % de zoom. Importes financieros en una sola línea.
- Restablecida la comprobación de disponibilidad de todas las fechas semanales o personalizadas antes de guardar.
- Pruebas antiguas migradas al compositor y al editor compartidos; las comprobaciones esperan el guardado asíncrono antes de revisar el resultado.
- Entrega-cliente regenerada y cotejada con los archivos de producción: 73 archivos, base vacía, sin procedimientos base ni credenciales.
- Instalación y primer acceso probados en una carpeta aislada. La reinstalación conservó exactamente la base, el acceso, los adjuntos y los respaldos de prueba.
- Sintaxis JavaScript, formato y comprobación de diferencias aprobados. La interfaz móvil permanece fuera de alcance.

## Estado de tareas

- [x] Pagos: fecha visible, edición explícita para todos los estados, selección consciente del paciente y acción explícita para pagar todo el saldo.
- [x] Separar consulta de movimientos y saldos pendientes dentro del módulo Pagos.
- [x] Registrar asignaciones reales de abonos por procedimiento; tratar los pagos anteriores como no asignados, sin inventar su distribución.
- [x] Unificar las entradas de edición del tratamiento y compactar las tarjetas y columna lateral.
- [x] Extender la renovación de sesión a las cargas de archivos que usan fetch directo.
- [x] Evitar pérdida por cierre/navegación accidental mientras hay formularios nuevos sin guardar.
- [x] Consultar citas por período y pagos por página en el servidor, conservando una consulta separada de citas atrasadas.
- [x] Migrar pruebas antiguas de interfaz y completar pruebas de regresión, teclado, zoom y revisión visual de escritorio.

La carpeta Entrega-cliente está actualizada con la versión validada y lista para copiar al computador del cliente. Ejecutar INSTALAR.cmd con Python 3.12 o superior instalado. La carpeta generada se excluye de Git; scripts/build-delivery.ps1 permite reproducirla.
