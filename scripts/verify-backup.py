"""Verify a backup by restoring it to a temporary directory."""

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.backup import verify_backup  # noqa: E402

if len(sys.argv) != 2:
    raise SystemExit("Uso: python scripts/verify-backup.py RUTA_DEL_ZIP")

archive = Path(sys.argv[1]).resolve()
if not archive.is_file():
    raise SystemExit("No se encontro el respaldo indicado.")

with tempfile.TemporaryDirectory(prefix="consulta-dental-restore-check-") as directory:
    report = verify_backup(archive, Path(directory))
    print(f"Restauracion temporal correcta: {report['files']} archivos")
    print(f"Fecha: {report['metadata'].get('created_at', 'sin fecha')}")
    print("Base SQLite, relaciones y archivos verificados. Datos activos sin cambios.")
