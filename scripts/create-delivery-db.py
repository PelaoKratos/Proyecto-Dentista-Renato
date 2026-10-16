"""Create and verify a client database without patients or base procedures."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

CLINICAL_TABLES = (
    "patients",
    "patient_treatment_plans",
    "patient_treatments",
    "clinical_sessions",
    "attachments",
    "appointments",
    "payments",
)


def verify(database: Path, allow_catalog: bool = False) -> None:
    if not database.is_file():
        raise ValueError(f"No existe la base de entrega: {database}")
    with sqlite3.connect(f"{database.resolve().as_uri()}?mode=ro", uri=True) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        required = {"treatment_catalog", *CLINICAL_TABLES}
        if not required.issubset(tables):
            raise ValueError("La base de entrega no tiene todas las tablas requeridas.")
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("La base de entrega no supera la verificación de integridad.")
        if connection.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("La base de entrega contiene referencias inválidas.")
        counts = {table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in CLINICAL_TABLES}
        if any(counts.values()):
            raise ValueError(f"La base de entrega contiene registros clínicos: {counts}")
        catalog_count = connection.execute("SELECT COUNT(*) FROM treatment_catalog").fetchone()[0]
        if catalog_count and not allow_catalog:
            raise ValueError(f"La base de entrega contiene {catalog_count} procedimientos base.")
        print(f"Base de entrega verificada: 0 registros clínicos; {catalog_count} procedimientos base.")


def build(schema: Path, database: Path) -> None:
    if database.exists():
        raise ValueError(f"La base de salida ya existe: {database}")
    database.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database) as connection:
        connection.executescript(schema.read_text(encoding="utf-8"))
        connection.commit()
    verify(database)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("--schema", type=Path, required=True)
    build_parser.add_argument("--database", type=Path, required=True)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--database", type=Path, required=True)
    verify_parser.add_argument("--allow-catalog", action="store_true", help="Solo para revisar una entrega anterior antes de reemplazarla")
    args = parser.parse_args()
    if args.command == "build":
        build(args.schema, args.database)
    else:
        verify(args.database, args.allow_catalog)


if __name__ == "__main__":
    main()
