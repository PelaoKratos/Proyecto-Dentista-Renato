import tempfile
import unittest
from pathlib import Path

from backend import database


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_data_dir = database.DATA_DIR
        self.original_db_path = database.DB_PATH
        temp_path = Path(self.tempdir.name)
        database.DATA_DIR = temp_path
        database.DB_PATH = temp_path / "test.sqlite3"
        database.init_db()

    def tearDown(self):
        database.DATA_DIR = self.original_data_dir
        database.DB_PATH = self.original_db_path
        self.tempdir.cleanup()

    def test_child_and_adult_treatments_keep_separate_tooth_numbers(self):
        patient = database.insert_record(
            "patients", {"first_name": "Ana", "last_name": "Rios", "dentition_type": "child"},
            {"first_name", "last_name", "dentition_type"},
        )
        fields = {"patient_id", "patient_treatment_id", "starts_at"}
        treatment_fields = {"patient_id", "title", "tooth_code"}
        child = database.create_treatment_appointment({
            "patient_id": patient["id"], "starts_at": "2026-10-08 09:00",
            "new_treatment": {"title": "Infantil", "tooth_code": "1,20"},
        }, fields, treatment_fields)
        saved = database.fetch_one("SELECT * FROM patient_treatments WHERE id = ?", (child["patient_treatment_id"],))
        self.assertEqual((saved["dentition_type"], saved["tooth_code"]), ("child", "1,20"))
        with self.assertRaisesRegex(ValueError, "1 y 20"):
            database.create_treatment_appointment({
                "patient_id": patient["id"], "starts_at": "2026-10-08 09:30",
                "new_treatment": {"title": "Fuera de rango", "tooth_code": "21"},
            }, fields, treatment_fields)
        database.update_record("patients", patient["id"], {"dentition_type": "adult"}, {"dentition_type"})
        adult = database.create_treatment_appointment({
            "patient_id": patient["id"], "starts_at": "2026-10-08 10:00",
            "new_treatment": {"title": "Adulto", "tooth_code": "1,32"},
        }, fields, treatment_fields)
        self.assertEqual(database.fetch_one("SELECT dentition_type FROM patient_treatments WHERE id = ?", (adult["patient_treatment_id"],))["dentition_type"], "adult")
        self.assertEqual(database.fetch_one("SELECT dentition_type FROM patient_treatments WHERE id = ?", (child["patient_treatment_id"],))["dentition_type"], "child")

    def test_legacy_fdi_treatments_migrate_once_to_sequential_numbers(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        database.execute("DELETE FROM app_migrations WHERE name = 'tooth_numbering_v2'")
        database.execute("INSERT INTO patient_treatments (patient_id, title, tooth_code) VALUES (?, 'Endodoncia', '36,46')", (patient["id"],))
        database.init_db()
        treatment = database.fetch_one("SELECT tooth_code FROM patient_treatments WHERE patient_id = ?", (patient["id"],))
        self.assertEqual(treatment["tooth_code"], "19,30")
        database.init_db()
        self.assertEqual(database.fetch_one("SELECT tooth_code FROM patient_treatments WHERE patient_id = ?", (patient["id"],))["tooth_code"], "19,30")

    def test_payment_batch_allocates_atomically_and_rejects_overpayment(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        other = database.insert_record("patients", {"first_name": "Otro", "last_name": "Paciente"}, {"first_name", "last_name"})
        fields = {"patient_id", "title", "final_price"}
        first = database.insert_record("patient_treatments", {"patient_id": patient["id"], "title": "Resina", "final_price": 100000}, fields)
        second = database.insert_record("patient_treatments", {"patient_id": patient["id"], "title": "Limpieza", "final_price": 50000}, fields)
        foreign = database.insert_record("patient_treatments", {"patient_id": other["id"], "title": "Consulta", "final_price": 40000}, fields)
        common = {"patient_id": patient["id"], "payment_date": "2026-10-08", "method": "Efectivo"}
        result = database.create_payment_batch({**common, "allocations": [
            {"patient_treatment_id": first["id"], "amount": 30000},
            {"patient_treatment_id": second["id"], "amount": 10000},
        ]})
        self.assertEqual(result["total"], 40000)
        self.assertEqual({payment["payment_batch_id"] for payment in result["payments"]}, {result["payment_batch_id"]})
        self.assertEqual([payment["amount"] for payment in result["payments"]], [30000, 10000])
        with self.assertRaises(ValueError):
            database.create_payment_batch({**common, "allocations": [
                {"patient_treatment_id": first["id"], "amount": 70001},
                {"patient_treatment_id": second["id"], "amount": 1},
            ]})
        with self.assertRaises(ValueError):
            database.create_payment_batch({**common, "allocations": [
                {"patient_treatment_id": first["id"], "amount": 1},
                {"patient_treatment_id": foreign["id"], "amount": 1},
            ]})
        self.assertEqual(len(database.fetch_all("SELECT * FROM payments")), 2)

    def test_delete_treatment_removes_debt_but_preserves_past_clinical_records(self):
        patient = database.insert_record(
            "patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"}
        )
        database.execute(
            "INSERT INTO patient_treatment_plans (patient_id, title) VALUES (?, ?)",
            (patient["id"], "Plan inicial"),
        )
        plan_id = database.fetch_one("SELECT id FROM patient_treatment_plans WHERE patient_id = ?", (patient["id"],))["id"]
        fields = {"patient_id", "treatment_plan_id", "title", "final_price"}
        removed = database.insert_record(
            "patient_treatments",
            {"patient_id": patient["id"], "treatment_plan_id": plan_id, "title": "Resina", "final_price": 100000},
            fields,
        )
        kept = database.insert_record(
            "patient_treatments",
            {"patient_id": patient["id"], "treatment_plan_id": plan_id, "title": "Limpieza", "final_price": 50000},
            fields,
        )
        database.execute(
            "INSERT INTO appointments (patient_id, patient_treatment_id, starts_at, status) VALUES (?, ?, ?, 'attended')",
            (patient["id"], removed["id"], "2026-10-01 09:00"),
        )
        database.execute(
            "INSERT INTO clinical_sessions (patient_id, patient_treatment_id, session_date, notes) VALUES (?, ?, ?, ?)",
            (patient["id"], removed["id"], "2026-10-01 09:00", "Evolución conservada"),
        )
        database.execute(
            """INSERT INTO attachments
               (patient_id, patient_treatment_id, file_type, original_filename, stored_path)
               VALUES (?, ?, 'radiography', 'rx.png', 'media/rx.png')""",
            (patient["id"], removed["id"]),
        )

        self.assertEqual(database.delete_patient_treatment(removed["id"])["patient_id"], patient["id"])
        self.assertIsNone(database.fetch_one("SELECT id FROM patient_treatments WHERE id = ?", (removed["id"],)))
        self.assertEqual(database.fetch_one(
            "SELECT SUM(final_price) AS total FROM patient_treatments WHERE patient_id = ?", (patient["id"],)
        )["total"], 50000)
        for table in ("appointments", "clinical_sessions", "attachments"):
            self.assertIsNone(database.fetch_one(
                f"SELECT patient_treatment_id FROM {table} WHERE patient_id = ?", (patient["id"],)
            )["patient_treatment_id"])
        self.assertIsNotNone(database.fetch_one("SELECT id FROM patient_treatment_plans WHERE id = ?", (plan_id,)))
        self.assertIsNone(database.delete_patient_treatment(removed["id"]))
        database.delete_patient_treatment(kept["id"])
        self.assertIsNone(database.fetch_one("SELECT id FROM patient_treatment_plans WHERE id = ?", (plan_id,)))

    def test_delete_treatment_rejects_linked_payments_pending_cites_and_overpayment(self):
        patient = database.insert_record(
            "patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"}
        )
        fields = {"patient_id", "title", "final_price"}
        treatment = database.insert_record(
            "patient_treatments", {"patient_id": patient["id"], "title": "Resina", "final_price": 100000}, fields
        )
        database.execute(
            "INSERT INTO payments (patient_id, patient_treatment_id, payment_date, amount) VALUES (?, ?, ?, ?)",
            (patient["id"], treatment["id"], "2026-10-01", 20000),
        )
        with self.assertRaisesRegex(ValueError, "abonos"):
            database.delete_patient_treatment(treatment["id"])
        database.execute("DELETE FROM payments WHERE patient_treatment_id = ?", (treatment["id"],))
        database.execute(
            "INSERT INTO appointments (patient_id, patient_treatment_id, starts_at, status) VALUES (?, ?, ?, 'scheduled')",
            (patient["id"], treatment["id"], "2026-10-20 09:00"),
        )
        with self.assertRaisesRegex(ValueError, "cita pendiente"):
            database.delete_patient_treatment(treatment["id"])
        database.execute(
            "UPDATE appointments SET status = 'cancelled' WHERE patient_treatment_id = ?", (treatment["id"],)
        )
        database.execute(
            "INSERT INTO payments (patient_id, payment_date, amount) VALUES (?, ?, ?)",
            (patient["id"], "2026-10-01", 20000),
        )
        with self.assertRaisesRegex(ValueError, "superarían"):
            database.delete_patient_treatment(treatment["id"])
        self.assertIsNotNone(database.fetch_one("SELECT id FROM patient_treatments WHERE id = ?", (treatment["id"],)))

    def test_new_database_starts_without_demo_records(self):
        self.assertEqual(database.fetch_all("SELECT * FROM patients"), [])
        self.assertEqual(database.fetch_all("SELECT * FROM patient_treatments"), [])
        self.assertEqual(database.fetch_all("SELECT * FROM appointments"), [])
        self.assertEqual(database.fetch_all("SELECT * FROM payments"), [])

    def test_insert_and_update_patient(self):
        created = database.insert_record(
            "patients",
            {"first_name": "Ana", "last_name": "Lopez", "phone": "+56 9 1111 2222"},
            {"first_name", "last_name", "phone"},
        )
        self.assertEqual(created["first_name"], "Ana")

        updated = database.update_record(
            "patients",
            created["id"],
            {"phone": "+56 9 3333 4444"},
            {"phone"},
        )
        self.assertEqual(updated["phone"], "+56 9 3333 4444")

    def test_continuation_keeps_one_treatment_and_payment(self):
        patient = database.insert_record("patients", {"first_name": "Test", "last_name": "Patient"}, {"first_name", "last_name"})
        fields = {"patient_id", "patient_treatment_id", "starts_at", "status"}
        first = database.create_treatment_appointment({
            "patient_id": patient["id"], "starts_at": "2026-09-01 10:00", "status": "attended",
            "new_treatment": {"title": "Endodoncia", "tooth_code": "19", "final_price": 100},
        }, fields, {"patient_id", "title", "tooth_code", "final_price"})
        treatment_id = first["patient_treatment_id"]
        database.insert_record("payments", {"patient_id": patient["id"], "patient_treatment_id": treatment_id, "amount": 100, "payment_date": "2026-09-01"}, {"patient_id", "patient_treatment_id", "amount", "payment_date"})
        database.create_treatment_appointment({"patient_id": patient["id"], "patient_treatment_id": treatment_id, "starts_at": "2026-09-08 10:00"}, fields, set())
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        self.assertEqual(len(database.fetch_all("SELECT * FROM payments")), 1)
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments WHERE patient_treatment_id = ?", (treatment_id,))), 2)
        with self.assertRaises(ValueError):
            database.create_treatment_appointment({"patient_id": 999, "patient_treatment_id": treatment_id, "starts_at": "2026-09-09 10:00"}, fields, set())
        with self.assertRaises(ValueError):
            database.update_record("appointments", first["id"], {"patient_id": 999}, fields)

    def test_new_treatment_rolls_back_when_appointment_fails(self):
        import sqlite3
        patient = database.insert_record("patients", {"first_name": "Test", "last_name": "Patient"}, {"first_name", "last_name"})
        with self.assertRaises(sqlite3.IntegrityError):
            database.create_treatment_appointment({"patient_id": patient["id"], "new_treatment": {"title": "Test"}}, {"patient_id", "patient_treatment_id"}, {"patient_id", "title"})
        self.assertEqual(database.fetch_all("SELECT * FROM patient_treatments"), [])

    def test_upgrade_existing_appointments_is_repeatable(self):
        database.execute("DROP TABLE appointments")
        database.execute("CREATE TABLE appointments (id INTEGER PRIMARY KEY, patient_id INTEGER, starts_at TEXT, updated_at TEXT)")
        database.execute("INSERT INTO appointments (id, patient_id, starts_at) VALUES (1, 1, '2026-09-01 10:00')")
        database.init_db()
        database.init_db()
        old = database.fetch_one("SELECT * FROM appointments WHERE id = 1")
        self.assertIsNone(old["patient_treatment_id"])
        self.assertEqual(old["starts_at"], "2026-09-01 10:00")

    def make_booking(self, patient_id=None, tooth="19", status="scheduled", starts_at="2026-09-01 10:00"):
        if patient_id is None:
            patient_id = database.insert_record("patients", {"first_name": "Test", "last_name": "Patient"}, {"first_name", "last_name"})["id"]
        return database.create_treatment_appointment({
            "patient_id": patient_id, "starts_at": starts_at, "status": status,
            "new_treatment": {"title": "Test", "tooth_code": tooth, "final_price": 100},
        }, {"patient_id", "patient_treatment_id", "starts_at", "status"}, {"patient_id", "title", "tooth_code", "final_price"})

    def test_duplicate_piece_blocked_across_treatments_but_not_patients_or_teeth(self):
        first = self.make_booking()
        with self.assertRaisesRegex(ValueError, "Ya existe una cita pendiente"):
            self.make_booking(first["patient_id"])
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            self.make_booking(tooth="19")
        self.make_booking(first["patient_id"], tooth="18", starts_at="2026-09-01 10:30")
        self.make_booking(tooth="19", starts_at="2026-09-01 11:00")
        database.update_record("appointments", first["id"], {"starts_at": "2026-09-02 11:00"}, {"starts_at"})
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments")), 3)

    def test_weekly_batch_reuses_one_treatment_and_rolls_back_if_any_slot_is_busy(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        other = database.insert_record("patients", {"first_name": "Luis", "last_name": "Vera"}, {"first_name", "last_name"})
        appointment_fields = {"patient_id", "patient_treatment_id", "starts_at", "status"}
        treatment_fields = {"patient_id", "title", "tooth_code", "final_price"}
        dates = ["2026-10-20 10:00", "2026-10-27 10:00", "2026-11-03 10:00", "2026-11-10 10:00"]
        created = database.create_treatment_appointments({
            "patient_id": patient["id"], "starts_at": dates,
            "new_treatment": {"title": "Endodoncia", "tooth_code": "19", "final_price": 100000},
            "status": "scheduled",
        }, appointment_fields, treatment_fields)
        self.assertEqual(len(created), 4)
        self.assertEqual([item["starts_at"] for item in created], dates)
        self.assertEqual(len({item["patient_treatment_id"] for item in created}), 1)
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        with self.assertRaisesRegex(ValueError, "pieza 19"):
            self.make_booking(patient["id"], tooth="19", starts_at="2026-11-17 11:00")
        database.insert_record("appointments", {
            "patient_id": other["id"], "starts_at": "2026-11-24 10:00"
        }, appointment_fields)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.create_treatment_appointments({
                "patient_id": patient["id"],
                "patient_treatment_id": created[0]["patient_treatment_id"],
                "starts_at": ["2026-11-17 10:00", "2026-11-24 10:00"],
            }, appointment_fields, treatment_fields)
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments WHERE patient_id = ?", (patient["id"],))), 4)

    def test_1600_accepts_multiple_patients_but_still_blocks_earlier_overlap(self):
        fields = {"patient_id", "starts_at", "ends_at"}
        patients = [
            database.insert_record("patients", {"first_name": name, "last_name": "Prueba"}, {"first_name", "last_name"})
            for name in ("Ana", "Luis", "Marta", "Pedro")
        ]
        for patient in patients[:2]:
            database.insert_record("appointments", {
                "patient_id": patient["id"], "starts_at": "2026-10-12 16:00"
            }, fields)
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments")), 2)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.insert_record("appointments", {
                "patient_id": patients[0]["id"], "starts_at": "2026-10-12 16:00"
            }, fields)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.insert_record("appointments", {
                "patient_id": patients[2]["id"], "starts_at": "2026-10-12 15:30",
                "ends_at": "2026-10-12 16:30"
            }, fields)
        database.insert_record("appointments", {
            "patient_id": patients[2]["id"], "starts_at": "2026-10-13 15:30",
            "ends_at": "2026-10-13 16:30"
        }, fields)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.insert_record("appointments", {
                "patient_id": patients[3]["id"], "starts_at": "2026-10-13 16:00"
            }, fields)

    def test_occupied_time_blocks_overlapping_citas_and_releases_when_cancelled(self):
        first_patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        second_patient = database.insert_record("patients", {"first_name": "Luis", "last_name": "Vera"}, {"first_name", "last_name"})
        fields = {"patient_id", "starts_at", "ends_at", "status"}
        first = database.insert_record("appointments", {
            "patient_id": first_patient["id"], "starts_at": "2026-10-08 09:00", "ends_at": "2026-10-08 10:00"
        }, fields)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.insert_record("appointments", {
                "patient_id": second_patient["id"], "starts_at": "2026-10-08 09:30"
            }, fields)
        second = database.insert_record("appointments", {
            "patient_id": second_patient["id"], "starts_at": "2026-10-08 10:00"
        }, fields)
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.update_record("appointments", second["id"], {"starts_at": "2026-10-08 09:30"}, fields)
        self.assertEqual(database.fetch_one("SELECT starts_at FROM appointments WHERE id = ?", (second["id"],))["starts_at"], "2026-10-08 10:00")
        database.update_record("appointments", first["id"], {"status": "cancelled"}, fields)
        database.update_record("appointments", second["id"], {"starts_at": "2026-10-08 09:30"}, fields)
        self.assertEqual(database.fetch_one("SELECT starts_at FROM appointments WHERE id = ?", (second["id"],))["starts_at"], "2026-10-08 09:30")

    def test_busy_time_rolls_back_new_treatment(self):
        first_patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        second_patient = database.insert_record("patients", {"first_name": "Luis", "last_name": "Vera"}, {"first_name", "last_name"})
        database.insert_record("appointments", {
            "patient_id": first_patient["id"], "starts_at": "2026-10-08 11:00"
        }, {"patient_id", "starts_at"})
        with self.assertRaisesRegex(ValueError, "hora seleccionada"):
            database.create_treatment_appointment({
                "patient_id": second_patient["id"], "starts_at": "2026-10-08 11:00",
                "new_treatment": {"title": "Resina", "tooth_code": "12", "final_price": 10000}
            }, {"patient_id", "patient_treatment_id", "starts_at"}, {"patient_id", "title", "tooth_code", "final_price"})
        self.assertEqual(database.fetch_all("SELECT * FROM patient_treatments"), [])
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments")), 1)

    def test_multi_tooth_booking_blocks_any_shared_pending_tooth(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        fields = {"patient_id", "patient_treatment_id", "starts_at", "status"}
        first = database.create_treatment_appointment({
            "patient_id": patient["id"], "starts_at": "2026-10-08 09:00",
            "new_treatment": {"title": "Puente", "tooth_code": "11,12"},
        }, fields, {"patient_id", "title", "tooth_code"})
        with self.assertRaisesRegex(ValueError, "pieza 12"):
            database.create_treatment_appointment({
                "patient_id": patient["id"], "starts_at": "2026-10-09 10:00",
                "new_treatment": {"title": "Otro", "tooth_code": "12,13"},
            }, fields, {"patient_id", "title", "tooth_code"})
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        database.update_record("appointments", first["id"], {"status": "attended"}, {"status"})
        later = database.create_treatment_appointment({
            "patient_id": patient["id"], "starts_at": "2026-10-09 10:00",
            "new_treatment": {"title": "Otro", "tooth_code": "12,13"},
        }, fields, {"patient_id", "title", "tooth_code"})
        self.assertIsNotNone(later["id"])

    def test_cancel_and_rebook_sync_treatment_without_changing_payments(self):
        first = self.make_booking()
        tid = first["patient_treatment_id"]
        database.insert_record("payments", {"patient_id": first["patient_id"], "patient_treatment_id": tid, "amount": 40, "payment_date": "2026-09-01"}, {"patient_id", "patient_treatment_id", "amount", "payment_date"})
        database.update_record("appointments", first["id"], {"status": "cancelled"}, {"status"})
        treatment = database.fetch_one("SELECT * FROM patient_treatments WHERE id = ?", (tid,))
        self.assertEqual(treatment["status"], "cancelled")
        self.assertEqual(treatment["final_price"], 100)
        second = database.insert_record("appointments", {"patient_id": first["patient_id"], "patient_treatment_id": tid, "starts_at": "2026-09-08 10:00"}, {"patient_id", "patient_treatment_id", "starts_at"})
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (tid,))["status"], "planned")
        database.update_record("appointments", first["id"], {"status": "scheduled"}, {"status"})
        self.assertEqual(database.fetch_one("SELECT status FROM appointments WHERE id = ?", (first["id"],))["status"], "scheduled")
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        self.assertEqual(database.fetch_one("SELECT SUM(amount) AS paid FROM payments")["paid"], 40)
        database.update_record("appointments", second["id"], {"status": "attended"}, {"status"})
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (tid,))["status"], "in_progress")

    def test_standalone_session_starts_linked_treatment_atomically(self):
        booking = self.make_booking()
        treatment_id = booking["patient_treatment_id"]
        session = database.insert_record("clinical_sessions", {
            "patient_id": booking["patient_id"],
            "patient_treatment_id": treatment_id,
            "session_date": "2026-09-01 10:15",
        }, {"patient_id", "patient_treatment_id", "session_date"})
        self.assertEqual(session["patient_treatment_id"], treatment_id)
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (treatment_id,))["status"], "in_progress")

    def test_linking_existing_session_starts_treatment(self):
        booking = self.make_booking()
        treatment_id = booking["patient_treatment_id"]
        session = database.insert_record("clinical_sessions", {
            "patient_id": booking["patient_id"], "session_date": "2026-09-01 10:15",
        }, {"patient_id", "session_date"})
        database.update_record("clinical_sessions", session["id"], {
            "patient_treatment_id": treatment_id,
        }, {"patient_treatment_id"})
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (treatment_id,))["status"], "in_progress")

    def test_standalone_session_rolls_back_if_treatment_sync_fails(self):
        import sqlite3
        booking = self.make_booking()
        database.execute("""
            CREATE TRIGGER fail_session_treatment BEFORE UPDATE OF status ON patient_treatments
            WHEN NEW.status = 'in_progress' BEGIN SELECT RAISE(ABORT, 'blocked'); END
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            database.insert_record("clinical_sessions", {
                "patient_id": booking["patient_id"],
                "patient_treatment_id": booking["patient_treatment_id"],
                "session_date": "2026-09-01 10:15",
            }, {"patient_id", "patient_treatment_id", "session_date"})
        self.assertEqual(database.fetch_all("SELECT * FROM clinical_sessions"), [])
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (booking["patient_treatment_id"],))["status"], "planned")

    def test_attending_appointment_saves_one_session_and_keeps_original_notes(self):
        booking = self.make_booking()
        database.update_record("appointments", booking["id"], {"notes": "Alergia comunicada por paciente"}, {"notes"})
        payload = {
            "patient_id": booking["patient_id"],
            "patient_treatment_id": booking["patient_treatment_id"],
            "session_date": "2026-09-01 10:15",
            "reason": "Control endodontico",
        }
        fields = {"patient_id", "patient_treatment_id", "session_date", "reason"}
        result = database.attend_appointment_with_session(booking["id"], payload, fields)
        self.assertEqual(result["appointment"]["status"], "attended")
        self.assertEqual(result["appointment"]["notes"], "Alergia comunicada por paciente")
        self.assertEqual(result["session"]["patient_treatment_id"], booking["patient_treatment_id"])
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (booking["patient_treatment_id"],))["status"], "in_progress")
        with self.assertRaisesRegex(ValueError, "cita pendiente"):
            database.attend_appointment_with_session(booking["id"], payload, fields)
        self.assertEqual(len(database.fetch_all("SELECT * FROM clinical_sessions")), 1)

    def test_attending_appointment_rejects_mismatched_patient_and_treatment(self):
        booking = self.make_booking()
        other_patient = database.insert_record("patients", {"first_name": "Otra", "last_name": "Persona"}, {"first_name", "last_name"})
        other_treatment = database.insert_record("patient_treatments", {"patient_id": booking["patient_id"], "title": "Otro"}, {"patient_id", "title"})
        fields = {"patient_id", "patient_treatment_id", "session_date"}
        payload = {"patient_id": other_patient["id"], "session_date": "2026-09-01 10:15"}
        with self.assertRaisesRegex(ValueError, "paciente de la cita"):
            database.attend_appointment_with_session(booking["id"], payload, fields)
        payload["patient_id"] = booking["patient_id"]
        payload["patient_treatment_id"] = other_treatment["id"]
        with self.assertRaisesRegex(ValueError, "tratamiento de la cita"):
            database.attend_appointment_with_session(booking["id"], payload, fields)
        self.assertEqual(database.fetch_all("SELECT * FROM clinical_sessions"), [])
        self.assertEqual(database.fetch_one("SELECT status FROM appointments WHERE id = ?", (booking["id"],))["status"], "scheduled")

    def test_attending_appointment_rolls_back_session_if_status_update_fails(self):
        import sqlite3
        booking = self.make_booking()
        database.execute("""
            CREATE TRIGGER fail_attendance BEFORE UPDATE OF status ON appointments
            WHEN NEW.status = 'attended' BEGIN SELECT RAISE(ABORT, 'blocked'); END
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            database.attend_appointment_with_session(booking["id"], {
                "patient_id": booking["patient_id"],
                "session_date": "2026-09-01 10:15",
            }, {"patient_id", "patient_treatment_id", "session_date"})
        self.assertEqual(database.fetch_all("SELECT * FROM clinical_sessions"), [])
        self.assertEqual(database.fetch_one("SELECT status FROM appointments WHERE id = ?", (booking["id"],))["status"], "scheduled")

    def test_attended_and_missed_allow_next_booking(self):
        for day, status in enumerate(("attended", "missed"), start=1):
            with self.subTest(status=status):
                slot = f"2026-09-0{day} 10:00"
                first = self.make_booking(status=status, starts_at=slot)
                self.make_booking(first["patient_id"], starts_at=slot)

    def test_changing_treatment_to_occupied_piece_rolls_back(self):
        first = self.make_booking()
        second = self.make_booking(first["patient_id"], tooth="18", starts_at="2026-09-01 10:30")
        with self.assertRaises(ValueError):
            database.update_record("patient_treatments", second["patient_treatment_id"], {"tooth_code": "19"}, {"tooth_code"})
        self.assertEqual(database.fetch_one("SELECT tooth_code FROM patient_treatments WHERE id = ?", (second["patient_treatment_id"],))["tooth_code"], "18")

    def test_concurrent_bookings_only_create_one_appointment(self):
        from concurrent.futures import ThreadPoolExecutor
        patient = database.insert_record("patients", {"first_name": "Test", "last_name": "Patient"}, {"first_name", "last_name"})
        def book():
            try:
                self.make_booking(patient["id"])
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: book(), range(2)))
        self.assertEqual(sorted(outcomes), [False, True])
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments")), 1)

    def test_previous_cancellation_is_repaired_once(self):
        first = self.make_booking()
        database.execute("UPDATE appointments SET status = 'cancelled' WHERE id = ?", (first["id"],))
        database.execute("DELETE FROM app_migrations WHERE name = 'appointment_cancellations_v1'")
        database.init_db()
        tid = first["patient_treatment_id"]
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (tid,))["status"], "cancelled")
        database.update_record("patient_treatments", tid, {"status": "planned"}, {"status"})
        database.init_db()
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (tid,))["status"], "planned")

    def test_legacy_link_recovers_exact_match_and_cancellation(self):
        first = self.make_booking()
        database.execute("UPDATE patient_treatments SET start_date = '2026-09-01' WHERE id = ?", (first["patient_treatment_id"],))
        database.execute("UPDATE appointments SET patient_treatment_id = NULL, reason = ?, status = 'cancelled' WHERE id = ?", (f"Test {chr(183)} Pieza 19", first["id"]))
        database.execute("DELETE FROM app_migrations")
        database.init_db()
        self.assertEqual(database.fetch_one("SELECT patient_treatment_id FROM appointments WHERE id = ?", (first["id"],))["patient_treatment_id"], first["patient_treatment_id"])
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (first["patient_treatment_id"],))["status"], "cancelled")

    def test_ambiguous_legacy_links_are_preserved(self):
        first = self.make_booking(status="attended")
        self.make_booking(first["patient_id"], status="attended")
        database.execute("UPDATE patient_treatments SET start_date = '2026-09-01'")
        database.execute("UPDATE appointments SET patient_treatment_id = NULL, reason = ?", (f"Test {chr(183)} Pieza 19",))
        database.execute("DELETE FROM app_migrations")
        database.init_db()
        self.assertTrue(all(row["patient_treatment_id"] is None for row in database.fetch_all("SELECT * FROM appointments")))

    def test_sessions_payments_and_attachments_cannot_cross_patient_treatments(self):
        first_patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Uno"}, {"first_name", "last_name"})
        other_patient = database.insert_record("patients", {"first_name": "Bea", "last_name": "Dos"}, {"first_name", "last_name"})
        treatment = database.insert_record("patient_treatments", {"patient_id": first_patient["id"], "title": "Endodoncia"}, {"patient_id", "title"})
        session = database.insert_record("clinical_sessions", {"patient_id": first_patient["id"], "patient_treatment_id": treatment["id"], "session_date": "2026-09-01 10:00"}, {"patient_id", "patient_treatment_id", "session_date"})

        with self.assertRaisesRegex(ValueError, "mismo paciente"):
            database.insert_record("clinical_sessions", {"patient_id": other_patient["id"], "patient_treatment_id": treatment["id"], "session_date": "2026-09-02 10:00"}, {"patient_id", "patient_treatment_id", "session_date"})
        with self.assertRaisesRegex(ValueError, "mismo paciente"):
            database.insert_record("payments", {"patient_id": other_patient["id"], "patient_treatment_id": treatment["id"], "payment_date": "2026-09-02", "amount": 10}, {"patient_id", "patient_treatment_id", "payment_date", "amount"})
        with self.assertRaisesRegex(ValueError, "mismo paciente"):
            database.insert_record("attachments", {"patient_id": other_patient["id"], "clinical_session_id": session["id"], "file_type": "document", "original_filename": "x.pdf", "stored_path": "media/pacientes/x.pdf"}, {"patient_id", "clinical_session_id", "file_type", "original_filename", "stored_path"})

        payment = database.insert_record("payments", {"patient_id": first_patient["id"], "patient_treatment_id": treatment["id"], "payment_date": "2026-09-02", "amount": 10}, {"patient_id", "patient_treatment_id", "payment_date", "amount"})
        with self.assertRaisesRegex(ValueError, "mismo paciente"):
            database.update_record("payments", payment["id"], {"patient_id": other_patient["id"]}, {"patient_id", "patient_treatment_id", "payment_date", "amount"})
        with self.assertRaisesRegex(ValueError, "No se puede cambiar el paciente"):
            database.update_record("patient_treatments", treatment["id"], {"patient_id": other_patient["id"]}, {"patient_id", "title"})

    def test_fetch_all_returns_dicts(self):
        database.insert_record(
            "patients",
            {"first_name": "Luis", "last_name": "Diaz"},
            {"first_name", "last_name"},
        )
        rows = database.fetch_all("SELECT * FROM patients")
        self.assertEqual(rows[0]["last_name"], "Diaz")


if __name__ == "__main__":
    unittest.main()
