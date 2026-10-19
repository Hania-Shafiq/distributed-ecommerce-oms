"""
loadtest/run_breaking_point.py
─────────────────────────────────────────────────────────────────────────────
Step 3 Breaking Point Analysis:
Runs stages 200, 300, and 400 users in the same standard mode:
- Locust Master + 3 Workers on Windows
- 2 minutes (120s) steady state each with --reset-stats after spawn
- Same abort rules (after 20s, any endpoint > 5% fails -> abort; global > 20% fails -> abort)
- Pre-authenticated 200-account token pool refreshed before each stage
- Captures docker stats, locust cpu, and pg_stat_statements slow queries
- Identifies the first stage where failures > 1% or p95 > 1s, and responsible container/endpoint.
─────────────────────────────────────────────────────────────────────────────
"""

import csv
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
LOADTEST_DIR = Path(__file__).resolve().parent
if str(LOADTEST_DIR) not in sys.path:
    sys.path.insert(0, str(LOADTEST_DIR))

from run_loadtest import run_locust_stage, extract_slow_queries, prevent_sleep, _parse_ramp_vs_steady, _safe_float, _safe_int
from preauth_pool import init_preauth_pool

RESULTS_DIR = Path("loadtest/results/50M/breaking_point")
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

STAGES = [
    {"users": 200, "spawn_rate": 20, "label": "stage_200"},
    {"users": 300, "spawn_rate": 30, "label": "stage_300"},
    {"users": 400, "spawn_rate": 40, "label": "stage_400"},
]


