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
SCRYPT_N = 1 << 14
SCRYPT_R = 8
SCRYPT_P = 5


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
            verifier = self._derive_password(password, salt, SCRYPT_P)
            payload = {"version": 2, "salt": salt.hex(), "verifier": verifier.hex()}
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
                version = saved.get("version", 1)
                if version not in {1, 2}:
                    raise ValueError("Formato de clave no compatible.")
                actual = self._derive_password(password, salt, 1 if version == 1 else SCRYPT_P)
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
            if version == 1:
                try:
                    self._upgrade_credentials(password)
                except OSError:
                    # A read-only data directory must not lock out the correct password.
                    pass
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

    @staticmethod
    def _derive_password(password: str, salt: bytes, parallelism: int) -> bytes:
        return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=parallelism)

    def _upgrade_credentials(self, password: str) -> None:
        salt = secrets.token_bytes(16)
        verifier = self._derive_password(password, salt, SCRYPT_P)
        payload = {"version": 2, "salt": salt.hex(), "verifier": verifier.hex()}
        temporary = self.credentials_path.with_name(f".{self.credentials_path.name}.{secrets.token_hex(8)}.tmp")
        try:
            with temporary.open("x", encoding="utf-8") as handle:
                json.dump(payload, handle)
            try:
                os.chmod(temporary, 0o600)
            except OSError:
                pass
            os.replace(temporary, self.credentials_path)
        finally:
            temporary.unlink(missing_ok=True)

    def _new_session(self) -> str:
        token = secrets.token_urlsafe(32)
        self._sessions[token] = time.time() + SESSION_SECONDS
        return token

    @staticmethod
    def _validate_password(password: str) -> None:
        if not isinstance(password, str) or not 12 <= len(password) <= 256:
            raise ValueError("La clave debe tener entre 12 y 256 caracteres.")
