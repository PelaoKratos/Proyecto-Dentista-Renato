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

    def test_treatment_accepts_multiple_numbered_teeth_and_rejects_duplicates(self):
        value = validate_patient_treatment({"patient_id": 1, "title": "Puente", "tooth_code": "21, 11 12"})
        self.assertEqual(value["tooth_code"], "11,12,21")
        with self.assertRaisesRegex(ValueError, "repitas"):
            validate_patient_treatment({"patient_id": 1, "title": "Puente", "tooth_code": "11,11"})
        with self.assertRaisesRegex(ValueError, "entre 1 y 32"):
            validate_patient_treatment({"patient_id": 1, "title": "Puente", "tooth_code": "99"})

    def test_child_treatment_has_twenty_teeth_and_patient_type_is_validated(self):
        self.assertEqual(
            validate_patient_treatment({"patient_id": 1, "title": "Control", "dentition_type": "child", "tooth_code": "20,1"})["tooth_code"],
            "1,20",
        )
        with self.assertRaisesRegex(ValueError, "1 y 20"):
            validate_patient_treatment({"patient_id": 1, "title": "Control", "dentition_type": "child", "tooth_code": "21"})
        with self.assertRaisesRegex(ValueError, "adulto o infantil"):
            validate_patient({"first_name": "Ana", "last_name": "Rios", "dentition_type": "otro"})

    def test_appointment_slots_are_half_hour_from_nine_through_sixteen(self):
        for value in ("09:00", "09:30", "15:30", "16:00"):
            with self.subTest(value=value):
                validate_appointment({"patient_id": 1, "starts_at": f"2026-10-08 {value}"})
        for value in ("08:30", "09:15", "16:30"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "intervalos"):
                validate_appointment({"patient_id": 1, "starts_at": f"2026-10-08 {value}"})

    def test_appointment_end_must_follow_start(self):
        with self.assertRaisesRegex(ValueError, "posterior"):
            validate_appointment({"patient_id": 1, "starts_at": "2026-09-03 10:00", "ends_at": "2026-09-03 10:00"})


if __name__ == "__main__":
    unittest.main()
