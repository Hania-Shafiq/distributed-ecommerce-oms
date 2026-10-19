"""
loadtest/diagnose_503.py
─────────────────────────────────────────────────────────────────────────────
Step 1 Diagnostic Harness:
1. Prints uvicorn and DB pool settings for all microservices.
2. Runs 500-user stage for full 120s steady state (per-endpoint guard disabled,
   global >20% failure rule retained).
3. Concurrently captures docker logs of product-service, order-service, user-service,
   and inventory-service.
4. Identifies exact layer and root cause for any 503 or 5xx responses.
─────────────────────────────────────────────────────────────────────────────
"""

import csv
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
LOADTEST_DIR = Path(__file__).resolve().parent
if str(LOADTEST_DIR) not in sys.path:
    sys.path.insert(0, str(LOADTEST_DIR))

from run_loadtest import run_locust_stage, extract_slow_queries, prevent_sleep, _parse_ramp_vs_steady
from preauth_pool import init_preauth_pool

import argparse

parser = argparse.ArgumentParser(description="Diagnostic 500-user stage runner")
parser.add_argument("--output-dir", default="loadtest/results/50M/step1_500", help="Output directory")
parser.add_argument("--label", default="stage_500_diagnostic", help="Stage label")
cli_args, _ = parser.parse_known_args()

RESULTS_DIR = Path(cli_args.output_dir)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
STAGE_LABEL = cli_args.label


def print_service_configs():
    banner = "=" * 78
    print(banner)
    print("  SERVICE CONFIGURATIONS: UVICORN COMMANDS & DB POOL SETTINGS")
    print(banner)

    configs = [
        {
            "service": "user-service",
            "source": "docker-compose.yml / database.py",
            "command": "uvicorn main:app --host 0.0.0.0 --port 8001 --timeout-keep-alive 65 --limit-concurrency 500",
            "workers": 1,
            "limit_concurrency": 500,
            "db_pool": "SQLAlchemy pool_size=25, max_overflow=15 (max 40 connections), pool_pre_ping=True",
        },
        {
            "service": "order-service",
            "source": "docker-compose.yml / database.py",
            "command": "uvicorn main:app --host 0.0.0.0 --port 8004 --timeout-keep-alive 65 --limit-concurrency 500",
            "workers": 1,
            "limit_concurrency": 500,
            "db_pool": "SQLAlchemy pool_size=25, max_overflow=15 (max 40 connections), pool_pre_ping=True",
        },
        {
            "service": "product-service",
            "source": "docker-compose.yml / database.py",
            "command": "uvicorn main:app --host 0.0.0.0 --port 8006 --timeout-keep-alive 65 --limit-concurrency 500",
            "workers": 1,
            "limit_concurrency": 500,
            "db_pool": "SQLAlchemy pool_size=25, max_overflow=15 (max 40 connections), pool_pre_ping=True",
        },
        {
            "service": "inventory-service",
            "source": "Dockerfile / database.py",
            "command": "uvicorn main:app --host 0.0.0.0 --port 8003 (default uvicorn CMD)",
            "workers": 1,
            "limit_concurrency": "None (unlimited)",
            "db_pool": "SQLAlchemy pool_size=25, max_overflow=15 (max 40 connections), pool_pre_ping=True",
        },
        {
            "service": "admin-analytics",
            "source": "Dockerfile / database.py",
            "command": "uvicorn main:app --host 0.0.0.0 --port 8002 (default uvicorn CMD)",
            "workers": 1,
            "limit_concurrency": "None (unlimited)",
            "db_pool": "Elasticsearch client (Urllib3 connection pool)",
        },
        {
            "service": "recommendation-service",
            "source": "Dockerfile",
            "command": "uvicorn main:app --host 0.0.0.0 --port 8005 (default uvicorn CMD)",
            "workers": 1,
            "limit_concurrency": "None (unlimited)",
            "db_pool": "Neo4j Python driver internal connection pool",
        },
    ]

    for c in configs:
        print(f"\n[Service: {c['service']}]")
        print(f"  Source:             {c['source']}")
        print(f"  Uvicorn Command:    {c['command']}")
        print(f"  Workers:            {c['workers']}")
        print(f"  Limit Concurrency:  {c['limit_concurrency']}")
        print(f"  DB Pool Settings:   {c['db_pool']}")

    return configs


def get_docker_logs_since(container_name: str, since_iso: str) -> str:
    try:
        res = subprocess.run(
            ["docker", "logs", "--since", since_iso, container_name],
            capture_output=True, text=True, errors="replace", timeout=30
        )
        return (res.stdout or "") + (res.stderr or "")
    except Exception as e:
        return f"[Error fetching logs for {container_name}: {e}]"


