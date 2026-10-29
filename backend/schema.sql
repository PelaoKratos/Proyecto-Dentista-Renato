PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date DATE,
  dentition_type TEXT NOT NULL DEFAULT 'adult' CHECK (dentition_type IN ('adult', 'child')),
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

CREATE TABLE IF NOT EXISTS patient_treatment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  plan_notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE TABLE IF NOT EXISTS patient_treatments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  treatment_plan_id INTEGER REFERENCES patient_treatment_plans(id),
  catalog_treatment_id INTEGER,
  title TEXT NOT NULL,
  tooth_code TEXT,
  dentition_type TEXT NOT NULL DEFAULT 'adult' CHECK (dentition_type IN ('adult', 'child')),
  diagnosis TEXT,
  plan_notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  estimated_price NUMERIC,
  final_price NUMERIC,
  procedure_items_json TEXT,
  total_discount_type TEXT,
  total_discount_value NUMERIC,
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
  payment_batch_id TEXT,
  procedure_allocations_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (patient_treatment_id) REFERENCES patient_treatments(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('appointment', 'treatment', 'payment')),
  entity_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  before_json TEXT,
  after_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_rut ON patients(rut);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_patient ON patient_treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_sessions_patient_date ON clinical_sessions(patient_id, session_date);
CREATE INDEX IF NOT EXISTS idx_attachments_patient ON attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_payments_patient_date ON payments(patient_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_date_id ON payments(payment_date DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_payments_treatment ON payments(patient_treatment_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC, id DESC);

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

CREATE TRIGGER IF NOT EXISTS trg_audit_appointments_insert
AFTER INSERT ON appointments
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, after_json)
  VALUES ('appointment', NEW.id, NEW.patient_id, 'created',
    json_object('starts_at', NEW.starts_at, 'reason', NEW.reason, 'status', NEW.status));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_appointments_update
AFTER UPDATE ON appointments
WHEN OLD.patient_id IS NOT NEW.patient_id OR OLD.starts_at IS NOT NEW.starts_at
  OR OLD.reason IS NOT NEW.reason OR OLD.status IS NOT NEW.status
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json, after_json)
  VALUES ('appointment', NEW.id, NEW.patient_id, 'updated',
    json_object('starts_at', OLD.starts_at, 'reason', OLD.reason, 'status', OLD.status),
    json_object('starts_at', NEW.starts_at, 'reason', NEW.reason, 'status', NEW.status));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_appointments_delete
AFTER DELETE ON appointments
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json)
  VALUES ('appointment', OLD.id, OLD.patient_id, 'deleted',
    json_object('starts_at', OLD.starts_at, 'reason', OLD.reason, 'status', OLD.status));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_treatments_insert
AFTER INSERT ON patient_treatments
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, after_json)
  VALUES ('treatment', NEW.id, NEW.patient_id, 'created',
    json_object('title', NEW.title, 'status', NEW.status, 'tooth_code', NEW.tooth_code,
      'estimated_price', NEW.estimated_price, 'final_price', NEW.final_price,
      'start_date', NEW.start_date, 'end_date', NEW.end_date));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_treatments_update
AFTER UPDATE ON patient_treatments
WHEN OLD.patient_id IS NOT NEW.patient_id OR OLD.title IS NOT NEW.title OR OLD.status IS NOT NEW.status
  OR OLD.tooth_code IS NOT NEW.tooth_code OR OLD.estimated_price IS NOT NEW.estimated_price
  OR OLD.final_price IS NOT NEW.final_price OR OLD.start_date IS NOT NEW.start_date OR OLD.end_date IS NOT NEW.end_date
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json, after_json)
  VALUES ('treatment', NEW.id, NEW.patient_id, 'updated',
    json_object('title', OLD.title, 'status', OLD.status, 'tooth_code', OLD.tooth_code,
      'estimated_price', OLD.estimated_price, 'final_price', OLD.final_price,
      'start_date', OLD.start_date, 'end_date', OLD.end_date),
    json_object('title', NEW.title, 'status', NEW.status, 'tooth_code', NEW.tooth_code,
      'estimated_price', NEW.estimated_price, 'final_price', NEW.final_price,
      'start_date', NEW.start_date, 'end_date', NEW.end_date));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_treatments_delete
AFTER DELETE ON patient_treatments
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json)
  VALUES ('treatment', OLD.id, OLD.patient_id, 'deleted',
    json_object('title', OLD.title, 'status', OLD.status, 'tooth_code', OLD.tooth_code,
      'estimated_price', OLD.estimated_price, 'final_price', OLD.final_price,
      'start_date', OLD.start_date, 'end_date', OLD.end_date));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_payments_insert
AFTER INSERT ON payments
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, after_json)
  VALUES ('payment', NEW.id, NEW.patient_id, 'created',
    json_object('payment_date', NEW.payment_date, 'amount', NEW.amount, 'method', NEW.method));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_payments_update
AFTER UPDATE ON payments
WHEN OLD.patient_id IS NOT NEW.patient_id OR OLD.payment_date IS NOT NEW.payment_date
  OR OLD.amount IS NOT NEW.amount OR OLD.method IS NOT NEW.method
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json, after_json)
  VALUES ('payment', NEW.id, NEW.patient_id, 'updated',
    json_object('payment_date', OLD.payment_date, 'amount', OLD.amount, 'method', OLD.method),
    json_object('payment_date', NEW.payment_date, 'amount', NEW.amount, 'method', NEW.method));
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_payments_delete
AFTER DELETE ON payments
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, patient_id, action, before_json)
  VALUES ('payment', OLD.id, OLD.patient_id, 'deleted',
    json_object('payment_date', OLD.payment_date, 'amount', OLD.amount, 'method', OLD.method));
END;
