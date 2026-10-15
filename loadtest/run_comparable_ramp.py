"""
loadtest/run_comparable_ramp.py
────────────────────────────────────────────────────────────────────────────
Runs comparable RampUser stages (10, 50, 100 users, and conditionally 500 users)
to measure the exact performance after optimizations (indexes, bcrypt rounds, connection pooling).
Stores results in loadtest/results/1M/post_opt_stage_<N>/
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
import subprocess
import threading
import time
from pathlib import Path
import psutil
import psycopg2
import psycopg2.extras

RESULTS_DIR = Path("loadtest/results/1M")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

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

def run_cmd(cmd: list[str], log_file: Path) -> int:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with open(log_file, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            cmd, stdout=lf, stderr=subprocess.STDOUT, text=True
        )
        return proc.wait()

class DockerStatsSampler:
    def __init__(self, stage_dir: Path, stage_label: str):
        self.stage_dir   = stage_dir
        self.stage_label = stage_label
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self.docker_csv  = stage_dir / f"{stage_label}_docker_stats.csv"
        self.locust_csv  = stage_dir / f"{stage_label}_locust_cpu.csv"
        self.saturated   = False

        with open(self.docker_csv, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["timestamp", "container", "cpu_pct", "mem_pct"])
        with open(self.locust_csv, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["timestamp", "locust_cpu_pct"])

    def start(self): self._thread.start()
    def stop(self): self._stop.set(); self._thread.join(timeout=15)

    def _run(self):
        locust_proc = None
        while not self._stop.is_set():
            ts = time.strftime("%Y-%m-%dT%H:%M:%S")
            try:
                out = subprocess.check_output(
                    ["docker", "stats", "--no-stream", "--format", "{{.Name}},{{.CPUPerc}},{{.MemPerc}}"],
                    text=True, stderr=subprocess.DEVNULL, timeout=10
                )
                with open(self.docker_csv, "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    for line in out.strip().splitlines():
                        parts = line.split(",")
                        if len(parts) == 3:
                            writer.writerow([ts, parts[0].strip(), parts[1].strip(), parts[2].strip()])
            except Exception:
                pass

            if locust_proc is None:
                for p in psutil.process_iter(["name", "cmdline"]):
                    try:
                        cmdline = " ".join(p.info["cmdline"] or [])
                        if "locust" in cmdline and "RampUser" in cmdline:
                            locust_proc = p
                            break
                    except Exception:
                        pass
            if locust_proc:
                try:
                    cpu = locust_proc.cpu_percent(interval=0.1)
                    if cpu > 80.0:
                        self.saturated = True
                    with open(self.locust_csv, "a", newline="", encoding="utf-8") as f:
                        csv.writer(f).writerow([ts, f"{cpu:.1f}%"])
                except Exception:
                    locust_proc = None

            self._stop.wait(5)

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

            for r in rows:
                r_copy = dict(r)
                r_copy["database"] = db
                all_combined_rows.append(r_copy)

            conn = get_conn(db)
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("SELECT pg_stat_statements_reset();")
            conn.close()
        except Exception as e:
            print(f"  [WARN] Could not extract slow queries for {db}: {e}")

    combined_file = stage_dir / f"{stage_label}_slow_queries.csv"
    with open(combined_file, "w", newline="", encoding="utf-8") as f:
        if all_combined_rows:
            fnames = ["database", "query", "calls", "total_exec_ms", "mean_exec_ms", "rows"]
            w = csv.DictWriter(f, fieldnames=fnames)
            w.writeheader()
            w.writerows(all_combined_rows)

def run_single_stage(n_users: int, duration: str = "2m"):
    spawn_rate = max(1, n_users // 10)
    stage_label = f"post_opt_stage_{n_users}"
    stage_dir = RESULTS_DIR / stage_label
    stage_dir.mkdir(exist_ok=True)
    stage_log = stage_dir / f"{stage_label}.log"

    print(f"\n{'='*70}\n[Optimized Ramp] Stage {n_users} users  spawn_rate={spawn_rate}/s  duration={duration}\n{'='*70}")

    csv_prefix = str(stage_dir / stage_label)
    cmd = [
        sys.executable, "-m", "locust",
        "-f", "locustfile.py",
        "--headless",
        "-u", str(n_users), "-r", str(spawn_rate), "-t", duration,
        "RampUser",
        "--csv", csv_prefix,
        "--csv-full-history",
        "--loglevel", "WARNING",
        "--stop-timeout", "30",
    ]
    print(f"  Command: {' '.join(cmd)}")

    sampler = DockerStatsSampler(stage_dir, stage_label)
    sampler.start()

    start_t = time.time()
    rc = run_cmd(cmd, stage_log)
    elapsed = time.time() - start_t

    sampler.stop()
    saturated = sampler.saturated

    extract_slow_queries(stage_dir, stage_label)

    stats_file = stage_dir / f"{stage_label}_stats.csv"
    agg_row = {}
    endpoint_rows = []
    if stats_file.exists():
        with open(stats_file, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("Name") == "Aggregated":
                    agg_row = row
                else:
                    endpoint_rows.append(row)

    reqs = int(agg_row.get("Request Count", 0)) if agg_row.get("Request Count") else 0
    fails = int(agg_row.get("Failure Count", 0)) if agg_row.get("Failure Count") else 0
    fail_pct = f"{100 * fails / reqs:.2f}%" if reqs > 0 else "0.0%"

    summary = {
        "users": n_users,
        "spawn_rate": spawn_rate,
        "duration_s": round(elapsed),
        "saturated": saturated,
        "agg": agg_row,
        "endpoints": endpoint_rows,
        "rc": rc,
        "fail_pct": fail_pct,
    }

    summary_file = stage_dir / "summary.json"
    summary_file.write_text(json.dumps(summary, indent=2))

    req_s = agg_row.get("Requests/s", "?")
    p50 = agg_row.get("50%", "?")
    p95 = agg_row.get("95%", "?")
    p99 = agg_row.get("99%", "?")
    print(f"  >>> RESULT Stage {n_users}: req/s={req_s}  p50={p50}ms  p95={p95}ms  p99={p99}ms  fail%={fail_pct}")
    return summary

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stages", default="10,50,100", help="Comma-separated user counts")
    parser.add_argument("--duration", default="2m", help="Duration per stage")
    args = parser.parse_args()

    stages = [int(x.strip()) for x in args.stages.split(",") if x.strip()]
    results = []

    for idx, u in enumerate(stages):
        res = run_single_stage(u, duration=args.duration)
        results.append(res)
        if idx < len(stages) - 1:
            print("  Cooling down 15 seconds before next stage...")
            time.sleep(15)

    print("\n" + "="*70)
    print("ALL COMPLETED STAGES SUMMARY")
    print("="*70)
    for r in results:
        agg = r["agg"]
        print(f"Users: {r['users']:3d} | Req/s: {agg.get('Requests/s','?'):>8} | p50: {agg.get('50%','?'):>5} ms | p95: {agg.get('95%','?'):>5} ms | p99: {agg.get('99%','?'):>5} ms | Fail: {r['fail_pct']}")

if __name__ == "__main__":
    main()
