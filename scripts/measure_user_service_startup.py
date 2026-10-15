"""
measure_user_service_startup.py - Measure user-service startup time, Bloom filter init, and RSS memory
"""
import subprocess
import time
import json
import re

print("="*70)
print("[START] MEASURING USER-SERVICE STARTUP & MEMORY FOOTPRINT (~1.25M USERS)")
print("="*70)

# 1. Restart user-service
t_start = time.time()
print("Restarting user-service container via docker compose...")
subprocess.run(["docker", "compose", "restart", "user-service"], check=True)

# 2. Wait until healthy / application startup complete in logs
print("Monitoring user-service logs for startup completion...")
startup_finished = False
poll_interval = 2.0
timeout = 300.0
elapsed = 0.0

start_init_ts = None
bloom_start_ts = None
bloom_end_ts = None
app_ready_ts = None
users_loaded_count = None

while elapsed < timeout:
    res = subprocess.run(["docker", "compose", "logs", "user-service", "--tail=50"],
                         capture_output=True, text=True)
    logs = res.stdout

    for line in logs.splitlines():
        if "Initializing database tables..." in line:
            start_init_ts = line.split(" [INFO]")[0].strip()
        if "Hydrating Bloom filter" in line:
            bloom_start_ts = line.split(" [INFO]")[0].strip()
        if "Bloom Filter synchronized:" in line:
            bloom_end_ts = line.split(" [INFO]")[0].strip()
            m = re.search(r"(\d+) users loaded", line)
            if m:
                users_loaded_count = int(m.group(1))
        if "Application startup complete." in line:
            startup_finished = True

    if startup_finished and bloom_end_ts:
        print("Application startup complete detected!")
        break
    time.sleep(poll_interval)
    elapsed = time.time() - t_start

total_wall_restart = time.time() - t_start
print(f"Total restart command to ready wall time: {total_wall_restart:.2f}s")

# 3. Measure Memory Footprint via docker stats
print("\nFetching Docker container stats...")
stats_res = subprocess.run(
    ["docker", "stats", "user-service", "--no-stream", "--format", "{{json .}}"],
    capture_output=True, text=True
)
stats_json = json.loads(stats_res.stdout.strip())
print("Docker Stats:")
print(f"  Container:    {stats_json.get('Name')}")
print(f"  Mem Usage:    {stats_json.get('MemUsage')}")
print(f"  Mem %:        {stats_json.get('MemPerc')}")
print(f"  CPU %:        {stats_json.get('CPUPerc')}")

# Also get exact bytes from docker inspect
inspect_res = subprocess.run(
    ["docker", "inspect", "distributed-ecommerce-oms-user-service-1", "--format", "{{.State.Pid}}"],
    capture_output=True, text=True
)
pid = inspect_res.stdout.strip()
print(f"Container Host PID: {pid}")

print("\nStartup Timestamp Analysis:")
print(f"  DB Init Start:          {start_init_ts}")
print(f"  Bloom Hydration Start:  {bloom_start_ts}")
print(f"  Bloom Synchronized End: {bloom_end_ts}")
print(f"  Users Loaded into Bloom: {users_loaded_count:,}")

# Parse time delta if timestamps available
from datetime import datetime
if bloom_start_ts and bloom_end_ts:
    fmt = "%Y-%m-%d %H:%M:%S,%f"
    try:
        t0 = datetime.strptime(bloom_start_ts, fmt)
        t1 = datetime.strptime(bloom_end_ts, fmt)
        bloom_duration = (t1 - t0).total_seconds()
        print(f"  Bloom Filter Init Time: {bloom_duration:.3f} seconds ({bloom_duration/60:.2f} min)")
    except Exception as e:
        print(f"  Could not parse timestamp format: {e}")

print("="*70)