def run_stage(cfg):
    n_users = cfg["users"]
    spawn_rate = cfg["spawn_rate"]
    stage_label = cfg["label"]
    stage_dir = RESULTS_DIR / stage_label
    stage_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 78)
    print(f"  RUNNING BREAKING POINT STAGE: {n_users} Users (Spawn: {spawn_rate}/s, Steady: 120s)")
    print("=" * 78)

    # 1. Refresh pre-authenticated accounts
    print(f"  [Pre-Stage] Refreshing 200-account pre-authenticated pool in user-service...")
    init_preauth_pool(target_size=200, force_refresh=True)

    # 2. Run Locust stage (with standard 5% per-endpoint guard and global stress rules)
    rc, sampler, elapsed, aborted, abort_reason = run_locust_stage(
        n_users=n_users,
        spawn_rate=spawn_rate,
        steady_duration_s=120,
        stage_dir=stage_dir,
        stage_label=stage_label,
        user_class="RampUser",
        distributed=True,
        num_workers=3,
        is_stress_stage=False,
        disable_per_endpoint_guard=False,
    )

    # 3. Slow queries
    extract_slow_queries(stage_dir, stage_label)

    # 4. Parse statistics
    stats_file = stage_dir / f"{stage_label}_stats.csv"
    failures_file = stage_dir / f"{stage_label}_failures.csv"

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

    # Parse docker stats
    docker_csv = stage_dir / f"{stage_label}_docker_stats.csv"
    container_peaks = {}
    if docker_csv.exists():
        with open(docker_csv, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                cname = row.get("container", "")
                try:
                    cpu_val = float(row.get("cpu_pct", "0%").replace("%", ""))
                except Exception:
                    cpu_val = 0.0
                if cname not in container_peaks or cpu_val > container_peaks[cname]:
                    container_peaks[cname] = cpu_val

    req_cnt = _safe_int(agg_row.get("Request Count", 0))
    fail_cnt = _safe_int(agg_row.get("Failure Count", 0))
    fail_pct = (fail_cnt / req_cnt * 100.0) if req_cnt > 0 else 0.0
    p95_val = _safe_float(agg_row.get("95%", 0))
    p50_val = _safe_float(agg_row.get("50%", 0))
    p99_val = _safe_float(agg_row.get("99%", 0))
    req_s = _safe_float(agg_row.get("Requests/s", 0))

    summary = {
        "users": n_users,
        "spawn_rate": spawn_rate,
        "elapsed": round(elapsed, 1),
        "aborted": aborted,
        "abort_reason": abort_reason,
        "requests": req_cnt,
        "failures": fail_cnt,
        "fail_pct": round(fail_pct, 2),
        "req_s": round(req_s, 2),
        "p50_ms": p50_val,
        "p95_ms": p95_val,
        "p99_ms": p99_val,
        "peak_locust_cpu": round(sampler.peak_locust_cpu, 1),
        "container_peaks": container_peaks,
        "endpoints": stats_rows,
        "failures_detail": failures_rows,
    }

    print(f"\n[Result: Stage {n_users} Users]")
    print(f"  Duration:      {elapsed:.1f}s {'(ABORTED: ' + abort_reason + ')' if aborted else '(Completed 120s steady state)'}")
    print(f"  Throughput:    {req_s:.2f} req/s")
    print(f"  Requests:      {req_cnt} | Failures: {fail_cnt} ({fail_pct:.2f}%)")
    print(f"  Latency:       p50={p50_val:.0f} ms | p95={p95_val:.0f} ms | p99={p99_val:.0f} ms")
    print(f"  Locust Peak CPU: {sampler.peak_locust_cpu:.1f}%")
    top_containers = sorted(container_peaks.items(), key=lambda x: x[1], reverse=True)[:4]
    print(f"  Top Containers Peak CPU: {', '.join(f'{k}: {v:.1f}%' for k, v in top_containers)}")

    print("\n  Endpoint Details:")
    for ep in stats_rows:
        e_req = _safe_int(ep.get("Request Count", 0))
        e_fail = _safe_int(ep.get("Failure Count", 0))
        e_pct = (e_fail / e_req * 100.0) if e_req else 0.0
        print(f"    {ep.get('Name',''):<35} Reqs: {e_req:>6} | Fails: {e_fail:>5} ({e_pct:>5.1f}%) | p50: {ep.get('50%','?'):>5} ms | p95: {ep.get('95%','?'):>5} ms")

    return summary


def main():
    prevent_sleep()
    all_results = []
    breaking_stage = None

    for cfg in STAGES:
        res = run_stage(cfg)
        all_results.append(res)

        # Check if breaking criteria reached: failures > 1% or p95 > 1000 ms
        if breaking_stage is None and (res["fail_pct"] > 1.0 or res["p95_ms"] > 1000.0 or res["aborted"]):
            breaking_stage = res

    # Save overall breaking point summary JSON
    with open(RESULTS_DIR / "breaking_point_summary.json", "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2)

    print("\n" + "=" * 78)
    print("  BREAKING POINT ANALYSIS SUMMARY")
    print("=" * 78)
    if breaking_stage:
        print(f"🚨 First stage exceeding breaking criteria (Failures > 1% or p95 > 1,000 ms):")
        print(f"  Stage:         {breaking_stage['users']} Users")
        print(f"  Failures:      {breaking_stage['fail_pct']}% ({breaking_stage['failures']}/{breaking_stage['requests']})")
        print(f"  p95 Latency:   {breaking_stage['p95_ms']:.0f} ms")
        print(f"  Aborted:       {breaking_stage['aborted']} (Reason: {breaking_stage['abort_reason']})")
        # Identify responsible endpoint
        problematic_eps = [
            ep for ep in breaking_stage["endpoints"]
            if (_safe_int(ep.get("Failure Count", 0)) / max(1, _safe_int(ep.get("Request Count", 0)))) > 0.01
            or _safe_float(ep.get("95%", 0)) > 1000.0
        ]
        print("  Responsible Endpoint(s):")
        for pe in problematic_eps:
            p_req = _safe_int(pe.get("Request Count", 0))
            p_fail = _safe_int(pe.get("Failure Count", 0))
            p_pct = (p_fail / p_req * 100.0) if p_req else 0.0
            print(f"    - {pe.get('Name','')} | Failures: {p_fail}/{p_req} ({p_pct:.1f}%) | p95: {pe.get('95%','?')} ms")
    else:
        print("✅ No stage (200, 300, 400 users) exceeded 1% failures or 1,000 ms p95.")

    return all_results


if __name__ == "__main__":
    main()
