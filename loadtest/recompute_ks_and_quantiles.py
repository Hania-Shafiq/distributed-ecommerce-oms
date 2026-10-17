"""
loadtest/recompute_ks_and_quantiles.py
─────────────────────────────────────────────────────────────────────────────
Recomputes Kolmogorov-Smirnov D statistic and quantile comparison:
- Queries orders_db for the empirical per-user order distribution (GROUP BY user_id).
- Models the exact theoretical pipeline from datagen/generate_orders.py:
    1. X ~ Lognormal(mu=1.0, sigma=1.7)
    2. Clipped to [1.0, 2000.0]
    3. Scaled by S = 3.4454 (target mean 40 / clipped mean 11.6082)
    4. Discretized: K = min(2000, max(1, round(S * X_clipped)))
- Computes D = max |F_emp(k) - F_theo(k)|
- Computes empirical vs theoretical quantiles (median, p90, p99, mean, top-1% share)
─────────────────────────────────────────────────────────────────────────────
"""

import math
import numpy as np
import psycopg2
import psycopg2.extras
# Standard normal CDF using standard math.erf
def normal_cdf(z):
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))

DB_CONFIG = {
    "host": "localhost",
    "port": 5435,
    "dbname": "orders_db",
    "user": "postgres",
    "password": "postgres"
}

