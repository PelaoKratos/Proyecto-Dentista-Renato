import http.client
import json
import tempfile
import zipfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from backend import database
from backend.server import DentalRequestHandler, MAX_MULTIPART_BYTES, validate_uploaded_file


class LocalServerSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class SecurityTestHandler(DentalRequestHandler):
            auth_required = False

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), SecurityTestHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method, path, headers=None, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, response.getheaders(), response.read()
        connection.close()
        return result

    def test_json_api_rejects_non_object_payloads_as_client_errors(self):
        status, _headers, body = self.request(
            "POST", "/api/patients",
            headers={"Content-Type": "application/json", "Content-Length": "2"},
            body="[]",
        )
        self.assertEqual(status, 400)
        self.assertIn("objeto JSON", body.decode("utf-8"))

    def test_static_server_hides_project_private_files(self):
        for path in ("/data/consulta_dental.sqlite3", "/backups/private.zip", "/.git/config", "/backend/server.py", "/docs/backend-local.md"):
            with self.subTest(path=path):
                status, _headers, _body = self.request("GET", path)
                self.assertEqual(status, 404)

    def test_static_server_keeps_application_pages_and_assets_public(self):
        for path in ("/", "/agenda.html", "/assets/api.js"):
            with self.subTest(path=path):
                status, headers, body = self.request("GET", path)
                self.assertEqual(status, 200)
                self.assertTrue(body)
                self.assertIn(("X-Content-Type-Options", "nosniff"), headers)
                self.assertFalse(any(key.lower() == "access-control-allow-origin" for key, _ in headers))

    def test_backup_download_streams_exact_file_with_no_cache(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            backup = root / "backups" / "consulta-dental-backup-2026-09-29-1200.zip"
            backup.parent.mkdir()
            backup.write_bytes(b"test zip bytes")
            with patch("backend.server.ROOT_DIR", root):
                status, headers, body = self.request("GET", "/" + backup.relative_to(root).as_posix())
            self.assertEqual(status, 200)
            self.assertEqual(body, backup.read_bytes())
            self.assertIn(("Content-Length", str(len(body))), headers)
            self.assertIn(("Cache-Control", "no-store"), headers)

    def test_static_server_only_exposes_supported_media_extensions(self):
        status, _headers, _body = self.request("GET", "/media/pacientes/000001/injected.html")
        self.assertEqual(status, 404)

    def test_uploads_require_supported_content_signatures(self):
        with self.assertRaisesRegex(ValueError, "Formato no permitido"):
            validate_uploaded_file("rayos.svg", b"<svg><script>alert(1)</script></svg>", "radiography")
        with self.assertRaisesRegex(ValueError, "debe ser una imagen"):
            validate_uploaded_file("nota.pdf", b"%PDF-1.7\ncontenido", "photo")
        name, extension, mime = validate_uploaded_file("C:\\fakepath\\rx.png", b"\x89PNG\r\n\x1a\ncontenido", "radiography")
        self.assertEqual((name, extension, mime), ("rx.png", ".png", "image/png"))

    def test_valid_multipart_upload_is_saved_with_detected_type(self):
        boundary = "dentist-audit-boundary"
        png = b"\x89PNG\r\n\x1a\n" + b"fake image bytes"
        body = b"".join([
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"patient_id\"\r\n\r\n1\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file_type\"\r\n\r\nradiography\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"C:\\\\fakepath\\\\rx.png\"\r\nContent-Type: text/html\r\n\r\n".encode() + png + b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old_data_dir, old_db_path = database.DATA_DIR, database.DB_PATH
            database.DATA_DIR = root / "data"
            database.DB_PATH = root / "data" / "test.sqlite3"
            try:
                database.init_db()
                database.insert_record("patients", {"first_name": "Ana", "last_name": "Prueba"}, {"first_name", "last_name"})
                with patch("backend.server.ROOT_DIR", root), patch("backend.server.MEDIA_DIR", root / "media"):
                    status, _headers, response = self.request(
                        "POST", "/api/attachments",
                        headers={
                            "Origin": f"http://127.0.0.1:{self.server.server_port}",
                            "Content-Type": f"multipart/form-data; boundary={boundary}",
                            "Content-Length": str(len(body)),
                        },
                        body=body,
                    )
                self.assertEqual(status, 201)
                record = json.loads(response)
                self.assertEqual(record["mime_type"], "image/png")
                self.assertEqual(record["original_filename"], "rx.png")
                saved_file = root / record["stored_path"]
                self.assertEqual(saved_file.read_bytes(), png)
            finally:
                database.DATA_DIR, database.DB_PATH = old_data_dir, old_db_path

    def test_attendance_endpoint_is_atomic_and_rejects_replay(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original_data_dir, original_db_path = database.DATA_DIR, database.DB_PATH
            database.DATA_DIR = root / "data"
            database.DB_PATH = root / "data" / "test.sqlite3"
            try:
                database.init_db()
                patient = database.insert_record("patients", {"first_name": "Ana", "last_name": "Prueba"}, {"first_name", "last_name"})
                treatment = database.insert_record("patient_treatments", {"patient_id": patient["id"], "title": "Endodoncia"}, {"patient_id", "title"})
                appointment = database.insert_record("appointments", {
                    "patient_id": patient["id"], "patient_treatment_id": treatment["id"],
                    "starts_at": "2026-09-01 10:00", "notes": "Nota original",
                }, {"patient_id", "patient_treatment_id", "starts_at", "notes"})
                payload = json.dumps({
                    "patient_id": patient["id"], "patient_treatment_id": treatment["id"],
                    "session_date": "2026-09-01 10:15", "reason": "Control",
                })
                headers = {"Content-Type": "application/json", "Content-Length": str(len(payload.encode("utf-8")))}
                path = f"/api/appointments/{appointment['id']}/attend"
                status, _headers, response = self.request("POST", path, headers=headers, body=payload)
                self.assertEqual(status, 201)
                saved = json.loads(response)
                self.assertEqual(saved["appointment"]["status"], "attended")
                self.assertEqual(saved["appointment"]["notes"], "Nota original")
                status, _headers, _response = self.request("POST", path, headers=headers, body=payload)
                self.assertEqual(status, 400)
                self.assertEqual(len(database.fetch_all("SELECT * FROM clinical_sessions")), 1)
            finally:
                database.DATA_DIR, database.DB_PATH = original_data_dir, original_db_path

    def test_backup_option_includes_media_and_unique_names(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data_dir = root / "data"
            old_data_dir, old_db_path = database.DATA_DIR, database.DB_PATH
            database.DATA_DIR = data_dir
            database.DB_PATH = data_dir / "test.sqlite3"
            media_dir = root / "media"
            media_file = media_dir / "pacientes" / "000001" / "radiografias" / "rx.png"
            media_file.parent.mkdir(parents=True)
            media_file.write_bytes(b"sample image")
            backups_dir = root / "backups"
            try:
                database.init_db()
                with patch("backend.server.ROOT_DIR", root), patch("backend.server.DB_PATH", database.DB_PATH), patch("backend.server.MEDIA_DIR", media_dir), patch("backend.server.BACKUPS_DIR", backups_dir):
                    responses = []
                    for include_media in (False, True):
                        body = json.dumps({"include_media": include_media})
                        status, _headers, response = self.request(
                            "POST", "/api/backups",
                            headers={
                                "Origin": f"http://127.0.0.1:{self.server.server_port}",
                                "Content-Type": "application/json",
                                "Content-Length": str(len(body.encode("utf-8"))),
                            },
                            body=body,
                        )
                        self.assertEqual(status, 201)
                        responses.append(json.loads(response))

                    self.assertNotEqual(responses[0]["backup_path"], responses[1]["backup_path"])
                    for response, expected_media in zip(responses, (False, True)):
                        with zipfile.ZipFile(root / response["backup_path"]) as archive:
                            names = archive.namelist()
                            self.assertEqual("media/pacientes/000001/radiografias/rx.png" in names, expected_media)
                            metadata = json.loads(archive.read("respaldo-info.json"))
                            self.assertEqual(metadata["includes_media"], expected_media)
                    with patch("backend.server.ROOT_DIR", root), patch("backend.server.BACKUPS_DIR", backups_dir):
                        listed = DentalRequestHandler._list_backups(object.__new__(DentalRequestHandler))
                    self.assertEqual({item["includes_media"] for item in listed}, {False, True})
            finally:
                database.DATA_DIR = old_data_dir
                database.DB_PATH = old_db_path

    def test_uploads_reject_oversized_requests_before_parsing(self):
        status, _headers, body = self.request(
            "POST", "/api/attachments",
            headers={"Content-Type": "multipart/form-data; boundary=abc", "Content-Length": str(MAX_MULTIPART_BYTES + 1)},
        )
        self.assertEqual(status, 400)
        self.assertIn("25 MB", body.decode("utf-8"))

    def test_unexpected_errors_are_hidden_from_http_responses(self):
        with patch("backend.server.insert_record", side_effect=RuntimeError("private database detail")):
            status, _headers, body = self.request(
                "POST", "/api/patients",
                headers={"Origin": f"http://127.0.0.1:{self.server.server_port}", "Content-Type": "application/json", "Content-Length": str(len(json.dumps({"first_name": "Ana", "last_name": "Prueba"}).encode("utf-8")))},
                body=json.dumps({"first_name": "Ana", "last_name": "Prueba"}),
            )
        self.assertEqual(status, 500)
        self.assertIn("error interno", body.decode("utf-8"))
        self.assertNotIn("private database detail", body.decode("utf-8"))

    def test_database_integrity_errors_are_conflicts(self):
        with patch("backend.server.insert_record", side_effect=__import__("sqlite3").IntegrityError("FOREIGN KEY constraint failed")):
            payload = json.dumps({"first_name": "Ana", "last_name": "Prueba"})
            status, _headers, body = self.request(
                "POST", "/api/patients",
                headers={"Origin": f"http://127.0.0.1:{self.server.server_port}", "Content-Type": "application/json", "Content-Length": str(len(payload.encode("utf-8")))},
                body=payload,
            )
        self.assertEqual(status, 409)
        self.assertNotIn("FOREIGN KEY", body.decode("utf-8"))

    def test_cross_origin_writes_are_rejected(self):
        status, headers, body = self.request(
            "POST",
            "/api/patients",
            headers={"Origin": "https://evil.example", "Content-Type": "text/plain", "Content-Length": "2"},
            body="{}",
        )
        self.assertEqual(status, 403)
        self.assertIn("Origen no permitido", body.decode("utf-8"))
        self.assertFalse(any(key.lower() == "access-control-allow-origin" for key, _ in headers))


if __name__ == "__main__":
    unittest.main()
