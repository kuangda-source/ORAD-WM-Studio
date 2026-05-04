from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from .config import DB_PATH, ensure_runtime_dirs
from .schemas import JobRecord, RunRecord, Vehicle


DEFAULT_VEHICLE = Vehicle(
    id="ugv_default",
    name="Offroad UGV",
    wheelbase=2.8,
    width=1.6,
    length=4.2,
    max_steer=35,
    max_speed=12,
    mass=1200,
    tire_type="all-terrain",
)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    ensure_runtime_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sequence_id TEXT NOT NULL,
                frame_id TEXT,
                terrain TEXT NOT NULL,
                weather TEXT NOT NULL,
                task TEXT NOT NULL,
                labels_json TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vehicles (
                id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                sequence_id TEXT,
                source TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                label TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                status TEXT NOT NULL,
                sequence_id TEXT,
                source TEXT,
                run_id TEXT,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_source ON runs(source)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_kind ON runs(kind)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_kind ON jobs(kind)")
        existing = conn.execute("SELECT id FROM vehicles WHERE id = ?", (DEFAULT_VEHICLE.id,)).fetchone()
        if existing is None:
            put_vehicle(DEFAULT_VEHICLE, conn=conn)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def put_vehicle(vehicle: Vehicle, conn: sqlite3.Connection | None = None) -> Vehicle:
    payload = vehicle.model_dump_json()
    owns_conn = conn is None
    if owns_conn:
        ctx = connect()
        conn = ctx.__enter__()
    try:
        conn.execute(
            """
            INSERT INTO vehicles (id, payload_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
            """,
            (vehicle.id, payload, utc_now()),
        )
    finally:
        if owns_conn:
            ctx.__exit__(None, None, None)
    return vehicle


def list_vehicles() -> list[Vehicle]:
    init_db()
    with connect() as conn:
        rows = conn.execute("SELECT payload_json FROM vehicles ORDER BY id").fetchall()
    return [Vehicle(**json.loads(row["payload_json"])) for row in rows]


def put_run(record: RunRecord, conn: sqlite3.Connection | None = None) -> RunRecord:
    payload = record.model_dump_json()
    owns_conn = conn is None
    if owns_conn:
        ctx = connect()
        conn = ctx.__enter__()
    try:
        conn.execute(
            """
            INSERT INTO runs (run_id, kind, name, status, sequence_id, source, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                kind = excluded.kind,
                name = excluded.name,
                status = excluded.status,
                sequence_id = excluded.sequence_id,
                source = excluded.source,
                payload_json = excluded.payload_json,
                created_at = excluded.created_at
            """,
            (
                record.run_id,
                record.kind,
                record.name,
                record.status,
                record.sequence_id,
                record.source,
                payload,
                record.created_at,
            ),
        )
    finally:
        if owns_conn:
            ctx.__exit__(None, None, None)
    return record


def list_runs(source: str | None = None, kind: str | None = None, limit: int = 50) -> list[RunRecord]:
    init_db()
    clauses: list[str] = []
    params: list[str | int] = []
    if source:
        clauses.append("source = ?")
        params.append(source)
    if kind:
        clauses.append("kind = ?")
        params.append(kind)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    with connect() as conn:
        rows = conn.execute(
            f"SELECT payload_json FROM runs {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
    return [RunRecord(**json.loads(row["payload_json"])) for row in rows]


def get_run(run_id: str) -> RunRecord | None:
    init_db()
    with connect() as conn:
        row = conn.execute("SELECT payload_json FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if row is None:
        return None
    return RunRecord(**json.loads(row["payload_json"]))


def put_job(record: JobRecord, conn: sqlite3.Connection | None = None) -> JobRecord:
    payload = record.model_dump_json()
    owns_conn = conn is None
    if owns_conn:
        ctx = connect()
        conn = ctx.__enter__()
    try:
        conn.execute(
            """
            INSERT INTO jobs (job_id, kind, label, endpoint, method, status, sequence_id, source, run_id, payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                kind = excluded.kind,
                label = excluded.label,
                endpoint = excluded.endpoint,
                method = excluded.method,
                status = excluded.status,
                sequence_id = excluded.sequence_id,
                source = excluded.source,
                run_id = excluded.run_id,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            """,
            (
                record.job_id,
                record.kind,
                record.label,
                record.endpoint,
                record.method,
                record.status,
                record.sequence_id,
                record.source,
                record.run_id,
                payload,
                record.created_at,
                record.updated_at,
            ),
        )
    finally:
        if owns_conn:
            ctx.__exit__(None, None, None)
    return record


def list_jobs(status: str | None = None, kind: str | None = None, limit: int = 50) -> list[JobRecord]:
    init_db()
    clauses: list[str] = []
    params: list[str | int] = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if kind:
        clauses.append("kind = ?")
        params.append(kind)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    with connect() as conn:
        rows = conn.execute(
            f"SELECT payload_json FROM jobs {where} ORDER BY updated_at DESC LIMIT ?",
            params,
        ).fetchall()
    return [JobRecord(**json.loads(row["payload_json"])) for row in rows]


def get_job(job_id: str) -> JobRecord | None:
    init_db()
    with connect() as conn:
        row = conn.execute("SELECT payload_json FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    return JobRecord(**json.loads(row["payload_json"]))
