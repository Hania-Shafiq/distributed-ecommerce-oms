import numpy as np
import scipy.stats as stats
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path

def sample_truncated_lognormal_orders(n_orders: int, u_count: int, mu: float = 1.0, sigma: float = 1.7, cap: int = 2000):
    np.random.seed(42)
    raw = np.random.lognormal(mu, sigma, size=u_count)
    clipped = np.clip(raw, 1.0, float(cap))
    proportions = clipped / clipped.sum()
    counts = np.maximum(1, np.round(proportions * n_orders).astype(np.int64))
    counts = np.minimum(counts, cap)

    diff = n_orders - counts.sum()
    if diff > 0:
        eligible = np.where(counts < cap)[0]
        weights = counts[eligible].astype(np.float64)
        weights /= weights.sum()
        add_counts = np.round(weights * diff).astype(np.int64)
        counts[eligible] += add_counts
        counts = np.minimum(counts, cap)
        diff2 = n_orders - counts.sum()
        if diff2 > 0:
            eligible2 = np.where(counts < cap)[0]
            counts[eligible2[:diff2]] += 1
        elif diff2 < 0:
            eligible2 = np.where(counts > 1)[0]
            counts[eligible2[:-diff2]] -= 1
    elif diff < 0:
        eligible = np.where(counts > 1)[0]
        counts[eligible[:-diff]] -= 1

    return counts

def main():
    n_orders = 1_000_000
    u_count = 25_000
    cap = 2000
    mu = 1.0
    sigma = 1.7

    print("="*70)
    print("VALIDATION: TRUNCATED LOGNORMAL ORDERS-PER-USER MODEL")
    print(f"N = {n_orders:,} orders, Users = {u_count:,}, Cap = {cap}")
    print("="*70)

    counts = sample_truncated_lognormal_orders(n_orders, u_count, mu, sigma, cap)

    mean_val = float(counts.mean())
    median_val = float(np.median(counts))
    p90_val = float(np.percentile(counts, 90))
    p99_val = float(np.percentile(counts, 99))
    max_val = int(counts.max())

    sorted_counts = np.sort(counts)[::-1]
    top_1pct_n = max(1, int(u_count * 0.01))
    top_1pct_orders = sorted_counts[:top_1pct_n].sum()
    top_1pct_share = (top_1pct_orders / n_orders) * 100.0

    print(f"Total Orders:          {counts.sum():,}")
    print(f"Mean Orders / User:    {mean_val:.2f} (Target ~40.0)")
    print(f"Median Orders / User:  {median_val:.1f} (Small median)")
    print(f"90th Percentile (p90): {p90_val:.1f}")
    print(f"99th Percentile (p99): {p99_val:.1f}")
    print(f"Maximum Orders / User: {max_val:,} (Hard cap <= {cap})")
    print(f"Top 1% ({top_1pct_n:,} users) Share: {top_1pct_share:.2f}% (Must be <= 50%)")

    # Verification gates
    assert max_val <= cap, f"Max {max_val} exceeds cap {cap}"
    assert top_1pct_share <= 50.0, f"Top 1% share {top_1pct_share:.2f}% exceeds 50%"
    assert abs(mean_val - 40.0) < 0.1, f"Mean {mean_val} deviates from 40.0"
    print("\n[VERIFICATION GATE]: ALL STATISTICAL CRITERIA PASSED.")

    # Kolmogorov-Smirnov Test
    # Compare empirical data against theoretical truncated lognormal CDF
    def theoretical_truncated_cdf(x):
        # Truncated lognormal CDF between 1 and cap
        raw_cdf = stats.lognorm.cdf(x, s=sigma, scale=np.exp(mu))
        cdf_1 = stats.lognorm.cdf(1.0, s=sigma, scale=np.exp(mu))
        cdf_cap = stats.lognorm.cdf(float(cap), s=sigma, scale=np.exp(mu))
        res = (raw_cdf - cdf_1) / (cdf_cap - cdf_1)
        return np.clip(res, 0.0, 1.0)

    # Subsample for KS test if dataset is very large, or test on sample
    ks_sample = np.random.choice(counts, size=min(len(counts), 10000), replace=False)
    ks_stat, ks_pvalue = stats.kstest(ks_sample, theoretical_truncated_cdf)
    print(f"\nKolmogorov-Smirnov Test (Truncated Lognormal):")
    print(f"  KS Statistic (D): {ks_stat:.4f}")
    print(f"  p-value:          {ks_pvalue:.4e}")

    # Plotting
    out_dir = Path("data/fit_report")
    out_dir.mkdir(parents=True, exist_ok=True)
    plot_path = out_dir / "06_orders_per_user_truncated_lognormal.png"

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))

    # Subplot 1: Distribution & Tail
    ax1.hist(counts, bins=80, density=True, alpha=0.7, color="#1f77b4", edgecolor="black", linewidth=0.5, label="Empirical Discrete Orders")
    x_grid = np.linspace(1, cap, 500)
    pdf_eval = stats.lognorm.pdf(x_grid, s=sigma, scale=np.exp(mu))
    norm_const = stats.lognorm.cdf(cap, s=sigma, scale=np.exp(mu)) - stats.lognorm.cdf(1, s=sigma, scale=np.exp(mu))
    ax1.plot(x_grid, pdf_eval / norm_const, "r-", linewidth=2, label="Truncated Lognormal Model")
    ax1.axvline(cap, color="darkred", linestyle="--", linewidth=1.5, label=f"Hard Cap ({cap})")
    ax1.set_yscale("log")
    ax1.set_xlabel("Orders per User")
    ax1.set_ylabel("Probability Density (log scale)")
    ax1.set_title("Orders per User Distribution (Log Scale)")
    ax1.legend(loc="upper right")
    ax1.grid(True, linestyle=":", alpha=0.6)

    # Subplot 2: Cumulative Distribution Function (CDF)
    sorted_s = np.sort(ks_sample)
    y_emp = np.arange(1, len(sorted_s) + 1) / len(sorted_s)
    ax2.plot(sorted_s, y_emp, label="Empirical CDF", color="#2ca02c", linewidth=2)
    ax2.plot(sorted_s, theoretical_truncated_cdf(sorted_s), "--", label="Model CDF", color="#d62728", linewidth=1.8)
    ax2.set_xscale("log")
    ax2.set_xlabel("Orders per User (log scale)")
    ax2.set_ylabel("Cumulative Probability")
    ax2.set_title(f"Goodness-of-Fit (KS D={ks_stat:.3f}, p={ks_pvalue:.2e})")
    ax2.legend(loc="lower right")
    ax2.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plt.savefig(plot_path, dpi=200)
    plt.close()
    print(f"\n[OK] Validation plot saved to: {plot_path}")

if __name__ == "__main__":
    main()
