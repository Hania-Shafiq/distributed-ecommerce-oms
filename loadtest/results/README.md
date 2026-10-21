# Load Test Results Directory Guide

This directory contains benchmark and load testing artifacts for the Distributed E-Commerce OMS across scaling milestones.

## Benchmark Datasets & Run Classification

### Reference Benchmark: `50M_final/`
- **Status**: **Current Canonical Reference Run**
- **Specification**:
  - Target dataset: ~50M orders (`orders_db`), ~56M order items, ~1.25M users (`users_db`), 20-product catalog (`products_db`).
  - Codebase: Microservices built cleanly from commit `71233db`.
  - Protocol: Controlled multi-stage ramp (10 to 1,000 users) with Locust master + 3 workers, automated stat resets (`--reset-stats`), a 60-second cool-down, and clean service restarts (`order-service` and `product-service`) between stages.
- **Key Findings**:
  - Baseline and tuned throughput plateaued at ~170 req/s.
  - No database connection pool exhaustion or pool timeout errors were observed (0 pool timeouts measured across all stages in both profiles).
  - High-concurrency latency degradation is driven by `product-service` event-loop CPU saturation under single-worker execution (`--workers 1`), not database connection limits.

---

### Superseded Exploratory Runs: `50M/` and `1M_friend_machine/`
- **Status**: **Superseded / Historical Exploratory Runs**
- **Context**:
  - `50M/` and `1M_friend_machine/` reflect early exploratory benchmarking conducted under non-isolated execution conditions (without inter-stage service restarts and with confounded container recreation).
  - Earlier hypotheses attributing degradation to database connection pool exhaustion or HTTP 503 gateway drops were **not reproduced** in the clean, isolated reference run (`50M_final/`).
  - These directories are preserved for historical auditability but are superseded by `50M_final/`.
