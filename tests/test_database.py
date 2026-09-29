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
            "new_treatment": {"title": "Endodoncia", "tooth_code": "36", "final_price": 100},
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

    def make_booking(self, patient_id=None, tooth="36", status="scheduled"):
        if patient_id is None:
            patient_id = database.insert_record("patients", {"first_name": "Test", "last_name": "Patient"}, {"first_name", "last_name"})["id"]
        return database.create_treatment_appointment({
            "patient_id": patient_id, "starts_at": "2026-09-01 10:00", "status": status,
            "new_treatment": {"title": "Test", "tooth_code": tooth, "final_price": 100},
        }, {"patient_id", "patient_treatment_id", "starts_at", "status"}, {"patient_id", "title", "tooth_code", "final_price"})

    def test_duplicate_piece_blocked_across_treatments_but_not_patients_or_teeth(self):
        first = self.make_booking()
        with self.assertRaisesRegex(ValueError, "Ya existe una cita pendiente"):
            self.make_booking(first["patient_id"])
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        self.make_booking(first["patient_id"], tooth="37")
        self.make_booking(tooth="36")
        database.update_record("appointments", first["id"], {"starts_at": "2026-09-02 11:00"}, {"starts_at"})
        self.assertEqual(len(database.fetch_all("SELECT * FROM appointments")), 3)

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
        with self.assertRaises(ValueError):
            database.update_record("appointments", first["id"], {"status": "scheduled"}, {"status"})
        self.assertEqual(database.fetch_one("SELECT status FROM appointments WHERE id = ?", (first["id"],))["status"], "cancelled")
        self.assertEqual(len(database.fetch_all("SELECT * FROM patient_treatments")), 1)
        self.assertEqual(database.fetch_one("SELECT SUM(amount) AS paid FROM payments")["paid"], 40)
        database.update_record("appointments", second["id"], {"status": "attended"}, {"status"})
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (tid,))["status"], "in_progress")

    def test_attended_and_missed_allow_next_booking(self):
        for status in ("attended", "missed"):
            with self.subTest(status=status):
                first = self.make_booking(status=status)
                self.make_booking(first["patient_id"])

    def test_changing_treatment_to_occupied_piece_rolls_back(self):
        first = self.make_booking()
        second = self.make_booking(first["patient_id"], tooth="37")
        with self.assertRaises(ValueError):
            database.update_record("patient_treatments", second["patient_treatment_id"], {"tooth_code": "36"}, {"tooth_code"})
        self.assertEqual(database.fetch_one("SELECT tooth_code FROM patient_treatments WHERE id = ?", (second["patient_treatment_id"],))["tooth_code"], "37")

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
        database.execute("UPDATE appointments SET patient_treatment_id = NULL, reason = ?, status = 'cancelled' WHERE id = ?", (f"Test {chr(183)} Pieza 36", first["id"]))
        database.execute("DELETE FROM app_migrations")
        database.init_db()
        self.assertEqual(database.fetch_one("SELECT patient_treatment_id FROM appointments WHERE id = ?", (first["id"],))["patient_treatment_id"], first["patient_treatment_id"])
        self.assertEqual(database.fetch_one("SELECT status FROM patient_treatments WHERE id = ?", (first["patient_treatment_id"],))["status"], "cancelled")

    def test_ambiguous_legacy_links_are_preserved(self):
        first = self.make_booking(status="attended")
        self.make_booking(first["patient_id"], status="attended")
        database.execute("UPDATE patient_treatments SET start_date = '2026-09-01'")
        database.execute("UPDATE appointments SET patient_treatment_id = NULL, reason = ?", (f"Test {chr(183)} Pieza 36",))
        database.execute("DELETE FROM app_migrations")
        database.init_db()
        self.assertTrue(all(row["patient_treatment_id"] is None for row in database.fetch_all("SELECT * FROM appointments")))

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
