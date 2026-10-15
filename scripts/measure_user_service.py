import subprocess
import time
import json

print("Restarting user-service container...")
t0 = time.time()
subprocess.run(["docker", "restart", "user-service"], check=True)
restart_wall_time = time.time() - t0

# Wait a brief moment for lifespan startup completion
time.sleep(2)

# Check health endpoint
import urllib.request
health_ok = False
health_t0 = time.time()
for _ in range(10):
    try:
        with urllib.request.urlopen("http://localhost:8001/health", timeout=3) as resp:
            if resp.status == 200:
                health_ok = True
                break
    except Exception:
        time.sleep(0.5)

# Fetch stats
stats_raw = subprocess.check_output(["docker", "stats", "user-service", "--no-stream", "--format", "{{json .}}"], text=True)
stats = json.loads(stats_raw)

# Fetch logs
logs = subprocess.check_output(["docker", "logs", "--tail", "25", "user-service"], text=True)

print("=" * 60)
print("USER SERVICE RESTART & BLOOM FILTER BENCHMARK")
print("=" * 60)
print(f"Docker Restart Wall-Clock Time: {restart_wall_time:.2f}s")
print(f"Health Probe (/health):          {'PASS (200 OK)' if health_ok else 'FAIL'}")
print(f"Container Memory Usage:          {stats.get('MemUsage', 'N/A')}")
print(f"Container Memory Percentage:     {stats.get('MemPerc', 'N/A')}")
print(f"Container CPU Percentage:        {stats.get('CPUPerc', 'N/A')}")
print("\nContainer Startup Logs:")
print(logs.strip())
print("=" * 60)
