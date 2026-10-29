import json
import unittest
from backend import database, queries
from tests import test_database


class QueryTests(unittest.TestCase):
    setUp = test_database.DatabaseTests.setUp
    tearDown = test_database.DatabaseTests.tearDown

    def records(self):
        patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Rios"}, {"first_name", "last_name"})
        treatment = database.create_itemized_patient_treatment({"patient_id": patient["id"], "title": "Plan", "start_date": "2026-10-01",
            "procedures": [{"name": "Resina", "price": 1000000}]}, {"patient_id", "title", "start_date", "estimated_price", "final_price", "procedure_items_json"})
        return patient, treatment

    def test_calendar_range_includes_both_days_and_overdue_has_its_own_scope(self):
        patient, treatment = self.records()
        for start, status in (("2026-09-01 09:00", "scheduled"), ("2026-10-01T09:00", "scheduled"),
                              ("2026-10-02 16:00", "attended"), ("2026-10-03 09:00", "scheduled")):
            database.execute("INSERT INTO appointments (patient_id,starts_at,status) VALUES (?,?,?)", (patient["id"], start, status))
        rows = queries.appointment_list({"date_from": ["2026-10-01"], "date_to": ["2026-10-02"]})
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[-1]["status"], "attended")
        overdue = queries.appointment_list({"overdue_before": ["2026-10-01T10:00:00"]})
        self.assertEqual([row["starts_at"] for row in overdue], ["2026-09-01 09:00", "2026-10-01T09:00"])
        self.assertEqual(len(queries.appointment_list({"status": ["scheduled"]})), 3)

    def test_pages_are_stable_complete_and_clamped(self):
        patient, treatment = self.records()
        for i in range(45):
            database.execute("INSERT INTO payments (patient_id,patient_treatment_id,payment_date,amount) VALUES (?,?,?,?)", (patient["id"], treatment["id"], "2026-10-29", 100))
        pages = [queries.payment_page({"page": [str(page)]}) for page in (1, 2, 3)]
        self.assertEqual([len(page["items"]) for page in pages], [20, 20, 5])
        ids = [row["id"] for page in pages for row in page["items"]]
        self.assertEqual(ids, sorted(ids, reverse=True))
        self.assertEqual(len(set(ids)), 45)
        self.assertEqual(pages[0]["total"], 45)
        self.assertEqual(queries.payment_page({"page": ["999"]})["page"], 3)

    def test_filters_and_balance_rows_use_all_payments(self):
        patient, treatment = self.records()
        other, other_treatment = self.records()
        for owner, plan, day, amount in ((patient, treatment, "2026-09-01", 100), (patient, treatment, "2026-10-29", 200), (other, other_treatment, "2026-10-29", 400)):
            database.execute("INSERT INTO payments (patient_id,patient_treatment_id,payment_date,amount) VALUES (?,?,?,?)", (owner["id"], plan["id"], day, amount))
        filtered = queries.payment_page({"page": ["1"], "date_from": ["2026-10-29"], "date_to": ["2026-10-29"], "patient_id": [str(patient["id"])], "state": ["partial"]})
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["items"][0]["amount"], 200)
        pending = queries.payment_page({"page": ["1"], "view": ["balances"], "patient_treatment_id": [str(treatment["id"])], "date_to": ["2026-10-01"]})
        self.assertEqual(pending["total"], 1)
        self.assertEqual(pending["items"][0]["amount"], 999700)
        self.assertEqual(queries.payment_page({"page": ["1"], "view": ["balances"], "patient_treatment_id": ["none"]})["total"], 0)

    def test_summary_groups_batches_and_preserves_real_procedure_assignments(self):
        patient, treatment = self.records()
        line_id = json.loads(treatment["procedure_items_json"])[0]["line_id"]
        for amount in (100, 200):
            database.execute("INSERT INTO payments (patient_id,patient_treatment_id,payment_date,amount,method,payment_batch_id,procedure_allocations_json) VALUES (?,?,?,?,?,?,?)",
                (patient["id"], treatment["id"], "2026-10-29", amount, "Transferencia", "one-receipt", json.dumps([{"line_id": line_id, "amount": amount}])))
        database.execute("INSERT INTO payments (patient_id,payment_date,amount) VALUES (?,?,?)", (patient["id"], "2026-09-01", 400))
        summary = queries.payment_summary({"date": ["2026-10-29"]})
        self.assertEqual(summary["metrics"]["today_total"], 300)
        self.assertEqual(summary["metrics"]["today_count"], 1)
        self.assertEqual(summary["metrics"]["pending_total"], 999300)
        self.assertEqual(summary["metrics"]["transfer_percent"], 67)
        linked = next(row for row in summary["ledger"] if row["patient_treatment_id"])
        self.assertEqual(json.loads(linked["procedure_allocations_json"]), [{"line_id": line_id, "amount": 300}])
        self.assertNotIn("notes", linked)

    def test_invalid_queries_are_rejected_and_empty_pages_are_valid(self):
        for query in ({"page": ["0"]}, {"page": ["1"], "page_size": ["21"]}, {"page": ["1"], "state": ["fake"]},
                      {"page": ["1"], "patient_id": ["1 OR 1=1"]}, {"page": ["1", "2"]}, {"page": ["1"], "date_from": ["2026-02-30"]},
                      {"page": ["1"], "date_from": ["2026-11-01"], "date_to": ["2026-10-01"]}):
            with self.subTest(query=query), self.assertRaises(ValueError):
                queries.payment_page(query)
        with self.assertRaises(ValueError):
            queries.appointment_list({"overdue_before": ["2026-10-01T10:00:00Z"]})
        empty = queries.payment_page({"page": ["2"]})
        self.assertEqual((empty["total"], empty["page"], empty["total_pages"], empty["items"]), (0, 1, 1, []))