def main():
    configs = print_service_configs()
    prevent_sleep()

    print("\n" + "=" * 78)
    print("  STEP 1: RUNNING 500-USER STAGE FOR FULL 2 MINUTES")
    print("  (Per-endpoint 5% guard DISABLED; global >20% rule active)")
    print("=" * 78)

    # 1. Refresh 200 pre-authenticated accounts
    print("\n[Pre-Stage] Refreshing 200-account pre-authenticated pool in user-service...")
    init_preauth_pool(target_size=200, force_refresh=True)

    # Record timestamp for docker logs (ISO 8601 UTC)
    start_time_iso = datetime.now(timezone.utc).isoformat()
    t_start = time.time()

    # 2. Run Locust stage
    stage_label = STAGE_LABEL
    rc, sampler, elapsed, aborted, abort_reason = run_locust_stage(
        n_users=500,
        spawn_rate=50,
        steady_duration_s=120,
        stage_dir=RESULTS_DIR,
        stage_label=stage_label,
        user_class="RampUser",
        distributed=True,
        num_workers=3,
        is_stress_stage=False,
        disable_per_endpoint_guard=True,
    )

    t_end = time.time()
    extract_slow_queries(RESULTS_DIR, stage_label)

    print("\n" + "=" * 78)
    print(f"  STAGE FINISHED: Elapsed={elapsed:.1f}s | Aborted={aborted} | Reason='{abort_reason}'")
    print("=" * 78)

    # 3. Capture docker logs for product-service, order-service, user-service, inventory-service
    log_targets = ["product-service", "order-service", "user-service", "inventory-service"]
    captured_logs = {}
    for target in log_targets:
        raw_log = get_docker_logs_since(target, start_time_iso)
        log_file = RESULTS_DIR / f"{target}_docker.log"
        with open(log_file, "w", encoding="utf-8") as lf:
            lf.write(raw_log)
        captured_logs[target] = raw_log
        print(f"  Captured {len(raw_log.splitlines())} log lines for {target} -> {log_file}")

    # 4. Parse Locust Results
    stats_file = RESULTS_DIR / f"{stage_label}_stats.csv"
    failures_file = RESULTS_DIR / f"{stage_label}_failures.csv"

    stats_rows = []
    agg_row = {}
    if stats_file.exists():
        with open(stats_file, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("Name") == "Aggregated":
                    agg_row = r
                else:
                    stats_rows.append(r)

    failures_rows = []
    if failures_file.exists():
        with open(failures_file, encoding="utf-8") as f:
            failures_rows = list(csv.DictReader(f))

    print("\n[Locust Aggregated Stats]")
    print(f"  Requests:      {agg_row.get('Request Count', '?')}")
    print(f"  Failures:      {agg_row.get('Failure Count', '?')}")
    print(f"  Throughput:    {agg_row.get('Requests/s', '?')} req/s")
    print(f"  p50 (median):  {agg_row.get('50%', '?')} ms")
    print(f"  p95:           {agg_row.get('95%', '?')} ms")
    print(f"  p99:           {agg_row.get('99%', '?')} ms")

    print("\n[Per-Endpoint Breakdown]")
    print(f"  {'Endpoint':<35} {'Reqs':>8} {'Fails':>8} {'Fail%':>8} {'p50 ms':>8} {'p95 ms':>8}")
    print("  " + "-" * 75)
    for r in stats_rows:
        req = int(r.get("Request Count", 0) or 0)
        fail = int(r.get("Failure Count", 0) or 0)
        pct = (fail / req * 100.0) if req else 0.0
        print(f"  {r.get('Name',''):<35} {req:>8} {fail:>8} {pct:>7.1f}% {r.get('50%','?'):>8} {r.get('95%','?'):>8}")

    print("\n[Recorded Failures]")
    if failures_rows:
        for f in failures_rows:
            print(f"  {f.get('Method','')} {f.get('Name','')} | Count: {f.get('Occurrences','')} | Error: {f.get('Error','')}")
    else:
        print("  None")

    # 5. Analyze docker logs for grep keywords
    keywords = ["503", "concurrency", "pool", "timeout", "QueuePool", "Limit", "Service Unavailable", "dropped"]
    print("\n[Docker Logs Grep Analysis]")
    findings_grep = {}
    for target, log_text in captured_logs.items():
        matched_lines = []
        for line in log_text.splitlines():
            if any(k.lower() in line.lower() for k in keywords):
                matched_lines.append(line)
        findings_grep[target] = matched_lines
        print(f"  {target}: {len(matched_lines)} matching lines found.")
        for ml in matched_lines[:15]:
            print(f"    [{target}] {ml}")

    # Return structured summary
    return {
        "configs": configs,
        "elapsed": elapsed,
        "aborted": aborted,
        "abort_reason": abort_reason,
        "agg": agg_row,
        "stats": stats_rows,
        "failures": failures_rows,
        "grep": findings_grep,
        "peak_locust_cpu": sampler.peak_locust_cpu,
    }


if __name__ == "__main__":
    main()
