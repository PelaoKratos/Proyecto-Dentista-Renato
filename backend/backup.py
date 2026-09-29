"""Create and verify complete local snapshots without changing the active database."""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import tempfile
import threading
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath

_BACKUP_LOCK = threading.Lock()


def _digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def verify_backup(archive_path: Path, destination: Path) -> dict:
    """Restore all archived files into destination, then check hashes and SQLite."""
    destination = destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("El ZIP contiene un archivo dañado.")
        names = archive.namelist()
        if len(names) != len(set(names)) or "data/consulta_dental.sqlite3" not in names:
            raise ValueError("El respaldo no contiene una base de datos única.")
        for member in archive.infolist():
            relative = PurePosixPath(member.filename)
            if member.is_dir() or relative.is_absolute() or ".." in relative.parts:
                raise ValueError("El respaldo contiene una ruta inválida.")
            if member.filename != "respaldo-info.json" and not (
                member.filename == "data/consulta_dental.sqlite3"
                or (len(relative.parts) >= 3 and relative.parts[0] == "media")
            ):
                raise ValueError("El respaldo contiene archivos inesperados.")
            if (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("El respaldo contiene un enlace no permitido.")
            target = (destination / member.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError("El respaldo contiene una ruta fuera del destino.")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as output:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(block)
        if "respaldo-info.json" in names:
            metadata = json.loads((destination / "respaldo-info.json").read_text(encoding="utf-8"))
        else:
            metadata = {
                "created_at": datetime.fromtimestamp(archive_path.stat().st_mtime).isoformat(timespec="seconds"),
                "includes_media": any(name.startswith("media/") for name in names),
                "mode": "legacy",
            }
    for name, expected in metadata.get("sha256", {}).items():
        if name not in names or _digest(destination / name) != expected:
            raise ValueError("El respaldo no coincide con su suma de verificación.")
    connection = sqlite3.connect(destination / "data" / "consulta_dental.sqlite3")
    try:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("La base restaurada no pasó la comprobación de integridad.")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ValueError("La base restaurada contiene relaciones inválidas.")
    finally:
        connection.close()
    return {
        "metadata": metadata,
        "files": len([name for name in names if name != "respaldo-info.json"]),
        "restored_to": str(destination),
    }


def create_backup(db_path: Path, media_dir: Path, backups_dir: Path, *,
                  include_media: bool = True, mode: str = "manual", now: datetime | None = None) -> Path:
    now = now or datetime.now()
    if mode not in {"manual", "automatic"}:
        raise ValueError("Tipo de respaldo inválido.")
    backups_dir.mkdir(parents=True, exist_ok=True)
    name = f"consulta-dental-backup-{now:%Y-%m-%d-%H%M}-{secrets.token_hex(3)}.zip"
    final = backups_dir / name
    temporary = final.with_suffix(".zip.tmp")
    try:
        with tempfile.TemporaryDirectory(prefix="consulta-dental-backup-") as scratch:
            root = Path(scratch)
            snapshot_path = root / "consulta_dental.sqlite3"
            source = sqlite3.connect(db_path)
            snapshot = sqlite3.connect(snapshot_path)
            try:
                source.backup(snapshot)
            finally:
                snapshot.close()
                source.close()
            files = {"data/consulta_dental.sqlite3": snapshot_path}
            if include_media and media_dir.exists():
                for path in media_dir.rglob("*"):
                    if path.is_file() and path.resolve().is_relative_to(media_dir.resolve()):
                        files["media/" + path.relative_to(media_dir).as_posix()] = path
            metadata = {
                "created_at": now.isoformat(timespec="seconds"),
                "includes_media": include_media,
                "mode": mode,
                "sha256": {name: _digest(path) for name, path in files.items()},
            }
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for archived_name, path in files.items():
                    archive.write(path, archived_name)
                archive.writestr("respaldo-info.json", json.dumps(metadata, ensure_ascii=False))
            with tempfile.TemporaryDirectory(prefix="consulta-dental-restore-check-") as restored:
                verify_backup(temporary, Path(restored))
        temporary.replace(final)
        return final
    finally:
        temporary.unlink(missing_ok=True)


def create_daily_backup_if_due(db_path: Path, media_dir: Path, backups_dir: Path,
                               now: datetime | None = None) -> Path | None:
    """Create one complete automatic backup per local calendar day while the app runs."""
    now = now or datetime.now()
    with _BACKUP_LOCK:
        if backups_dir.exists():
            for path in backups_dir.glob("consulta-dental-backup-*.zip"):
                try:
                    with zipfile.ZipFile(path) as archive:
                        metadata = json.loads(archive.read("respaldo-info.json"))
                    if metadata.get("mode") == "automatic" and metadata.get("created_at", "")[:10] == now.date().isoformat():
                        return None
                except (OSError, zipfile.BadZipFile, KeyError, ValueError, json.JSONDecodeError):
                    continue
        return create_backup(db_path, media_dir, backups_dir, include_media=True, mode="automatic", now=now)
