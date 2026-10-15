"""
loadtest/run_loadtest.py
────────────────────────────────────────────────────────────────────────────
Single-entry-point orchestrator for the Distributed OMS load test.

Usage:
    python loadtest/run_loadtest.py --label 1M

Phases:
    0 — Pre-checks (containers healthy, row counts, pg_stat_statements)
    1 — Smoke test (1 user, 30 s, every endpoint must return expected status)
    2 — Scenario B (signup race, 50 users) and Scenario C (last-unit race, 50 users)
    3 — Ramp Scenario D (10, 50, 100, 500 users × 2 min each)
    4 — Generate REPORT.md from measured CSV/JSON files

Script stops if any pre-check or smoke test fails.
"""

import sys
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import argparse
import csv
import json
import os
import platform
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

import psutil
import psycopg2
import psycopg2.extras

# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--label", default="1M", help="Results sub-folder label (e.g. 1M, 50M)")
args = parser.parse_args()

LABEL = args.label
RESULTS_DIR = Path(f"loadtest/results/{LABEL}")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# DB CONNECTIONS
# ─────────────────────────────────────────────────────────────────────────────
BASE_IP = os.getenv("BASE_IP", "localhost")

DB_CONFIGS = {
    "orders_db":   {"host": BASE_IP, "port": 5435, "dbname": "orders_db",   "user": "postgres", "password": "postgres"},
    "users_db":    {"host": BASE_IP, "port": 5433, "dbname": "users_db",    "user": "postgres", "password": "postgres"},
    "products_db": {"host": BASE_IP, "port": 5434, "dbname": "products_db", "user": "postgres", "password": "postgres"},
    "inventory_db":{"host": BASE_IP, "port": 5436, "dbname": "inventory_db","user": "postgres", "password": "postgres"},
}

def get_conn(db_name: str):
    return psycopg2.connect(**DB_CONFIGS[db_name], cursor_factory=psycopg2.extras.RealDictCursor)

def run_query(db_name: str, sql: str, params=None) -> list[dict]:
    conn = get_conn(db_name)
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def banner(msg: str):
    print(f"\n{'='*72}\n  {msg}\n{'='*72}")

def check_stop(ok: bool, msg: str):
    if not ok:
        print(f"\n⛔ STOP: {msg}")
        sys.exit(1)

def run_cmd(cmd: list[str], log_file: Path, env: dict = None) -> int:
    """Run command, tee output to log_file, return exit code."""
    log_file.parent.mkdir(parents=True, exist_ok=True)
    merged_env = {**os.environ, **(env or {})}
    with open(log_file, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            cmd, stdout=lf, stderr=subprocess.STDOUT,
            env=merged_env, text=True,
        )
        return proc.wait()


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 0 — PRE-CHECKS
# ─────────────────────────────────────────────────────────────────────────────
def phase0_prechecks():
    banner("PHASE 0 — Pre-checks")

    # 0a — Docker containers
    print("\n[0a] Docker Compose container status:")
    result = subprocess.run(
        ["docker", "compose", "ps", "--format", "table {{.Service}}\t{{.State}}\t{{.Status}}"],
        capture_output=True, text=True,
        cwd=str(Path(__file__).parents[1]),
    )
    print(result.stdout)
    check_stop(result.returncode == 0, f"docker compose ps failed: {result.stderr}")

    # Check all expected services are 'running'
    expected = [
        "user-service", "admin-analytics", "inventory-service",
        "order-service", "recommendation-service", "product-service",
        "users_db", "products_db", "orders_db", "inventory_db",
        "elasticsearch", "neo4j", "frontend",
    ]
    for svc in expected:
        check_stop(svc in result.stdout, f"Service '{svc}' not found in docker compose ps output.")
    print("✅ All expected containers found in compose output.")

    # 0b — Row counts and status split
    print("\n[0b] Row counts:")
    try:
        orders_count = run_query("orders_db", "SELECT count(*) AS cnt FROM orders;")[0]["cnt"]
        users_count  = run_query("users_db",  "SELECT count(*) AS cnt FROM users;")[0]["cnt"]
        status_rows  = run_query("orders_db", "SELECT status, count(*) AS cnt FROM orders GROUP BY status ORDER BY status;")
    except Exception as e:
        check_stop(False, f"DB query failed: {e}")

    print(f"  orders_db → orders: {orders_count:,}")
    print(f"  users_db  → users:  {users_count:,}")
    print("  Status split:")
    for row in status_rows:
        print(f"    {row['status']:12} → {row['cnt']:>10,}")

    check_stop(orders_count >= 900_000, f"Expected ~1,000,000 orders but found {orders_count:,}")
    print("✅ Row counts OK.")

    # 0c — pg_stat_statements active?
    print("\n[0c] pg_stat_statements check:")
    for db in ("orders_db", "users_db", "products_db"):
        rows = run_query(db, "SHOW shared_preload_libraries;")
        val = list(rows[0].values())[0] if rows else ""
        if "pg_stat_statements" not in str(val):
            check_stop(False, f"pg_stat_statements NOT in shared_preload_libraries for {db}. "
                              "Run: docker compose up -d <db_service> after adding command flag.")
        # Ensure extension exists and reset
        try:
            conn = get_conn(db)
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;")
                cur.execute("SELECT pg_stat_statements_reset();")
            conn.close()
            print(f"  {db}: pg_stat_statements active ✅ (stats reset)")
        except Exception as e:
            check_stop(False, f"pg_stat_statements setup failed on {db}: {e}")

    # Verify the query works with total_exec_time (PG13+)
    try:
        test = run_query("orders_db",
            "SELECT query, calls, total_exec_time, mean_exec_time, rows "
            "FROM pg_stat_statements LIMIT 1;")
        print(f"  Column check (total_exec_time/mean_exec_time): ✅")
    except Exception as e:
        check_stop(False, f"pg_stat_statements column check failed: {e}")

    # 0d — Machine specs
    print("\n[0d] Writing machine_specs.md ...")
    _write_machine_specs(orders_count, users_count, status_rows)
    print(f"✅ Machine specs written to {RESULTS_DIR / 'machine_specs.md'}")

    return orders_count, users_count, status_rows