def get_empirical_distribution():
    print("[1/4] Querying orders_db for per-user order counts...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    cur.execute("""
        SELECT cnt, count(*) as num_users
        FROM (
            SELECT count(*) AS cnt
            FROM orders
            GROUP BY user_id
        ) t
        GROUP BY cnt
        ORDER BY cnt;
    """)
    rows = cur.fetchall()
    conn.close()

    counts = np.array([r[0] for r in rows], dtype=np.int64)
    freqs  = np.array([r[1] for r in rows], dtype=np.int64)
    total_users = freqs.sum()
    total_orders = (counts * freqs).sum()
    print(f"  Total users with orders: {total_users:,}")
    print(f"  Total orders:            {total_orders:,}")
    print(f"  Distinct order counts:   {len(counts)}")
    return counts, freqs, total_users, total_orders


def compute_empirical_quantiles(counts, freqs, total_users, total_orders):
    cum_users = np.cumsum(freqs)
    cum_pct = cum_users / total_users

    def get_pct(p):
        idx = np.searchsorted(cum_pct, p)
        return counts[min(idx, len(counts)-1)]

    mean_val = total_orders / total_users
    median_val = get_pct(0.50)
    p90_val = get_pct(0.90)
    p99_val = get_pct(0.99)
    max_val = counts[-1]

    # Top 1% share: users with highest counts
    top_1pct_users = int(math.ceil(total_users * 0.01))
    # Traverse from top
    orders_top = 0
    users_acc = 0
    for c, f in zip(counts[::-1], freqs[::-1]):
        take = min(f, top_1pct_users - users_acc)
        orders_top += take * c
        users_acc += take
        if users_acc >= top_1pct_users:
            break
    top_1pct_share = (orders_top / total_orders) * 100.0

    return {
        "mean": mean_val,
        "median": median_val,
        "p90": p90_val,
        "p99": p99_val,
        "max": max_val,
        "top_1pct_share": top_1pct_share,
    }


def compute_theoretical_pipeline(mu=1.0, sigma=1.7, cap=2000, S=3.4454):
    """
    Theoretical CDF of K = min(cap, max(1, round(S * min(cap, max(1, X)))))
    where ln(X) ~ Normal(mu, sigma).
    """
    print(f"\n[2/4] Deriving theoretical CDF of scaled truncated lognormal (mu={mu}, sigma={sigma}, S={S}, cap={cap})...")

    # For any integer k (1 <= k < cap):
    # K <= k  iff  round(S * X_clip) <= k
    #         iff  S * X_clip < k + 0.5
    #         iff  X_clip < (k + 0.5) / S
    # For X_clip in [1, cap]:
    # if (k + 0.5) / S < 1: probability is 0 (all mass >= 1)
    # else: P(X <= (k + 0.5) / S) = norm.cdf((ln((k+0.5)/S) - mu) / sigma)

    k_vals = np.arange(1, cap + 1)
    F_theo = np.zeros(len(k_vals))

    for i, k in enumerate(k_vals):
        if k == cap:
            F_theo[i] = 1.0
        else:
            cutoff = (k + 0.5) / S
            if cutoff <= 1.0:
                # since X_clip >= 1.0, round(S * 1.0) = round(3.4454) = 3
                # So K is never < 3 for unadjusted samples!
                F_theo[i] = 0.0
            else:
                z = (math.log(cutoff) - mu) / sigma
                F_theo[i] = normal_cdf(z)

    # Theoretical quantiles from continuous/discretized F_theo
    def get_theo_q(q):
        idx = np.searchsorted(F_theo, q)
        return k_vals[min(idx, len(k_vals)-1)]

    # Theoretical mean by numerical expectation: E[K] = sum_{k=0}^{cap-1} (1 - F(k))
    theo_mean = np.sum(1.0 - F_theo[:-1]) + 1.0

    # Theoretical top 1% share: integral of tail / mean
    # Top 1% threshold is get_theo_q(0.99)
    # Tail sum
    p_k = np.diff(np.insert(F_theo, 0, 0.0))
    # top 1% mass:
    top_1pct_mass = 0.01
    # Integrate x * p(x) from the right:
    acc_mass = 0.0
    acc_orders = 0.0
    for k, p in zip(k_vals[::-1], p_k[::-1]):
        take = min(p, top_1pct_mass - acc_mass)
        acc_orders += take * k
        acc_mass += take
        if acc_mass >= top_1pct_mass:
            break
    theo_top_1pct_share = (acc_orders / theo_mean) * 100.0

    theo_quantiles = {
        "mean": theo_mean,
        "median": get_theo_q(0.50),
        "p90": get_theo_q(0.90),
        "p99": get_theo_q(0.99),
        "max": cap,
        "top_1pct_share": theo_top_1pct_share,
    }

    return k_vals, F_theo, theo_quantiles


def main():
    counts, freqs, total_users, total_orders = get_empirical_distribution()
    emp_q = compute_empirical_quantiles(counts, freqs, total_users, total_orders)

    k_vals, F_theo, theo_q = compute_theoretical_pipeline()

    # Compute empirical CDF on k_vals (1 to 2000)
    print("\n[3/4] Computing Kolmogorov-Smirnov statistic D...")
    counts_map = dict(zip(counts, freqs))
    F_emp = np.zeros(len(k_vals))
    cum = 0
    for i, k in enumerate(k_vals):
        cum += counts_map.get(k, 0)
        F_emp[i] = cum / total_users

    # KS statistic D = max |F_emp - F_theo|
    diff = np.abs(F_emp - F_theo)
    D = np.max(diff)
    max_diff_k = k_vals[np.argmax(diff)]

    print(f"\n" + "=" * 78)
    print(f"  ORDERS-PER-USER DISTRIBUTION CHECK (SCALED & CLIPPED LOGNORMAL)")
    print("=" * 78)
    print(f"  KS Statistic D:               {D:.6f} (max divergence at k={max_diff_k})")
    print(f"  Previous unscaled D:          0.287241 (computed against raw unscaled model)")
    print(f"  P-value note:                 With N={total_users:,} samples, p-value converges")
    print(f"                                to 0.0 (any infinitesimal empirical discretization")
    print(f"                                or residual balance makes p=0). Earlier p=0.99999")
    print(f"                                cannot be reproduced mathematically.")

    print("\n" + "=" * 78)
    print("  MEASURED VS. THEORETICAL QUANTILES TABLE")
    print("=" * 78)
    print(f"  {'Metric':<25} {'Measured (50M DB)':>18} {'Theoretical Model':>18} {'Delta':>12}")
    print("  " + "-" * 75)
    print(f"  {'Mean (orders/user)':<25} {emp_q['mean']:>18.2f} {theo_q['mean']:>18.2f} {emp_q['mean'] - theo_q['mean']:>+12.2f}")
    print(f"  {'Median (p50)':<25} {emp_q['median']:>18.1f} {theo_q['median']:>18.1f} {emp_q['median'] - theo_q['median']:>+12.1f}")
    print(f"  {'90th Percentile (p90)':<25} {emp_q['p90']:>18.1f} {theo_q['p90']:>18.1f} {emp_q['p90'] - theo_q['p90']:>+12.1f}")
    print(f"  {'99th Percentile (p99)':<25} {emp_q['p99']:>18.1f} {theo_q['p99']:>18.1f} {emp_q['p99'] - theo_q['p99']:>+12.1f}")
    print(f"  {'Maximum (cap)':<25} {emp_q['max']:>18} {theo_q['max']:>18} {emp_q['max'] - theo_q['max']:>+12}")
    print(f"  {'Top 1% User Share':<25} {emp_q['top_1pct_share']:>17.2f}% {theo_q['top_1pct_share']:>17.2f}% {emp_q['top_1pct_share'] - theo_q['top_1pct_share']:>+11.2f}%")

    return {
        "D": D,
        "max_diff_k": int(max_diff_k),
        "emp_q": emp_q,
        "theo_q": theo_q,
    }

if __name__ == "__main__":
    main()
