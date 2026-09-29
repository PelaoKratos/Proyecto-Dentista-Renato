import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from backend.auth import AuthManager
from backend.server import DentalRequestHandler


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.manager = AuthManager(Path(self.temp.name) / "admin-auth.json")
        self.patcher = patch("backend.server.AUTH", self.manager)
        self.patcher.start()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), DentalRequestHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.patcher.stop()
        self.temp.cleanup()

    def request(self, method, path, payload=None, cookie=None):
        headers = {}
        body = None
        if payload is not None:
            body = json.dumps(payload)
            headers["Content-Type"] = "application/json"
        if cookie:
            headers["Cookie"] = cookie
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        client.request(method, path, body=body, headers=headers)
        response = client.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        client.close()
        return result

    def test_first_use_login_expiry_and_logout_protect_all_clinical_content(self):
        self.assertEqual(self.request("GET", "/api/patients")[0], 401)
        self.assertEqual(self.request("GET", "/index.html")[0], 302)
        self.assertEqual(self.request("GET", "/media/pacientes/000001/rx.png")[0], 401)
        self.assertEqual(self.request("GET", "/backups/consulta-dental-backup-2026-09-29-1200.zip")[0], 401)
        self.assertEqual(self.request("GET", "/login.html")[0], 200)
        self.assertEqual(self.request("POST", "/api/patients", {"first_name": "X"})[0], 401)
        self.assertEqual(self.request("POST", "/api/auth/setup", {"password": "short"})[0], 400)
        status, headers, _ = self.request("POST", "/api/auth/setup", {"password": "clave-segura-12345"})
        self.assertEqual(status, 200)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.assertEqual(self.request("GET", "/index.html", cookie=cookie)[0], 200)
        self.assertEqual(self.request("POST", "/api/auth/setup", {"password": "otra-clave-larga"})[0], 400)
        self.assertEqual(self.request("POST", "/api/auth/login", {"password": "equivocada"})[0], 401)
        status, headers, _ = self.request("POST", "/api/auth/login", {"password": "clave-segura-12345"})
        self.assertEqual(status, 200)
        new_cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.assertEqual(self.request("POST", "/api/auth/logout", cookie=new_cookie)[0], 200)
        self.assertEqual(self.request("GET", "/index.html", cookie=new_cookie)[0], 302)
        self.manager._sessions[cookie.split("=", 1)[1]] = 0
        self.assertEqual(self.request("GET", "/index.html", cookie=cookie)[0], 302)
