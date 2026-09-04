# Modelo de base de datos inicial

## Motor

SQLite local.

Archivo sugerido:

```text
data/consulta_dental.sqlite3
```

## Entidades principales

### patients

Representa la ficha principal del paciente.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador interno |
| rut | TEXT NULL | RUT o identificador nacional |
| first_name | TEXT | Nombres |
| last_name | TEXT | Apellidos |
| birth_date | DATE NULL | Fecha de nacimiento |
| phone | TEXT NULL | Telefono |
| email | TEXT NULL | Correo |
| address | TEXT NULL | Direccion |
| emergency_contact_name | TEXT NULL | Contacto de emergencia |
| emergency_contact_phone | TEXT NULL | Telefono de emergencia |
| medical_notes | TEXT NULL | Antecedentes medicos |
| allergies | TEXT NULL | Alergias |
| active_alert | TEXT NULL | Alerta visible en ficha |
| is_active | BOOLEAN | Paciente activo/inactivo |
| created_at | DATETIME | Fecha de creacion |
| updated_at | DATETIME | Fecha de actualizacion |

### treatment_catalog

Catalogo reutilizable de tratamientos.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador |
| name | TEXT | Nombre del tratamiento |
| description | TEXT NULL | Descripcion |
| default_price | DECIMAL NULL | Precio sugerido |
| is_active | BOOLEAN | Disponible/no disponible |

### patient_treatments

Plan o tratamiento concreto asignado a un paciente.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador |
| patient_id | INTEGER FK | Paciente |
| catalog_treatment_id | INTEGER FK NULL | Tratamiento del catalogo |
| title | TEXT | Nombre visible del tratamiento |
| tooth_code | TEXT NULL | Pieza dental, zona o arcada |
| diagnosis | TEXT NULL | Diagnostico |
| plan_notes | TEXT NULL | Plan clinico |
| status | TEXT | planned, in_progress, completed, cancelled |
| estimated_price | DECIMAL NULL | Presupuesto |
| final_price | DECIMAL NULL | Precio final |
| start_date | DATE NULL | Inicio |
| end_date | DATE NULL | Termino |
| created_at | DATETIME | Creacion |
| updated_at | DATETIME | Actualizacion |

### clinical_sessions

Registro de cada atencion o evolucion clinica.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador |
| patient_id | INTEGER FK | Paciente |
| patient_treatment_id | INTEGER FK NULL | Tratamiento asociado |
| session_date | DATETIME | Fecha y hora |
| reason | TEXT NULL | Motivo |
| diagnosis | TEXT NULL | Diagnostico observado |
| procedure_done | TEXT NULL | Procedimiento realizado |
| notes | TEXT NULL | Evolucion/observaciones |
| next_steps | TEXT NULL | Indicaciones o proxima accion |
| created_at | DATETIME | Creacion |
| updated_at | DATETIME | Actualizacion |

### attachments

Radiografias, fotos clinicas y documentos.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador |
| patient_id | INTEGER FK | Paciente |
| clinical_session_id | INTEGER FK NULL | Sesion asociada |
| patient_treatment_id | INTEGER FK NULL | Tratamiento asociado |
| file_type | TEXT | radiography, photo, document, other |
| category | TEXT NULL | Panoramica, periapical, bitewing, consentimiento, etc. |
| original_filename | TEXT | Nombre original |
| stored_path | TEXT | Ruta relativa dentro de `media/` |
| mime_type | TEXT NULL | Tipo MIME |
| file_size | INTEGER NULL | Peso en bytes |
| taken_at | DATE NULL | Fecha de toma del examen/foto |
| notes | TEXT NULL | Observacion |
| created_at | DATETIME | Creacion |

### appointments

Agenda simple.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador |
| patient_id | INTEGER FK | Paciente |
| starts_at | DATETIME | Inicio |
| ends_at | DATETIME NULL | Termino |
| reason | TEXT NULL | Motivo |
| status | TEXT | scheduled, attended, missed, cancelled |
| notes | TEXT NULL | Observaciones |
| created_at | DATETIME | Creacion |
| updated_at | DATETIME | Actualizacion |

### payments

Pagos y abonos.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| id | INTEGER PK | Identificador |
| patient_id | INTEGER FK | Paciente |
| patient_treatment_id | INTEGER FK NULL | Tratamiento asociado |
| payment_date | DATE | Fecha |
| amount | DECIMAL | Monto |
| method | TEXT NULL | Efectivo, transferencia, tarjeta, otro |
| notes | TEXT NULL | Observaciones |
| created_at | DATETIME | Creacion |

## Relaciones

- Un paciente tiene muchos tratamientos.
- Un paciente tiene muchas sesiones clinicas.
- Un tratamiento puede tener muchas sesiones.
- Un paciente puede tener muchos adjuntos.
- Un adjunto puede asociarse opcionalmente a una sesion o tratamiento.
- Un paciente puede tener muchas citas.
- Un paciente puede tener muchos pagos.
- Un pago puede asociarse opcionalmente a un tratamiento.

## Indices recomendados

```sql
CREATE INDEX idx_patients_name ON patients(last_name, first_name);
CREATE INDEX idx_patients_rut ON patients(rut);
CREATE INDEX idx_patient_treatments_patient ON patient_treatments(patient_id);
CREATE INDEX idx_clinical_sessions_patient_date ON clinical_sessions(patient_id, session_date);
CREATE INDEX idx_attachments_patient ON attachments(patient_id);
CREATE INDEX idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX idx_payments_patient_date ON payments(patient_id, payment_date);
```

## Reglas importantes

- Las eliminaciones deberian ser logicas cuando involucren informacion clinica. Por ejemplo, marcar paciente o tratamiento como inactivo en vez de borrar.
- Los adjuntos se deben borrar fisicamente solo si el usuario confirma la accion.
- La ruta de archivos debe ser relativa al proyecto para que los respaldos sean portables.
- Las fechas clinicas deben guardarse siempre con fecha y hora cuando corresponda.

## SQL inicial de referencia

```sql
CREATE TABLE patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  phone TEXT,
  email TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  medical_notes TEXT,
  allergies TEXT,
  active_alert TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE treatment_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE patient_treatments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  catalog_treatment_id INTEGER,
  title TEXT NOT NULL,
  tooth_code TEXT,
  diagnosis TEXT,
  plan_notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  estimated_price NUMERIC,
  final_price NUMERIC,
  start_date DATE,
  end_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (catalog_treatment_id) REFERENCES treatment_catalog(id)
);

CREATE TABLE clinical_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  patient_treatment_id INTEGER,
  session_date DATETIME NOT NULL,
  reason TEXT,
  diagnosis TEXT,
  procedure_done TEXT,
  notes TEXT,
  next_steps TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (patient_treatment_id) REFERENCES patient_treatments(id)
);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  clinical_session_id INTEGER,
  patient_treatment_id INTEGER,
  file_type TEXT NOT NULL,
  category TEXT,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  taken_at DATE,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (clinical_session_id) REFERENCES clinical_sessions(id),
  FOREIGN KEY (patient_treatment_id) REFERENCES patient_treatments(id)
);

CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  patient_treatment_id INTEGER,
  payment_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  method TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (patient_treatment_id) REFERENCES patient_treatments(id)
);
```
