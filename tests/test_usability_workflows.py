import json
import unittest

from backend import database
from tests import test_database


class UsabilityWorkflowTests(unittest.TestCase):
    setUp = test_database.DatabaseTests.setUp
    tearDown = test_database.DatabaseTests.tearDown

    def test_shared_editor_rolls_back_metadata_and_price_on_conflicting_teeth(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        fields = {"patient_id", "title", "procedure_items_json", "estimated_price", "final_price", "tooth_code", "start_date"}
        first = database.create_itemized_patient_treatment({"patient_id": patient["id"], "title": "Plan original", "start_date": "2026-11-01", "procedures": [{"name": "Resina", "tooth_code": "1", "price": 100}]}, fields)
        other = database.create_itemized_patient_treatment({"patient_id": patient["id"], "title": "Otro plan", "procedures": [{"name": "Resina", "tooth_code": "2", "price": 100}]}, fields)
        appointment_fields = {"patient_id", "patient_treatment_id", "starts_at", "status"}
        for treatment, time in ((first, "09:00"), (other, "10:00")):
            database.insert_record("appointments", {"patient_id": patient["id"], "patient_treatment_id": treatment["id"], "starts_at": "2026-11-02 " + time, "status": "scheduled"}, appointment_fields)
        items = json.loads(first["procedure_items_json"])
        with self.assertRaisesRegex(ValueError, "pieza"):
            database.update_treatment_procedures(first["id"], {"title": "Cambio inválido", "status": "completed", "procedures": [{**items[0], "tooth_code": "2", "price": 200}]})
        saved = database.fetch_one("SELECT * FROM patient_treatments WHERE id = ?", (first["id"],))
        self.assertEqual((saved["title"], saved["final_price"], saved["tooth_code"]), ("Plan original", 100, "1"))
        with self.assertRaisesRegex(ValueError, "fecha de término"):
            database.update_treatment_procedures(first["id"], {"end_date": "2026-10-01", "procedures": items})

    def test_legacy_budget_cannot_drop_below_payments(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        fields = {"patient_id", "title", "final_price"}
        treatment = database.insert_record("patient_treatments", {"patient_id": patient["id"], "title": "Plan", "final_price": 100}, fields)
        database.insert_record("payments", {"patient_id": patient["id"], "patient_treatment_id": treatment["id"], "payment_date": "2026-10-29", "amount": 40}, {"patient_id", "patient_treatment_id", "payment_date", "amount"})
        with self.assertRaisesRegex(ValueError, "abonos"):
            database.update_record("patient_treatments", treatment["id"], {"title": "No guardar", "final_price": 30}, fields)
        self.assertEqual(database.fetch_one("SELECT title FROM patient_treatments WHERE id = ?", (treatment["id"],))["title"], "Plan")

    def test_budget_without_appointment_uses_server_pricing(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        payload = {"patient_id": patient["id"], "title": "Plan", "procedures": [
            {"name": "Limpieza", "tooth_code": "1,2", "price": 10000},
            {"name": "Resina", "tooth_code": "3", "price": 20000, "discount_type": "percent", "discount_value": 10}
        ], "total_discount_type": "amount", "total_discount_value": 3000}
        fields = {"patient_id", "title", "tooth_code", "estimated_price", "final_price", "procedure_items_json", "total_discount_type", "total_discount_value"}
        treatment = database.create_itemized_patient_treatment(payload, fields)
        self.assertEqual(treatment["final_price"], 25000)
        self.assertEqual(treatment["tooth_code"], "1,2,3")
        self.assertEqual(len(json.loads(treatment["procedure_items_json"])), 2)
        self.assertEqual(database.fetch_all("SELECT * FROM appointments"), [])
        with self.assertRaises(ValueError):
            database.create_itemized_patient_treatment({**payload, "final_price": 1}, fields)

    def test_batch_followup_budget_and_previous_visit_are_atomic(self):
        fields = {"patient_id", "patient_treatment_id", "starts_at", "status"}
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        other = database.insert_record("patients", {"first_name": "Luis", "last_name": "Rios"}, {"first_name", "last_name"})
        treatment = database.insert_record("patient_treatments", {"patient_id": patient["id"], "title": "Plan", "final_price": 100}, {"patient_id", "title", "final_price"})
        previous = database.insert_record("appointments", {"patient_id": patient["id"], "patient_treatment_id": treatment["id"], "starts_at": "2026-11-01 09:00", "status": "scheduled"}, fields)
        database.insert_record("appointments", {"patient_id": other["id"], "starts_at": "2026-11-15 09:00", "status": "scheduled"}, fields)
        payload = {"patient_id": patient["id"], "patient_treatment_id": treatment["id"], "status": "scheduled",
            "starts_at": ["2026-11-08 09:00", "2026-11-15 09:00"], "followup_for_appointment_id": previous["id"],
            "treatment_update": {"title": "Plan actualizado", "procedures": [{"name": "Resina", "price": 150}]}}
        with self.assertRaisesRegex(ValueError, "ocupada"):
            database.create_treatment_appointments(payload, fields, set())
        self.assertEqual(database.fetch_one("SELECT status FROM appointments WHERE id = ?", (previous["id"],))["status"], "scheduled")
        self.assertEqual(database.fetch_one("SELECT final_price FROM patient_treatments WHERE id = ?", (treatment["id"],))["final_price"], 100)
        payload["starts_at"][1] = "2026-11-15 09:30"
        self.assertEqual(len(database.create_treatment_appointments(payload, fields, set())), 2)
        self.assertEqual(database.fetch_one("SELECT status FROM appointments WHERE id = ?", (previous["id"],))["status"], "attended")
        self.assertEqual(database.fetch_one("SELECT final_price FROM patient_treatments WHERE id = ?", (treatment["id"],))["final_price"], 150)