def _write_machine_specs(orders_count, users_count, status_rows):
    cpu_info  = platform.processor() or platform.machine()
    cpu_count = psutil.cpu_count(logical=False)
    cpu_logic = psutil.cpu_count(logical=True)
    mem       = psutil.virtual_memory()
    disk      = psutil.disk_usage(".")
    docker_v  = subprocess.run(["docker", "version", "--format", "{{.Server.Version}}"],
                               capture_output=True, text=True).stdout.strip()
    locust_v  = subprocess.run([sys.executable, "-m", "locust", "--version"],
                               capture_output=True, text=True).stdout.strip()
    python_v  = platform.python_version()

    lines = [
        f"# Machine & Dataset Specs — Label: {LABEL}",
        f"_Generated: {datetime.now().isoformat()}_",
        "",
        "## System",
        f"- **OS**: {platform.platform()}",
        f"- **CPU**: {cpu_info}",
        f"- **Physical cores**: {cpu_count}",
        f"- **Logical CPUs**: {cpu_logic}",
        f"- **RAM total**: {mem.total / 1024**3:.1f} GB",
        f"- **RAM available**: {mem.available / 1024**3:.1f} GB",
        f"- **Free disk**: {disk.free / 1024**3:.1f} GB",
        "",
        "## Versions",
        f"- **Python**: {python_v}",
        f"- **Docker**: {docker_v}",
        f"- **Locust**: {locust_v}",
        "",
        "## Dataset (read from DB at pre-check time)",
        f"- **orders_db → orders**: {orders_count:,}",
        f"- **users_db  → users**:  {users_count:,}",
        "",
        "### Order status split",
        "| Status | Count |",
        "|--------|-------|",
    ]
    for row in status_rows:
        lines.append(f"| {row['status']} | {row['cnt']:,} |")

    (RESULTS_DIR / "machine_specs.md").write_text("\n".join(lines), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — SMOKE TEST
# ─────────────────────────────────────────────────────────────────────────────
def phase1_smoke():
    banner("PHASE 1 — Smoke Test (1 user, 30 s, SmokeUser)")
    smoke_dir = RESULTS_DIR / "smoke"
    smoke_dir.mkdir(exist_ok=True)
    log = smoke_dir / "smoke.log"

    cmd = [
        sys.executable, "-m", "locust",
        "-f", "locustfile.py",
        "--headless",
        "-u", "1", "-r", "1", "-t", "30s",
        "SmokeUser",
        "--csv", str(smoke_dir / "smoke"),
        "--loglevel", "WARNING",
    ]
    print(f"  Running: {' '.join(cmd)}")
    print(f"  Log: {log}")
    rc = run_cmd(cmd, log)

    stats_file = smoke_dir / "smoke_stats.csv"
    if not stats_file.exists():
        check_stop(False, f"Smoke test produced no stats CSV. See {log}")

    # Parse stats CSV
    print("\n  Smoke test results:")
    failures_found = []
    total_reqs = 0
    with open(stats_file, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Name", "")
            if name == "Aggregated":
                total_reqs = int(row.get("Request Count", 0) or 0)
                continue
            n_req = row.get("Request Count", "0")
            n_fail = row.get("Failure Count", "0")
            p50  = row.get("50%", "?")
            p95  = row.get("95%", "?")
            print(f"    {name:55s}  reqs={n_req:>6}  fails={n_fail:>4}  p50={p50:>6}ms  p95={p95:>6}ms")
            if n_fail != "0" and int(n_fail) > 0:
                failures_found.append(name)

    check_stop(total_reqs > 0, "Smoke test produced 0 requests.")

    if failures_found:
        print(f"\n⚠️  Endpoints with failures: {failures_found}")
        check_stop(False, "Smoke test failures detected. Fix services before proceeding.")
    else:
        print("\n✅ Smoke test passed — no failures on any endpoint.")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — SCENARIOS B AND C
# ─────────────────────────────────────────────────────────────────────────────
def phase2_scenarios():
    banner("PHASE 2 — Scenario B (signup race) & C (last-unit race)")

    # ── Scenario B ────────────────────────────────────────────────────────────
    print("\n[B] Signup race — 50 users, same username, 30 s")
    b_dir = RESULTS_DIR / "scenario_B"
    b_dir.mkdir(exist_ok=True)
    b_log = b_dir / "B.log"

    cmd_b = [
        sys.executable, "-m", "locust",
        "-f", "locustfile.py",
        "--headless",
        "-u", "50", "-r", "50", "-t", "30s",
        "SignupRaceUser",
        "--csv", str(b_dir / "B"),
        "--loglevel", "WARNING",
        "--stop-timeout", "10",
    ]
    env_b = {"LOCUST_OUTCOME_DIR": str(RESULTS_DIR)}
    print(f"  Running: {' '.join(cmd_b)}")
    rc_b = run_cmd(cmd_b, b_log, env=env_b)

    # Read counters written by quitting listener
    counter_file = RESULTS_DIR / "scenario_B_counters.json"
    b_result = {"success": 0, "duplicate": 0, "other": 0}
    if counter_file.exists():
        b_result = json.loads(counter_file.read_text())

    # Verify: check users_db row count for the race username
    b_username_file = RESULTS_DIR / "scenario_B_username.txt"
    db_rows_count = 0
    race_user = ""
    if b_username_file.exists():
        race_user = b_username_file.read_text().strip()
        rows = run_query("users_db", "SELECT count(*) AS cnt FROM users WHERE username = %s;", [race_user])
        db_rows_count = rows[0]["cnt"] if rows else 0
        print(f"  users_db rows for username '{race_user}': {db_rows_count}")

    b_pass = (b_result["success"] == 1 and db_rows_count == 1 and b_result["other"] == 0)
    b_outcome = {
        "pass": b_pass,
        "username": race_user,
        "users_db_row_count": db_rows_count,
        "success_count": b_result["success"],
        "duplicate_count": b_result["duplicate"],
        "other_count": b_result["other"],
        "expected_success": 1,
        "expected_users_db_rows": 1,
        "expected_duplicate": 49,
        "note": "Exactly 1 success and 1 row in users_db verifies unique constraint and atomic registration.",
    }
    (RESULTS_DIR / "scenario_B_result.json").write_text(json.dumps(b_outcome, indent=2))

    status_b = "✅ PASS" if b_pass else "❌ FAIL"
    print(f"  {status_b}  success={b_result['success']}  duplicate={b_result['duplicate']}  other={b_result['other']}  db_rows={db_rows_count}")

    # ── Scenario C ────────────────────────────────────────────────────────────

    print("\n[C] Last-unit race — 50 users, product stock=1, 30 s")
    c_dir = RESULTS_DIR / "scenario_C"
    c_dir.mkdir(exist_ok=True)

    # Pick a product from products_db and set its inventory to 1
    products = run_query("products_db", "SELECT id FROM products ORDER BY id LIMIT 1;")
    check_stop(len(products) > 0, "No products found in products_db for scenario C.")
    target_pid = products[0]["id"]

    # Read original stock
    inv_rows = run_query("inventory_db",
        "SELECT stock_quantity FROM inventory WHERE product_id = %s;", [target_pid])
    original_stock = inv_rows[0]["stock_quantity"] if inv_rows else None
    print(f"  Target product_id={target_pid}, original stock={original_stock}")

    # Set stock to 1
    conn_inv = get_conn("inventory_db")
    conn_inv.autocommit = True
    with conn_inv.cursor() as cur:
        cur.execute("UPDATE inventory SET stock_quantity = 1 WHERE product_id = %s;", [target_pid])
    conn_inv.close()
    print(f"  Stock set to 1 for product_id={target_pid}")

    # Write product id to file for locust workers
    (RESULTS_DIR / "scenario_C_product_id.txt").write_text(str(target_pid))

    c_log = c_dir / "C.log"
    cmd_c = [
        sys.executable, "-m", "locust",
        "-f", "locustfile.py",
        "--headless",
        "-u", "50", "-r", "50", "-t", "60s",
        "LastUnitUser",
        "--csv", str(c_dir / "C"),
        "--loglevel", "WARNING",
        "--stop-timeout", "15",
    ]
    print(f"  Running: {' '.join(cmd_c)}")
    rc_c = run_cmd(cmd_c, c_log, env={"LOCUST_OUTCOME_DIR": str(RESULTS_DIR)})

    # Check final stock
    inv_after = run_query("inventory_db",
        "SELECT stock_quantity FROM inventory WHERE product_id = %s;", [target_pid])
    final_stock = inv_after[0]["stock_quantity"] if inv_after else "NOT FOUND"
    print(f"  Final stock for product_id={target_pid}: {final_stock}")

    c_counter_file = RESULTS_DIR / "scenario_C_counters.json"
    c_result = {"success": 0, "failure": 0, "other": 0}
    if c_counter_file.exists():
        c_result = json.loads(c_counter_file.read_text())

    c_pass = c_result["success"] == 1 and final_stock == 0 and c_result["other"] == 0
    c_outcome = {
        "pass": c_pass,
        "success_count": c_result["success"],
        "failure_count": c_result["failure"],
        "other_count": c_result["other"],
        "target_product_id": target_pid,
        "original_stock": original_stock,
        "final_stock": final_stock,
        "expected_success": 1,
        "expected_failure": 49,
        "expected_final_stock": 0,
        "note": "Inventory SELECT FOR UPDATE ensures exactly 1 reservation succeeds.",
    }
    (RESULTS_DIR / "scenario_C_result.json").write_text(json.dumps(c_outcome, indent=2))

    status_c = "✅ PASS" if c_pass else "❌ FAIL"
    print(f"  {status_c}  success={c_result['success']}  failure={c_result['failure']}  other={c_result['other']}  final_stock={final_stock}")

    # Restore original stock
    if original_stock is not None:
        conn_inv2 = get_conn("inventory_db")
        conn_inv2.autocommit = True
        with conn_inv2.cursor() as cur:
            cur.execute("UPDATE inventory SET stock_quantity = %s WHERE product_id = %s;",
                        [original_stock, target_pid])
        conn_inv2.close()
        print(f"  Stock restored to {original_stock} for product_id={target_pid}")

    return b_outcome, c_outcome


# ─────────────────────────────────────────────────────────────────────────────
# DOCKER STATS SAMPLER (runs in background thread during each stage)
# ─────────────────────────────────────────────────────────────────────────────
class DockerStatsSampler:
    def __init__(self, stage_dir: Path, stage_label: str, locust_pid: int = 0):
        self.stage_dir   = stage_dir
        self.stage_label = stage_label
        self.locust_pid  = locust_pid
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

        self.docker_csv  = stage_dir / f"{stage_label}_docker_stats.csv"
        self.locust_csv  = stage_dir / f"{stage_label}_locust_cpu.csv"
        self.saturated   = False  # True if Locust CPU ever > 80%

        with open(self.docker_csv, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["timestamp", "container", "cpu_pct", "mem_pct"])
        with open(self.locust_csv, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["timestamp", "locust_cpu_pct"])

    def start(self): self._thread.start()

    def stop(self): self._stop.set(); self._thread.join(timeout=15)

    def _run(self):
        while not self._stop.is_set():
            ts = datetime.now().isoformat()
            try:
                res = subprocess.run(
                    ["docker", "stats", "--no-stream",
                     "--format", "{{.Name}},{{.CPUPerc}},{{.MemPerc}}"],
                    capture_output=True, text=True, timeout=10,
                )
                with open(self.docker_csv, "a", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    for line in res.stdout.strip().splitlines():
                        parts = line.split(",")
                        if len(parts) >= 3:
                            w.writerow([ts, parts[0], parts[1], parts[2]])
            except Exception:
                pass

            # Locust process CPU
            try:
                if self.locust_pid:
                    proc = psutil.Process(self.locust_pid)
                    cpu = proc.cpu_percent(interval=None)
                else:
                    # Find locust process by name
                    cpu = 0.0
                    for p in psutil.process_iter(["name", "cmdline", "cpu_percent"]):
                        try:
                            if "locust" in " ".join(p.info.get("cmdline") or []).lower():
                                cpu = p.cpu_percent(interval=None)
                                break
                        except Exception:
                            pass
                if cpu > 80.0:
                    self.saturated = True
                with open(self.locust_csv, "a", newline="", encoding="utf-8") as f:
                    csv.writer(f).writerow([ts, f"{cpu:.1f}"])
            except Exception:
                pass

            self._stop.wait(5)


# ─────────────────────────────────────────────────────────────────────────────
# SLOW QUERY EXTRACTOR
# ─────────────────────────────────────────────────────────────────────────────
def extract_slow_queries(stage_dir: Path, stage_label: str):
    all_combined_rows = []
    for db in ("orders_db", "users_db", "products_db"):
        try:
            rows = run_query(db, """
                SELECT
                    LEFT(query, 200)        AS query,
                    calls,
                    ROUND(total_exec_time::numeric, 2)  AS total_exec_ms,
                    ROUND(mean_exec_time::numeric, 2)   AS mean_exec_ms,
                    rows
                FROM pg_stat_statements
                ORDER BY total_exec_time DESC
                LIMIT 10;
            """)
            out_file = stage_dir / f"{stage_label}_{db}_slow_queries.csv"
            with open(out_file, "w", newline="", encoding="utf-8") as f:
                if rows:
                    w = csv.DictWriter(f, fieldnames=rows[0].keys())
                    w.writeheader()
                    w.writerows(rows)
            print(f"  Slow queries ({db}): written to {out_file}")

            for r in rows:
                r_copy = dict(r)
                r_copy["database"] = db
                all_combined_rows.append(r_copy)

            # Reset for next stage
            conn = get_conn(db)
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("SELECT pg_stat_statements_reset();")
            conn.close()
        except Exception as e:
            print(f"  [WARN] Could not extract slow queries for {db}: {e}")

    # Write combined stage_<N>_slow_queries.csv
    combined_file = stage_dir / f"{stage_label}_slow_queries.csv"
    with open(combined_file, "w", newline="", encoding="utf-8") as f:
        if all_combined_rows:
            fnames = ["database", "query", "calls", "total_exec_ms", "mean_exec_ms", "rows"]
            w = csv.DictWriter(f, fieldnames=fnames)
            w.writeheader()
            w.writerows(all_combined_rows)
    print(f"  Consolidated slow queries: written to {combined_file}")


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — RAMP
# ─────────────────────────────────────────────────────────────────────────────
def phase3_ramp():
    banner("PHASE 3 — Ramp (Scenario D: RampUser)")
    stages = [10, 50, 100, 500]
    stage_summaries = []

    for n_users in stages:
        spawn_rate = max(1, n_users // 10)
        stage_label = f"stage_{n_users}"
        stage_dir = RESULTS_DIR / stage_label
        stage_dir.mkdir(exist_ok=True)
        stage_log = stage_dir / f"{stage_label}.log"

        print(f"\n[Ramp] Stage {n_users} users  spawn_rate={spawn_rate}/s  duration=2m")

        csv_prefix = str(stage_dir / stage_label)
        cmd = [
            sys.executable, "-m", "locust",
            "-f", "locustfile.py",
            "--headless",
            "-u", str(n_users), "-r", str(spawn_rate), "-t", "2m",
            "RampUser",
            "--csv", csv_prefix,
            "--csv-full-history",
            "--loglevel", "WARNING",
            "--stop-timeout", "30",
        ]
        print(f"  Command: {' '.join(cmd)}")
        print(f"  Log:     {stage_log}")

        # Start stats sampler (locust PID unknown yet; sampler will find it)
        sampler = DockerStatsSampler(stage_dir, stage_label)
        sampler.start()

        # Run Locust
        start_t = time.time()
        rc = run_cmd(cmd, stage_log)
        elapsed = time.time() - start_t

        sampler.stop()
        saturated = sampler.saturated

        # Extract slow queries
        extract_slow_queries(stage_dir, stage_label)

        # Parse aggregated stats
        stats_file = stage_dir / f"{stage_label}_stats.csv"
        agg_row = {}
        endpoint_rows = []
        if stats_file.exists():
            with open(stats_file, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                for row in rows:
                    if row.get("Name") == "Aggregated":
                        agg_row = row
                    else:
                        endpoint_rows.append(row)

        summary = {
            "users": n_users,
            "spawn_rate": spawn_rate,
            "duration_s": round(elapsed),
            "saturated": saturated,
            "agg": agg_row,
            "endpoints": endpoint_rows,
            "rc": rc,
        }
        stage_summaries.append(summary)

        req_s = agg_row.get("Requests/s", "?")
        fail_pct = _fail_pct(agg_row)
        p50 = agg_row.get("50%", "?")
        p95 = agg_row.get("95%", "?")
        p99 = agg_row.get("99%", "?")
        sat_flag = "⚠️ SATURATED" if saturated else "OK"

        print(f"  ✅ Stage {n_users} done — req/s={req_s}  p50={p50}ms  p95={p95}ms  p99={p99}ms  fail%={fail_pct}  locust_cpu={sat_flag}")

        # 30-second pause between stages
        if n_users != stages[-1]:
            print("  Pausing 30 s before next stage...")
            time.sleep(30)

    return stage_summaries


def _fail_pct(agg: dict) -> str:
    try:
        reqs  = int(agg.get("Request Count", 0))
        fails = int(agg.get("Failure Count", 0))
        if reqs == 0:
            return "N/A"
        return f"{100 * fails / reqs:.1f}%"
    except Exception:
        return "?"


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — REPORT
# ─────────────────────────────────────────────────────────────────────────────
def phase4_report(stage_summaries, b_outcome, c_outcome):
    banner("PHASE 4 — Generating REPORT.md")

    specs = (RESULTS_DIR / "machine_specs.md").read_text(encoding="utf-8")
    b_res = (RESULTS_DIR / "scenario_B_result.json").read_text(encoding="utf-8")
    c_res = (RESULTS_DIR / "scenario_C_result.json").read_text(encoding="utf-8")
    b_data = json.loads(b_res)
    c_data = json.loads(c_res)

    lines = []
    lines.append(f"# Load-Test Report — Label: {LABEL}")
    lines.append(f"_Generated: {datetime.now().isoformat()}_")
    lines.append("")
    lines.append(specs)
    lines.append("")

    # Stage summary table
    lines.append("## Phase 3 — Ramp Stage Results")
    lines.append("")
    lines.append("| Users | Spawn/s | Req/s | p50 ms | p95 ms | p99 ms | Fail% | Locust CPU |")
    lines.append("|-------|---------|-------|--------|--------|--------|-------|------------|")
    for s in stage_summaries:
        agg = s["agg"]
        sat = "⚠️ saturated" if s["saturated"] else "OK"
        lines.append(
            f"| {s['users']} | {s['spawn_rate']} "
            f"| {agg.get('Requests/s','?')} "
            f"| {agg.get('50%','?')} "
            f"| {agg.get('95%','?')} "
            f"| {agg.get('99%','?')} "
            f"| {_fail_pct(agg)} "
            f"| {sat} |"
        )

    lines.append("")
    lines.append("### Per-endpoint p95 (final stage — 500 users)")
    lines.append("")
    last_stage = stage_summaries[-1] if stage_summaries else {}
    ep_rows = last_stage.get("endpoints", [])
    if ep_rows:
        lines.append("| Endpoint | Req Count | Fail Count | p95 ms | p99 ms |")
        lines.append("|----------|-----------|------------|--------|--------|")
        for ep in sorted(ep_rows, key=lambda r: int(r.get("95%", 0) or 0), reverse=True):
            lines.append(
                f"| {ep.get('Name','?')} "
                f"| {ep.get('Request Count','?')} "
                f"| {ep.get('Failure Count','?')} "
                f"| {ep.get('95%','?')} "
                f"| {ep.get('99%','?')} |"
            )
    else:
        lines.append("_No per-endpoint data available._")

    lines.append("")
    lines.append("## Phase 2 — Scenario Results")
    lines.append("")
    lines.append("### Scenario B — Concurrent signup race")
    b_status = "✅ PASS" if b_data.get("pass") else "❌ FAIL"
    lines.append(f"**Result: {b_status}**")
    lines.append(f"- Success (201): {b_data.get('success_count', 'not measured')}")
    lines.append(f"- Duplicate (400): {b_data.get('duplicate_count', 'not measured')}")
    lines.append(f"- Other: {b_data.get('other_count', 'not measured')}")
    lines.append(f"- Note: {b_data.get('note', '')}")
    lines.append("")

    lines.append("### Scenario C — Last-unit stock race")
    c_status = "✅ PASS" if c_data.get("pass") else "❌ FAIL"
    lines.append(f"**Result: {c_status}**")
    lines.append(f"- Target product_id: {c_data.get('target_product_id', 'not measured')}")
    lines.append(f"- Original stock: {c_data.get('original_stock', 'not measured')}")
    lines.append(f"- Final stock: {c_data.get('final_stock', 'not measured')}")
    lines.append(f"- Success (201): {c_data.get('success_count', 'not measured')}")
    lines.append(f"- Failure (409): {c_data.get('failure_count', 'not measured')}")
    lines.append(f"- Other: {c_data.get('other_count', 'not measured')}")
    lines.append(f"- Note: {c_data.get('note', '')}")
    lines.append("")

    # Bottleneck analysis from measured data
    lines.append("## Bottleneck Analysis (from measured data)")
    lines.append("")

    # Find first degrading endpoint
    first_degrade = _find_first_degrading_endpoint(stage_summaries)
    lines.append(f"### Endpoint degradation")
    lines.append(first_degrade)
    lines.append("")

    # Container CPU/RAM from docker stats
    lines.append("### Container saturation")
    lines.append(_summarise_docker_stats(stage_summaries))
    lines.append("")

    # Slow queries
    lines.append("### Slow queries (top 5 per DB per stage)")
    for s in stage_summaries:
        stage_label = f"stage_{s['users']}"
        stage_dir   = RESULTS_DIR / stage_label
        for db in ("orders_db", "users_db", "products_db"):
            sq_file = stage_dir / f"{stage_label}_{db}_slow_queries.csv"
            if sq_file.exists():
                lines.append(f"\n#### {stage_label} / {db}")
                with open(sq_file, encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                if rows:
                    lines.append("| query (truncated) | calls | total_exec_ms | mean_exec_ms |")
                    lines.append("|---|---|---|---|")
                    for r in rows[:5]:
                        q = r.get("query", "").replace("|", " ").replace("\n", " ")[:80]
                        lines.append(f"| {q} | {r.get('calls','?')} | {r.get('total_exec_ms','?')} | {r.get('mean_exec_ms','?')} |")

    lines.append("")
    lines.append("### Suggestions (not implemented — bottlenecks only)")
    lines.append("_(Based only on measured data above)_")
    lines.append("")
    lines.append(_suggestions(stage_summaries))

    lines.append("")
    lines.append("## Plain-language summary")
    lines.append("")
    lines.append(_plain_summary(stage_summaries, b_data, c_data))

    report_path = RESULTS_DIR / "REPORT.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅ Report written to {report_path}")


def _find_first_degrading_endpoint(stage_summaries: list) -> str:
    """Find which endpoint's p95 crosses 500ms first and at how many users."""
    threshold_ms = 500
    findings = []
    for s in stage_summaries:
        for ep in s.get("endpoints", []):
            try:
                p95 = int(ep.get("95%", 0) or 0)
                if p95 >= threshold_ms:
                    findings.append(
                        f"- `{ep.get('Name','?')}` crossed {threshold_ms}ms p95 "
                        f"at **{s['users']} users** (measured p95={p95}ms)"
                    )
                    break
            except Exception:
                pass
    if findings:
        return "\n".join(findings)
    return f"No endpoint exceeded {threshold_ms}ms p95 in any measured stage."


def _summarise_docker_stats(stage_summaries: list) -> str:
    """Read docker stats CSVs and report the container with peak CPU per stage."""
    lines = []
    for s in stage_summaries:
        stage_label = f"stage_{s['users']}"
        stage_dir   = RESULTS_DIR / stage_label
        csv_file    = stage_dir / f"{stage_label}_docker_stats.csv"
        if not csv_file.exists():
            lines.append(f"- **{stage_label}**: docker stats file not found")
            continue
        peak_cpu = {}  # container → max cpu%
        try:
            with open(csv_file, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    cname = row.get("container", "?")
                    cpu_s = row.get("cpu_pct", "0").replace("%", "")
                    try:
                        cpu = float(cpu_s)
                        peak_cpu[cname] = max(peak_cpu.get(cname, 0.0), cpu)
                    except Exception:
                        pass
        except Exception as e:
            lines.append(f"- **{stage_label}**: error reading docker stats: {e}")
            continue

        if peak_cpu:
            top = sorted(peak_cpu.items(), key=lambda x: x[1], reverse=True)[:3]
            top_str = ", ".join(f"{c}={v:.1f}%" for c, v in top)
            lines.append(f"- **{stage_label}** ({s['users']} users) peak CPU: {top_str}")
        else:
            lines.append(f"- **{stage_label}**: no docker stats samples")
    return "\n".join(lines) if lines else "not measured"


def _suggestions(stage_summaries: list) -> str:
    suggestions = []
    # Check if any stage had failure % > 5%
    for s in stage_summaries:
        fp = _fail_pct(s["agg"])
        try:
            if float(fp.replace("%", "")) > 5.0:
                suggestions.append(
                    f"- High failure rate ({fp}) at {s['users']} users. "
                    "Consider adding DB connection pooling (pgbouncer) and increasing inventory stock."
                )
                break
        except Exception:
            pass
    # Check saturation
    for s in stage_summaries:
        if s["saturated"]:
            suggestions.append(
                f"- Locust CPU saturated at {s['users']} users. "
                "Consider running Locust in distributed mode for larger stages."
            )
            break
    if not suggestions:
        suggestions.append("No saturation or high-failure stages detected up to the measured scale.")
    return "\n".join(suggestions)


def _plain_summary(stage_summaries, b_data, c_data) -> str:
    if not stage_summaries:
        return "not measured"
    last = stage_summaries[-1]
    agg = last["agg"]
    b_status = "passed" if b_data.get("pass") else "failed"
    c_status = "passed" if c_data.get("pass") else "failed"
    return (
        f"The load test ran {len(stage_summaries)} ramp stages (10→500 users) against "
        f"the {LABEL} dataset. "
        f"At {last['users']} users the system achieved {agg.get('Requests/s','?')} req/s "
        f"with p50={agg.get('50%','?')}ms, p95={agg.get('95%','?')}ms, p99={agg.get('99%','?')}ms, "
        f"and a failure rate of {_fail_pct(agg)}. "
        f"Scenario B (signup race) {b_status}: "
        f"{b_data.get('success_count','?')} successful registration(s) out of 50 concurrent attempts. "
        f"Scenario C (last-unit race) {c_status}: "
        f"{c_data.get('success_count','?')} successful order(s) when stock was 1, "
        f"final stock={c_data.get('final_stock','?')}."
    )


# ─────────────────────────────────────────────────────────────────────────────
# HOUSEKEEPING
# ─────────────────────────────────────────────────────────────────────────────
def housekeeping():
    banner("Housekeeping")
    # Ensure large raw log files are gitignored
    gitignore = Path(".gitignore")
    lines_to_add = [
        "",
        "# Load-test results — keep locally only",
        "loadtest/results/*/",
        "loadtest/results/**/*.log",
        "loadtest/results/**/*_stats_history.csv",
    ]
    existing = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    added = False
    for line in lines_to_add:
        if line.strip() and line.strip() not in existing:
            existing += f"\n{line}"
            added = True
    if added:
        gitignore.write_text(existing, encoding="utf-8")
        print("  .gitignore updated with loadtest/results patterns.")

    # Check for files > 5 MB in results dir
    big_files = []
    for f in RESULTS_DIR.rglob("*"):
        if f.is_file() and f.stat().st_size > 5 * 1024 * 1024:
            big_files.append((f, f.stat().st_size // (1024 * 1024)))
    if big_files:
        print("  ⚠️  Files > 5 MB (will not commit):")
        for f, sz in big_files:
            print(f"    {f}  ({sz} MB)")
    else:
        print("  No files > 5 MB in results directory.")

    # Print git status
    print("\n  git status:")
    gs = subprocess.run(["git", "status", "--short"], capture_output=True, text=True)
    print(gs.stdout if gs.stdout else "  (nothing to show)")
    print("\n  Note: nothing committed.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n🚀 OMS Load Test — Label: {LABEL}")
    print(f"   Results directory: {RESULTS_DIR.resolve()}")
    print(f"   Start time: {datetime.now().isoformat()}")

    orders_count, users_count, status_rows = phase0_prechecks()
    phase1_smoke()
    b_outcome, c_outcome = phase2_scenarios()
    stage_summaries = phase3_ramp()
    phase4_report(stage_summaries, b_outcome, c_outcome)
    housekeeping()

    print(f"\n🏁 All phases complete. Report: {(RESULTS_DIR / 'REPORT.md').resolve()}")
