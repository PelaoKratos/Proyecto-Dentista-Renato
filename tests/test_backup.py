import sqlite3
import tempfile
import unittest
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

from backend.backup import create_backup, create_daily_backup_if_due, verify_backup


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "data" / "live.sqlite3"
        self.db.parent.mkdir()
        connection = sqlite3.connect(self.db)
        try:
            connection.execute("CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT)")
            connection.execute("INSERT INTO patients (name) VALUES ('Ana')")
            connection.commit()
        finally:
            connection.close()
        self.media = self.root / "media"
        self.image = self.media / "pacientes" / "000001" / "radiografias" / "rx.png"
        self.image.parent.mkdir(parents=True)
        self.image.write_bytes(b"radiografia de prueba")
        self.backups = self.root / "backups"

    def tearDown(self):
        self.temp.cleanup()

    def test_complete_restore_recovers_database_and_media(self):
        archive = create_backup(self.db, self.media, self.backups)
        restored = self.root / "restored"
        report = verify_backup(archive, restored)
        connection = sqlite3.connect(restored / "data" / "consulta_dental.sqlite3")
        try:
            self.assertEqual(connection.execute("SELECT name FROM patients").fetchone()[0], "Ana")
        finally:
            connection.close()
        self.assertEqual((restored / "media" / self.image.relative_to(self.media)).read_bytes(), self.image.read_bytes())
        self.assertEqual(report["metadata"]["mode"], "manual")
        self.assertEqual(report["files"], 2)

    def test_automatic_backup_runs_once_per_local_day(self):
        first_day = datetime(2026, 9, 29, 8, 0)
        first = create_daily_backup_if_due(self.db, self.media, self.backups, now=first_day)
        self.assertIsNotNone(first)
        self.assertIsNone(create_daily_backup_if_due(self.db, self.media, self.backups, now=first_day + timedelta(hours=3)))
        second = create_daily_backup_if_due(self.db, self.media, self.backups, now=first_day + timedelta(days=1))
        self.assertIsNotNone(second)
        self.assertNotEqual(first, second)
        with zipfile.ZipFile(second) as archive:
            self.assertEqual(__import__("json").loads(archive.read("respaldo-info.json"))["mode"], "automatic")

    def test_legacy_backup_without_manifest_restores_all_files(self):
        legacy = self.backups / "legacy.zip"
        self.backups.mkdir(exist_ok=True)
        with zipfile.ZipFile(legacy, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(self.db, "data/consulta_dental.sqlite3")
            archive.write(self.image, "media/" + self.image.relative_to(self.media).as_posix())
        report = verify_backup(legacy, self.root / "legacy-restored")
        self.assertEqual(report["metadata"]["mode"], "legacy")
        self.assertEqual(report["files"], 2)

    def test_corrupt_archive_is_rejected_before_restoration(self):
        archive = create_backup(self.db, self.media, self.backups)
        archive.write_bytes(b"not a zip")
        with self.assertRaises(zipfile.BadZipFile):
            verify_backup(archive, self.root / "invalid")
