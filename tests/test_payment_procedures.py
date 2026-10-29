import json
import unittest

from backend import database, payment_procedures
from tests import test_database


class ProcedurePaymentTests(unittest.TestCase):
    setUp = test_database.DatabaseTests.setUp
    tearDown = test_database.DatabaseTests.tearDown
    payment_fields = {"patient_id", "patient_treatment_id", "payment_date", "amount", "method"}

    def treatment(self, patient=None):
        patient = patient or database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        treatment = database.create_itemized_patient_treatment({"patient_id": patient["id"], "title": "Plan", "procedures": [
            {"name": "Resina", "tooth_code": "1,2", "price": 10000, "discount_type": "percent", "discount_value": 10},
            {"name": "Limpieza", "price": 20000}], "total_discount_value": 3000},
            {"patient_id", "title", "procedure_items_json", "estimated_price", "final_price", "total_discount_type", "total_discount_value"})
        return patient, treatment, json.loads(treatment["procedure_items_json"])

    def payment(self, patient, treatment, amount, parts=None):
        data = {"patient_id": patient["id"], "patient_treatment_id": treatment["id"], "payment_date": "2026-10-29", "amount": amount}
        if parts is not None:
            data["procedure_allocations"] = parts
        return database.insert_record("payments", data, self.payment_fields)

    def test_legacy_payments_stay_unassigned_and_migration_is_idempotent(self):
        patient, treatment, items = self.treatment()
        payment = self.payment(patient, treatment, 5000)
        database.execute("UPDATE payments SET procedure_allocations_json = NULL WHERE id = ?", (payment["id"],))
        database.execute("UPDATE patient_treatments SET procedure_items_json = ? WHERE id = ?", (
            json.dumps([{key: value for key, value in item.items() if key != "line_id"} for item in items]), treatment["id"]))
        database.init_db()
        migrated = database.fetch_one("SELECT * FROM patient_treatments WHERE id = ?", (treatment["id"],))
        database.init_db()
        self.assertIsNone(database.fetch_one("SELECT * FROM payments WHERE id = ?", (payment["id"],))["procedure_allocations_json"])
        self.assertEqual(database.fetch_one("SELECT * FROM patient_treatments WHERE id = ?", (treatment["id"],))["procedure_items_json"], migrated["procedure_items_json"])
        assigned = database.update_record("payments", payment["id"], {"procedure_allocations": [{"line_id": json.loads(migrated["procedure_items_json"])[0]["line_id"], "amount": 5000}]}, self.payment_fields)
        self.assertEqual(json.loads(assigned["procedure_allocations_json"])[0]["amount"], 5000)
        self.assertEqual(database.fetch_all("SELECT * FROM audit_log WHERE entity_type = 'payment' AND action = 'updated'")[-1]["entity_id"], payment["id"])

    def test_exact_discount_totals_and_payment_caps(self):
        patient, treatment, items = self.treatment()
        limits = payment_procedures.totals(treatment)
        self.assertEqual(sum(limits.values()), treatment["final_price"])
        parts = [{"line_id": items[0]["line_id"], "amount": 5000}]
        payment = self.payment(patient, treatment, 6000, parts)
        self.assertEqual(json.loads(payment["procedure_allocations_json"]), parts)
        with self.assertRaisesRegex(ValueError, "saldo pendiente del tratamiento"):
            self.payment(patient, treatment, 30000)
        for invalid in ([{"line_id": "foreign", "amount": 1}], parts + parts,
                        [{"line_id": items[0]["line_id"], "amount": limits[items[0]["line_id"]]}],
                        [{"line_id": items[1]["line_id"], "amount": True}],
                        [{"line_id": items[1]["line_id"], "amount": 1.5}],
                        [{"line_id": items[1]["line_id"], "amount": 1001}]):
            with self.assertRaises(ValueError):
                self.payment(patient, treatment, 1000, invalid)
        self.assertEqual(len(database.fetch_all("SELECT * FROM payments")), 1)
        with self.assertRaises(ValueError):
            database.update_record("payments", payment["id"], {"amount": 4000}, self.payment_fields)
        self.assertEqual(database.fetch_one("SELECT amount FROM payments WHERE id = ?", (payment["id"],))["amount"], 6000)

    def test_batch_rolls_back_when_later_procedure_assignment_fails(self):
        patient, first, items = self.treatment()
        _, second, second_items = self.treatment(patient)
        with self.assertRaises(ValueError):
            database.create_payment_batch({"patient_id": patient["id"], "payment_date": "2026-10-29", "allocations": [
                {"patient_treatment_id": first["id"], "amount": 1000, "procedure_allocations": [{"line_id": items[0]["line_id"], "amount": 1000}]},
                {"patient_treatment_id": second["id"], "amount": 1000, "procedure_allocations": [{"line_id": items[0]["line_id"], "amount": 1000}]}]})
        self.assertEqual(database.fetch_all("SELECT * FROM payments"), [])
        saved = database.create_payment_batch({"patient_id": patient["id"], "payment_date": "2026-10-29", "allocations": [
            {"patient_treatment_id": first["id"], "amount": 1000, "procedure_allocations": [{"line_id": items[0]["line_id"], "amount": 1000}]},
            {"patient_treatment_id": second["id"], "amount": 2000, "procedure_allocations": [{"line_id": second_items[1]["line_id"], "amount": 1500}]}]})
        self.assertEqual(saved["total"], 3000)
        self.assertEqual(json.loads(saved["payments"][1]["procedure_allocations_json"]), [{"line_id": second_items[1]["line_id"], "amount": 1500}])

    def test_reordering_keeps_assignments_and_paid_lines_cannot_be_removed(self):
        patient, treatment, items = self.treatment()
        self.payment(patient, treatment, 5000, [{"line_id": items[0]["line_id"], "amount": 5000}])
        updated = database.update_treatment_procedures(treatment["id"], {"procedures": list(reversed(items))})
        self.assertEqual(json.loads(updated["procedure_items_json"])[1]["line_id"], items[0]["line_id"])
        with self.assertRaisesRegex(ValueError, "abonos asignados"):
            database.update_treatment_procedures(treatment["id"], {"procedures": [items[1]]})
        with self.assertRaisesRegex(ValueError, "abonos asignados"):
            database.update_treatment_procedures(treatment["id"], {"procedures": [{**items[0], "price": 4000}, items[1]]})
