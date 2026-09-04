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
