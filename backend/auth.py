"""Single-user local authentication with an administrator-defined password."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

SESSION_SECONDS = 30 * 60
LOCK_SECONDS = 60
MAX_FAILED_LOGINS = 5


class AuthManager:
    def __init__(self, credentials_path: Path):
        self.credentials_path = credentials_path
        self._sessions: dict[str, float] = {}
        self._failed_logins = 0
        self._locked_until = 0.0
        self._lock = threading.RLock()

    def configured(self) -> bool:
        return self.credentials_path.is_file()

    def setup(self, password: str) -> str:
        self._validate_password(password)
        with self._lock:
            self.credentials_path.parent.mkdir(parents=True, exist_ok=True)
            salt = secrets.token_bytes(16)
            verifier = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
            payload = {"version": 1, "salt": salt.hex(), "verifier": verifier.hex()}
            try:
                with self.credentials_path.open("x", encoding="utf-8") as handle:
                    json.dump(payload, handle)
            except FileExistsError as exc:
                raise ValueError("La clave de administrador ya fue configurada.") from exc
            try:
                os.chmod(self.credentials_path, 0o600)
            except OSError:
                pass
            return self._new_session()

    def login(self, password: str) -> str | None:
        with self._lock:
            if not self.configured():
                raise ValueError("Primero configura la clave de administrador.")
            now = time.time()
            if now < self._locked_until:
                raise ValueError("Demasiados intentos. Espera un minuto antes de volver a ingresar.")
            try:
                saved = json.loads(self.credentials_path.read_text(encoding="utf-8"))
                salt = bytes.fromhex(saved["salt"])
                expected = bytes.fromhex(saved["verifier"])
                actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
                valid = hmac.compare_digest(actual, expected)
            except (OSError, ValueError, KeyError, TypeError) as exc:
                raise RuntimeError("No se pudo verificar la clave de administrador.") from exc
            if not valid:
                self._failed_logins += 1
                if self._failed_logins >= MAX_FAILED_LOGINS:
                    self._locked_until = now + LOCK_SECONDS
                    self._failed_logins = 0
                return None
            self._failed_logins = 0
            self._locked_until = 0.0
            return self._new_session()

    def authenticated(self, token: str | None) -> bool:
        if not token:
            return False
        with self._lock:
            expires_at = self._sessions.get(token)
            if expires_at is None:
                return False
            if expires_at <= time.time():
                self._sessions.pop(token, None)
                return False
            return True

    def logout(self, token: str | None) -> None:
        if token:
            with self._lock:
                self._sessions.pop(token, None)

    def _new_session(self) -> str:
        token = secrets.token_urlsafe(32)
        self._sessions[token] = time.time() + SESSION_SECONDS
        return token

    @staticmethod
    def _validate_password(password: str) -> None:
        if not isinstance(password, str) or not 12 <= len(password) <= 256:
            raise ValueError("La clave debe tener entre 12 y 256 caracteres.")
