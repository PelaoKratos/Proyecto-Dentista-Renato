"""Start an isolated authenticated app instance for Playwright."""

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend import database, server  # noqa: E402
from backend.auth import AuthManager  # noqa: E402

results = ROOT / "test-results"
results.mkdir(exist_ok=True)
runtime = Path(tempfile.mkdtemp(prefix="ui-runtime-", dir=results))
database.DATA_DIR = runtime / "data"
database.DB_PATH = database.DATA_DIR / "consulta_dental.sqlite3"
server.DB_PATH = database.DB_PATH
server.MEDIA_DIR = runtime / "media"
server.BACKUPS_DIR = runtime / "backups"
server.AUTH = AuthManager(database.DATA_DIR / "admin-auth.json")
token = server.AUTH.setup("pruebas-locales-no-produccion-2026")
storage = {
    "cookies": [{
        "name": "dental_session", "value": token, "domain": "127.0.0.1",
        "path": "/", "expires": -1, "httpOnly": True,
        "secure": False, "sameSite": "Strict",
    }],
    "origins": [],
}
(results / "auth-storage.json").write_text(json.dumps(storage), encoding="utf-8")
server.run(port=8765)
