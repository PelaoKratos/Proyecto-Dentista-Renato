import unittest

from backend.validation import (
    validate_appointment,
    validate_patient,
    validate_patient_treatment,
    validate_payment,
)


class ValidationTests(unittest.TestCase):
    def test_patient_requires_name_fields(self):
        with self.assertRaisesRegex(ValueError, "last_name"):
            validate_patient({"first_name": "Mario"})

    def test_patient_accepts_partial_update(self):
        payload = validate_patient({"phone": "  +56 9 1111 2222  "}, partial=True)
        self.assertEqual(payload["phone"], "+56 9 1111 2222")

    def test_patient_rejects_invalid_email_and_future_birth_date(self):
        with self.assertRaisesRegex(ValueError, "email"):
            validate_patient({"first_name": "Ana", "last_name": "Test", "email": "correo-invalido"})
        from datetime import date, timedelta
        with self.assertRaisesRegex(ValueError, "futuro"):
            validate_patient({"first_name": "Ana", "last_name": "Test", "birth_date": (date.today() + timedelta(days=1)).isoformat()})

    def test_invalid_ids_are_rejected_and_partial_omissions_are_preserved(self):
        with self.assertRaisesRegex(ValueError, "patient_id"):
            validate_payment({"patient_id": "abc", "payment_date": "2026-09-03", "amount": 1})
        update = validate_payment({"notes": "abono"}, partial=True)
        self.assertNotIn("patient_id", update)

    def test_appointment_rejects_invalid_datetime(self):
        with self.assertRaisesRegex(ValueError, "starts_at"):
            validate_appointment({"patient_id": 1, "starts_at": "fecha-mala"})

    def test_treatment_rejects_unknown_status(self):
        with self.assertRaisesRegex(ValueError, "status"):
            validate_patient_treatment({"patient_id": 1, "title": "Implante", "status": "activo"})

    def test_payment_rejects_negative_amount(self):
        with self.assertRaisesRegex(ValueError, "amount"):
            validate_payment({"patient_id": 1, "payment_date": "2026-09-03", "amount": -1})

    def test_payment_rejects_non_finite_amounts(self):
        for value in (float("inf"), float("-inf"), float("nan"), "Infinity", "NaN"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "finito"):
                validate_payment({"patient_id": 1, "payment_date": "2026-09-03", "amount": value})

    def test_appointment_end_must_follow_start(self):
        with self.assertRaisesRegex(ValueError, "posterior"):
            validate_appointment({"patient_id": 1, "starts_at": "2026-09-03 10:00", "ends_at": "2026-09-03 10:00"})


if __name__ == "__main__":
    unittest.main()
