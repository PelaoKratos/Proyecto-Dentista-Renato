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

    def test_appointment_rejects_invalid_datetime(self):
        with self.assertRaisesRegex(ValueError, "starts_at"):
            validate_appointment({"patient_id": 1, "starts_at": "fecha-mala"})

    def test_treatment_rejects_unknown_status(self):
        with self.assertRaisesRegex(ValueError, "status"):
            validate_patient_treatment({"patient_id": 1, "title": "Implante", "status": "activo"})

    def test_payment_rejects_negative_amount(self):
        with self.assertRaisesRegex(ValueError, "amount"):
            validate_payment({"patient_id": 1, "payment_date": "2026-09-03", "amount": -1})


if __name__ == "__main__":
    unittest.main()
