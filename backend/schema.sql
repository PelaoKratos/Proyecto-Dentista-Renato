PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
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

CREATE TABLE IF NOT EXISTS treatment_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_treatments (
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

CREATE TABLE IF NOT EXISTS clinical_sessions (
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

CREATE TABLE IF NOT EXISTS attachments (
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

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  patient_treatment_id INTEGER REFERENCES patient_treatments(id),
  starts_at DATETIME NOT NULL,
  ends_at DATETIME,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS payments (
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

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_rut ON patients(rut);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_patient ON patient_treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_sessions_patient_date ON clinical_sessions(patient_id, session_date);
CREATE INDEX IF NOT EXISTS idx_attachments_patient ON attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_payments_patient_date ON payments(patient_id, payment_date);

CREATE TRIGGER IF NOT EXISTS trg_patients_updated_at
AFTER UPDATE ON patients
FOR EACH ROW
BEGIN
  UPDATE patients SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_treatment_catalog_updated_at
AFTER UPDATE ON treatment_catalog
FOR EACH ROW
BEGIN
  UPDATE treatment_catalog SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_patient_treatments_updated_at
AFTER UPDATE ON patient_treatments
FOR EACH ROW
BEGIN
  UPDATE patient_treatments SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_clinical_sessions_updated_at
AFTER UPDATE ON clinical_sessions
FOR EACH ROW
BEGIN
  UPDATE clinical_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_appointments_updated_at
AFTER UPDATE ON appointments
FOR EACH ROW
BEGIN
  UPDATE appointments SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
