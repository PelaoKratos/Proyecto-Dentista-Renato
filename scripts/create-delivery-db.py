"""Create a client database with the current base catalog and no clinical records."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

CLINICAL_TABLES = (
    "patients",
    "patient_treatments",
    "clinical_sessions",
    "attachments",
    "appointments",
    "payments",
)


def verify(database: Path) -> int:
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
        catalog_count = connection.execute("SELECT COUNT(*) FROM treatment_catalog WHERE is_active = 1").fetchone()[0]
        if catalog_count == 0:
            raise ValueError("La base de entrega no contiene tratamientos base activos.")
        print(f"Base de entrega verificada: 0 pacientes y registros clínicos; {catalog_count} tratamientos base activos.")
        return catalog_count


def build(source: Path, schema: Path, database: Path, catalog_json: Path) -> None:
    if database.exists():
        raise ValueError(f"La base de salida ya existe: {database}")
    catalog = []
    if source.is_file() and source.stat().st_size:
        try:
            with sqlite3.connect(f"{source.resolve().as_uri()}?mode=ro", uri=True) as connection:
                catalog = connection.execute(
                    "SELECT name, description, default_price, is_active FROM treatment_catalog "
                    "WHERE is_active = 1 ORDER BY id"
                ).fetchall()
        except sqlite3.DatabaseError:
            catalog = []
    if not catalog:
        seed = json.loads(catalog_json.read_text(encoding="utf-8"))
        catalog = [(item["name"], item.get("description"), item.get("default_price", 0), 1) for item in seed]
    if not catalog:
        raise ValueError("La base de origen no contiene tratamientos base activos.")
    database.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database) as connection:
        connection.executescript(schema.read_text(encoding="utf-8"))
        connection.executemany(
            "INSERT INTO treatment_catalog (name, description, default_price, is_active) VALUES (?, ?, ?, ?)",
            catalog,
        )
        connection.commit()
    verify(database)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("--source", type=Path, required=True)
    build_parser.add_argument("--catalog-json", type=Path, required=True)
    build_parser.add_argument("--schema", type=Path, required=True)
    build_parser.add_argument("--database", type=Path, required=True)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--database", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build":
        build(args.source, args.schema, args.database, args.catalog_json)
    else:
        verify(args.database)


if __name__ == "__main__":
    main()
