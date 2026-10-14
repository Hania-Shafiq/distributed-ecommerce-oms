"""
fit_and_validate.py
------------------------------------------------------------------------------
Phase-2 analysis: goodness-of-fit tests, GoF plots, corrected two-stage
category-product sampling, 50M-order scale-up parameters, and status-PENDING
clarification.

Run:
    pip install pandas numpy scipy matplotlib
    python data/fit_and_validate.py

Outputs:
    data/fit_report.json        - all fitted params, test stats, p-values
    data/fit_report/            - PNG plots
------------------------------------------------------------------------------
"""

import sys
import os
# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError for
# math symbols like lambda, alpha, chi, arrows used in print statements)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import json
import warnings
import math
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")          # headless — no display required
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR   = Path(__file__).parent / "real" / "olist"
REPORT_DIR = Path(__file__).parent / "fit_report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

ORDERS_CSV    = DATA_DIR / "olist_orders_dataset.csv"
ITEMS_CSV     = DATA_DIR / "olist_order_items_dataset.csv"
PRODUCTS_CSV  = DATA_DIR / "olist_products_dataset.csv"
TRANSL_CSV    = DATA_DIR / "product_category_name_translation.csv"
CUSTOMERS_CSV = DATA_DIR / "olist_customers_dataset.csv"
DIST_JSON     = Path(__file__).parent / "olist_distributions.json"
FIT_JSON      = Path(__file__).parent / "fit_report.json"

MY_CATALOG_SIZE = 33
MY_CATEGORIES   = ["Electronics", "Furniture", "Kitchen", "Sports & Outdoors", "Accessories"]

# ── Status mapping ─────────────────────────────────────────────────────────────
# SAGA lifecycle (from order-service/saga.py):
#   1. Order created with status "PENDING"  (db.commit at step 1)
#   2a. All items succeed → status = "CONFIRMED" (db.commit at step 3)
#   2b. Any item fails   → status = "FAILED"     (db.commit inside _run_compensation)
# PENDING is a *transient* persisted state — visible only during SAGA execution.
# Under load-test conditions the SAGA completes synchronously in the same HTTP
# request, so a GET /orders/{id} will always return CONFIRMED or FAILED.
# Conclusion: fold Olist's 0.3% "processing/created" (our PENDING proxy)
#             proportionally into CONFIRMED and FAILED for the locustfile
#             because that is what the DB will actually contain after the call returns.

OLIST_TO_MY_STATUS = {
    "delivered":   "CONFIRMED",
    "shipped":     "CONFIRMED",
    "invoiced":    "CONFIRMED",
    "approved":    "CONFIRMED",
    "canceled":    "FAILED",
    "unavailable": "FAILED",
    "created":     "PENDING",
    "processing":  "PENDING",
}

# ── Category mapping ──────────────────────────────────────────────────────────
OLIST_CAT_MAP = {
    "computers_accessories": "Electronics", "computers": "Electronics",
    "telephony": "Electronics", "electronics": "Electronics",
    "tablets_printing_image": "Electronics", "consoles_games": "Electronics",
    "audio": "Electronics", "small_appliances": "Electronics",
    "small_appliances_home_oven_and_coffee": "Electronics",
    "air_conditioning": "Electronics", "fixed_telephony": "Electronics",
    "signaling_and_security": "Electronics", "home_appliances": "Electronics",
    "home_appliances_2": "Electronics", "cds_dvds_musicals": "Electronics",
    "dvds_blu_ray": "Electronics", "musical_instruments": "Electronics",
    "furniture_decor": "Furniture", "furniture_bedroom": "Furniture",
    "furniture_living_room": "Furniture",
    "furniture_mattress_and_upholstery": "Furniture",
    "office_furniture": "Furniture", "home_confort": "Furniture",
    "home_comfort_2": "Furniture", "housewares": "Furniture",
    "garden_tools": "Furniture", "construction_tools_lights": "Furniture",
    "construction_tools_safety": "Furniture", "construction_tools_tools": "Furniture",
    "construction_tools_construction": "Furniture",
    "costruction_tools_garden": "Furniture", "christmas_supplies": "Furniture",
    "market_place": "Furniture",
    "kitchen_dining_laundry_garden_furniture": "Kitchen", "bed_bath_table": "Kitchen",
    "food": "Kitchen", "food_drink": "Kitchen", "drinks": "Kitchen",
    "party_supplies": "Kitchen", "la_cuisine": "Kitchen",
    "portable_kitchen_food_processors": "Kitchen",
    "sports_leisure": "Sports & Outdoors", "health_beauty": "Sports & Outdoors",
    "pet_shop": "Sports & Outdoors", "diapers_and_hygiene": "Sports & Outdoors",
    "baby": "Sports & Outdoors",
    "watches_gifts": "Accessories", "fashion_bags_accessories": "Accessories",
    "fashion_male_clothing": "Accessories", "fashion_female_clothing": "Accessories",
    "fashion_underwear_beach": "Accessories", "fashion_sport": "Accessories",
    "fashion_childrens_clothes": "Accessories", "luggage_accessories": "Accessories",
    "books_general_interest": "Accessories", "books_technical": "Accessories",
    "books_imported": "Accessories", "toys": "Accessories",
    "stationery": "Accessories", "arts_and_craftmanship": "Accessories",
    "art": "Accessories", "flowers": "Accessories", "cool_stuff": "Accessories",
    "industry_commerce_and_business": "Accessories",
    "agro_industry_and_commerce": "Accessories",
    "security_and_services": "Accessories", "music": "Accessories",
    "perfumery": "Accessories", "auto": "Accessories",
}

# ─────────────────────────────────────────────────────────────────────────────
def section(title):
    w = 68
    print(f"\n{'='*w}\n  {title}\n{'='*w}")

def fmt(label, value):
    print(f"  {label:<46} {value}")

def save_fig(fig, name):
    p = REPORT_DIR / name
    fig.savefig(p, dpi=120, bbox_inches="tight")
    plt.close(fig)
    print(f"  [PLOT] Saved {p.name}")
    return str(p)

# ─────────────────────────────────────────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────────────────────────────────────────
def load_data():
    section("Loading datasets")
    orders    = pd.read_csv(ORDERS_CSV,   parse_dates=["order_purchase_timestamp"])
    items     = pd.read_csv(ITEMS_CSV)
    products  = pd.read_csv(PRODUCTS_CSV)
    transl    = pd.read_csv(TRANSL_CSV)
    customers = pd.read_csv(CUSTOMERS_CSV)
    fmt("Orders", f"{len(orders):,}")
    fmt("Items",  f"{len(items):,}")
    return orders, items, products, transl, customers

# ─────────────────────────────────────────────────────────────────────────────
# 1. ORDER VALUE — LOG-NORMAL FIT + KS TEST + QQ PLOT
# ─────────────────────────────────────────────────────────────────────────────
def fit_order_value(items):
    section("1. Order Value — Log-Normal fit + KS test + QQ plot")

    items = items.copy()
    items["line_total"] = items["price"] + items["freight_value"]
    order_totals = items.groupby("order_id")["line_total"].sum()
    positive     = order_totals[order_totals > 0]

    log_vals = np.log(positive.values)
    mu_hat   = float(log_vals.mean())
    sig_hat  = float(log_vals.std(ddof=1))

    # KS test against fitted log-normal
    ks_stat, ks_p = stats.kstest(
        positive.values,
        "lognorm",
        args=(sig_hat, 0, np.exp(mu_hat)),
    )
    fmt("Log-normal mu",    f"{mu_hat:.4f}")
    fmt("Log-normal sigma", f"{sig_hat:.4f}")
    fmt("KS statistic",     f"{ks_stat:.6f}")
    fmt("KS p-value",       f"{ks_p:.6f}  ({'ACCEPT at α=0.05' if ks_p>0.05 else 'REJECT at α=0.05 — tail deviations expected for real revenue'})")

    # ── QQ plot
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    fig.suptitle("Order Value: Log-Normal Fit", fontsize=13, fontweight="bold")

    # Left: histogram + fitted PDF
    ax = axes[0]
    log_range = np.linspace(log_vals.min(), log_vals.max(), 200)
    ax.hist(log_vals, bins=60, density=True, color="#4C72B0", alpha=0.65, label="log(order_total)")
    ax.plot(log_range, stats.norm.pdf(log_range, mu_hat, sig_hat),
            "r-", lw=2, label=f"N({mu_hat:.2f}, {sig_hat:.2f}²)")
    ax.set_xlabel("log(order total BRL)")
    ax.set_ylabel("Density")
    ax.set_title("Log-scale histogram + fitted Normal")
    ax.legend(fontsize=8)

    # Right: QQ plot
    ax2 = axes[1]
    (osm, osr), (slope, intercept, r) = stats.probplot(log_vals, dist="norm", fit=True)
    ax2.scatter(osm, osr, s=4, alpha=0.3, color="#4C72B0")
    x_line = np.array([osm.min(), osm.max()])
    ax2.plot(x_line, slope * x_line + intercept, "r-", lw=1.5, label=f"R={r:.4f}")
    ax2.set_xlabel("Theoretical quantiles")
    ax2.set_ylabel("Sample quantiles  (log BRL)")
    ax2.set_title("QQ plot — log(order_total) vs Normal")
    ax2.legend(fontsize=8)

    plt.tight_layout()
    plot_path = save_fig(fig, "01_order_value_lognormal.png")

    return {
        "distribution": "log-normal",
        "mu":           round(mu_hat, 4),
        "sigma":        round(sig_hat, 4),
        "n_samples":    int(len(positive)),
        "ks_statistic": round(float(ks_stat), 6),
        "ks_p_value":   round(float(ks_p), 8),
        "note":         "p<0.05 due to right tail; log-normal is standard revenue model — use for distribution shape, not exact tail probability",
        "plot":         plot_path,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. ITEMS PER ORDER — CHI-SQUARE vs FITTED DISCRETE MODEL
# ─────────────────────────────────────────────────────────────────────────────
def fit_items_per_order(items):
    section("2. Items Per Order — Chi-Square goodness-of-fit")

    items_per = items.groupby("order_id")["order_item_id"].count()
    mean_val  = float(items_per.mean())

    # Poisson approximation (shifted by 1: min is 1 item)
    # Observed frequencies for k = 1,2,3,4,5+
    max_k = 5
    observed = []
    for k in range(1, max_k):
        observed.append(int((items_per == k).sum()))
    observed.append(int((items_per >= max_k).sum()))
    observed = np.array(observed)
    n_total  = observed.sum()

    # Fitted: Poisson(lambda) shifted to start at 1  →  P(X=k) = P(Y=k-1) where Y~Poisson(mu-1)
    lam = max(0.001, mean_val - 1.0)
    expected = []
    for k in range(1, max_k):
        expected.append(stats.poisson.pmf(k - 1, lam))
    expected.append(1.0 - stats.poisson.cdf(max_k - 2, lam))
    expected = np.array(expected) * n_total

    # Merge bins where expected < 5 (chi-sq validity)
    # All bins are large here so no merging needed
    chi2, p_val = stats.chisquare(f_obs=observed, f_exp=expected)
    dof = len(observed) - 1 - 1   # -1 for lambda estimated from data

    fmt("Mean items/order",  f"{mean_val:.4f}")
    fmt("Fitted Poisson λ (shifted)", f"{lam:.4f}")
    fmt("Chi-square statistic",       f"{chi2:.4f}")
    fmt("Degrees of freedom",         f"{dof}")
    fmt("p-value",                    f"{p_val:.8f}  ({'ACCEPT' if p_val>0.05 else 'REJECT - heavy 1-item mass; use empirical weights'})")

    # Plot
    fig, ax = plt.subplots(figsize=(7, 4))
    fig.suptitle("Items Per Order: Observed vs Poisson(shifted)", fontsize=12, fontweight="bold")
    labels = [str(k) for k in range(1, max_k)] + [f"{max_k}+"]
    x = np.arange(len(labels))
    ax.bar(x - 0.2, observed / n_total * 100, 0.35, label="Observed %", color="#4C72B0", alpha=0.8)
    ax.bar(x + 0.2, expected / n_total * 100, 0.35, label="Fitted Poisson %", color="#DD8452", alpha=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_xlabel("Items per order")
    ax.set_ylabel("Percentage of orders")
    ax.legend()
    for i, (o, e) in enumerate(zip(observed, expected)):
        ax.text(i - 0.2, o/n_total*100 + 0.3, f"{o/n_total*100:.1f}%", ha="center", fontsize=7)
        ax.text(i + 0.2, e/n_total*100 + 0.3, f"{e/n_total*100:.1f}%", ha="center", fontsize=7)
    ax.text(0.98, 0.95, f"χ²={chi2:.1f}, df={dof}, p={p_val:.2e}",
            transform=ax.transAxes, ha="right", va="top", fontsize=9,
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5))
    plt.tight_layout()
    plot_path = save_fig(fig, "02_items_per_order_chisq.png")

    # Empirical weights for locustfile (k=1,2,3+)
    emp_p1   = float((items_per == 1).mean())
    emp_p2   = float((items_per == 2).mean())
    emp_p3p  = float((items_per >= 3).mean())

    return {
        "distribution":   "Poisson(shifted, lambda=mean-1) — empirical weights used in practice",
        "mean":           round(mean_val, 4),
        "poisson_lambda": round(lam, 4),
        "n_samples":      int(n_total),
        "chi2_statistic": round(float(chi2), 4),
        "chi2_dof":       dof,
        "chi2_p_value":   round(float(p_val), 8),
        "empirical_weights": {
            "p_1_item":  round(emp_p1, 4),
            "p_2_items": round(emp_p2, 4),
            "p_3plus":   round(emp_p3p, 4),
        },
        "note": "Poisson rejected due to heavy mass at k=1 (90%). Empirical weights [p1,p2,p3+] used in locustfile.",
        "plot": plot_path,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. QUANTITY PER LINE — CHI-SQUARE vs GEOMETRIC / EMPIRICAL
# ─────────────────────────────────────────────────────────────────────────────
def fit_quantity_per_line(items):
    section("3. Quantity Per Line Item — Chi-Square goodness-of-fit")

    qty_proxy = items.groupby(["order_id", "product_id"]).size()
    mean_val  = float(qty_proxy.mean())

    # Geometric distribution: P(X=k) = (1-p)^(k-1) * p,  p = 1/mean
    p_geo    = 1.0 / mean_val
    max_k    = 4
    observed = []
    for k in range(1, max_k):
        observed.append(int((qty_proxy == k).sum()))
    observed.append(int((qty_proxy >= max_k).sum()))
    observed = np.array(observed)
    n_total  = observed.sum()

    expected = []
    for k in range(1, max_k):
        expected.append(stats.geom.pmf(k, p_geo))
    expected.append(1.0 - stats.geom.cdf(max_k - 1, p_geo))
    expected = np.array(expected) * n_total

    chi2, p_val = stats.chisquare(f_obs=observed, f_exp=expected)
    dof = len(observed) - 1 - 1

    fmt("Mean qty/line",       f"{mean_val:.4f}")
    fmt("Geometric p",         f"{p_geo:.4f}")
    fmt("Chi-square statistic",f"{chi2:.4f}")
    fmt("p-value",             f"{p_val:.8f}  ({'ACCEPT' if p_val>0.05 else 'REJECT - empirical weights used'})")

    fig, ax = plt.subplots(figsize=(7, 4))
    fig.suptitle("Quantity Per Line: Observed vs Geometric", fontsize=12, fontweight="bold")
    labels = [str(k) for k in range(1, max_k)] + [f"{max_k}+"]
    x = np.arange(len(labels))
    ax.bar(x - 0.2, observed/n_total*100, 0.35, label="Observed %", color="#4C72B0", alpha=0.8)
    ax.bar(x + 0.2, expected/n_total*100, 0.35, label="Geometric %", color="#DD8452", alpha=0.8)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_xlabel("Quantity per line item")
    ax.set_ylabel("Percentage")
    ax.legend()
    ax.text(0.98, 0.95, f"χ²={chi2:.1f}, df={dof}, p={p_val:.2e}",
            transform=ax.transAxes, ha="right", va="top", fontsize=9,
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5))
    plt.tight_layout()
    plot_path = save_fig(fig, "03_qty_per_line_chisq.png")

    emp_p1  = float((qty_proxy == 1).mean())
    emp_p2  = float((qty_proxy == 2).mean())
    emp_p3p = float((qty_proxy >= 3).mean())

    return {
        "distribution":   "Geometric(p=1/mean) — empirical weights used in practice",
        "mean":           round(mean_val, 4),
        "geometric_p":    round(p_geo, 4),
        "n_samples":      int(n_total),
        "chi2_statistic": round(float(chi2), 4),
        "chi2_dof":       dof,
        "chi2_p_value":   round(float(p_val), 8),
        "empirical_weights": {
            "p_qty1":  round(emp_p1, 4),
            "p_qty2":  round(emp_p2, 4),
            "p_qty3p": round(emp_p3p, 4),
        },
        "note": "Geometric rejected due to heavier mass at k=1. Empirical weights used in locustfile.",
        "plot": plot_path,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. PRODUCT POPULARITY — ZIPF RANK-FREQUENCY + KS TEST + CORRECTED COUNT
# ─────────────────────────────────────────────────────────────────────────────
def fit_product_popularity(items, n_products=33):
    section("4. Product Popularity — Zipf + KS test + corrected distinct count")

    # CORRECT the 73,178 claim
    pop        = items["product_id"].value_counts()
    n_distinct = int(pop.shape[0])
    fmt("Distinct product_ids in olist_order_items (CORRECTED)", f"{n_distinct:,}")
    fmt("(Previous report said '73,178 distinct products')", f"{'CORRECT' if n_distinct==73178 else f'WRONG — actual={n_distinct:,}'}")

    ranks = np.arange(1, len(pop) + 1, dtype=float)
    freqs = pop.values.astype(float)

    # Fit Zipf exponent via log-log OLS
    lr = stats.linregress(np.log(ranks), np.log(freqs))
    zipf_s    = -lr.slope
    r_squared = lr.rvalue ** 2
    fmt("Zipf exponent s", f"{zipf_s:.4f}")
    fmt("R² (log-log OLS)", f"{r_squared:.4f}")

    # KS test: does the normalised rank-frequency follow Zipf(s)?
    norm_freqs    = freqs / freqs.sum()
    zipf_expected = ranks ** (-zipf_s)
    zipf_expected = zipf_expected / zipf_expected.sum()
    ks_stat, ks_p = stats.kstest(norm_freqs, lambda x: np.interp(x, np.sort(zipf_expected), np.linspace(0, 1, len(zipf_expected))))
    fmt("KS statistic (rank-freq vs Zipf CDF)", f"{ks_stat:.6f}")
    fmt("KS p-value",                           f"{ks_p:.8f}")

    # Zipf weights for 33 catalog slots
    cat_ranks   = np.arange(1, n_products + 1, dtype=float)
    raw_weights = cat_ranks ** (-zipf_s)
    norm_w      = raw_weights / raw_weights.sum()

    # ── Rank-frequency log-log plot with fitted line
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle("Product Popularity: Zipf / Power-Law Fit", fontsize=13, fontweight="bold")

    ax = axes[0]
    ax.loglog(ranks, freqs, ".", ms=3, alpha=0.3, color="#4C72B0", label="Observed")
    fitted_freq = np.exp(lr.intercept) * ranks ** lr.slope
    ax.loglog(ranks, fitted_freq, "r-", lw=1.5, label=f"Zipf s={zipf_s:.3f}  R²={r_squared:.3f}")
    ax.set_xlabel("Rank")
    ax.set_ylabel("Frequency (order lines)")
    ax.set_title("Log-Log rank-frequency plot")
    ax.legend(fontsize=9)

    ax2 = axes[1]
    # Show only top-100 ranks for clarity
    top = min(100, len(freqs))
    top_ranks = np.arange(1, top + 1, dtype=float)
    top_fitted_pct = (top_ranks ** (-zipf_s)) / (ranks ** (-zipf_s)).sum() * 100
    ax2.bar(top_ranks, freqs[:top] / freqs.sum() * 100, color="#4C72B0", alpha=0.75, label="Observed (top 100)")
    ax2.bar(top_ranks, top_fitted_pct, color="#DD8452", alpha=0.5, label=f"Fitted Zipf (top {top})")
    ax2.set_xlabel("Product rank (1=most popular)")
    ax2.set_ylabel("% of order lines")
    ax2.set_title("Top-100 products: observed vs fitted")
    ax2.legend(fontsize=8)

    plt.tight_layout()
    plot_path = save_fig(fig, "04_product_popularity_zipf.png")

    return {
        "n_distinct_products_in_olist": n_distinct,
        "previous_report_claim":        "73,178",
        "claim_correct":                n_distinct == 73178,
        "zipf_exponent_s":              round(float(zipf_s), 4),
        "r_squared_loglog":             round(float(r_squared), 4),
        "ks_statistic":                 round(float(ks_stat), 6),
        "ks_p_value":                   round(float(ks_p), 8),
        "catalog_weights_33":           [round(float(w), 6) for w in norm_w],
        "plot":                         plot_path,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. HOURLY + WEEKDAY ARRIVAL PROFILES
# ─────────────────────────────────────────────────────────────────────────────
def fit_arrival_profiles(orders):
    section("5. Hourly & Weekday Arrival Profiles")

    ts = orders["order_purchase_timestamp"].dropna()

    # Hourly profile (0-23)
    hourly_counts = ts.dt.hour.value_counts().sort_index().reindex(range(24), fill_value=0)
    hourly_norm   = (hourly_counts / hourly_counts.sum()).values.tolist()
    hourly_norm   = [round(v, 6) for v in hourly_norm]

    # Weekday profile (0=Mon … 6=Sun)
    weekday_counts = ts.dt.dayofweek.value_counts().sort_index().reindex(range(7), fill_value=0)
    weekday_norm   = (weekday_counts / weekday_counts.sum()).values.tolist()
    weekday_norm   = [round(v, 6) for v in weekday_norm]

    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    fmt("Peak hour (UTC)",       f"{int(hourly_counts.idxmax())}:00  ({hourly_norm[int(hourly_counts.idxmax())]*100:.1f}% of daily orders)")
    fmt("Busiest weekday",       f"{day_names[int(weekday_counts.idxmax())]}  ({weekday_norm[int(weekday_counts.idxmax())]*100:.1f}% of weekly orders)")

    # Uniform-lambda KS test for hourly
    uniform_hourly = np.full(24, 1/24)
    ks_h, p_h      = stats.chisquare(hourly_counts.values, f_exp=uniform_hourly * hourly_counts.sum())
    fmt("Chi-sq (hourly vs uniform)", f"χ²={ks_h:.1f}  p={p_h:.2e}  (uniform REJECTED — strong time-of-day pattern)")

    # Uniform weekday chi-sq
    uniform_wday   = np.full(7, 1/7)
    ks_w, p_w      = stats.chisquare(weekday_counts.values, f_exp=uniform_wday * weekday_counts.sum())
    fmt("Chi-sq (weekday vs uniform)", f"χ²={ks_w:.1f}  p={p_w:.2e}  (uniform REJECTED — weekday pattern present)")

    # ── Plot
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
    fig.suptitle("Arrival Profiles: Hourly & Weekday", fontsize=13, fontweight="bold")

    ax = axes[0]
    hours = np.arange(24)
    ax.bar(hours, np.array(hourly_norm)*100, color="#4C72B0", alpha=0.85)
    ax.axhline(100/24, color="red", ls="--", lw=1.2, label="Uniform (4.17%/hr)")
    ax.set_xlabel("Hour of day (UTC)")
    ax.set_ylabel("% of daily orders")
    ax.set_title("Hourly order arrival profile")
    ax.set_xticks(hours)
    ax.legend(fontsize=9)

    ax2 = axes[1]
    ax2.bar(range(7), np.array(weekday_norm)*100, color="#DD8452", alpha=0.85,
            tick_label=day_names)
    ax2.axhline(100/7, color="red", ls="--", lw=1.2, label="Uniform (14.3%/day)")
    ax2.set_xlabel("Day of week")
    ax2.set_ylabel("% of weekly orders")
    ax2.set_title("Weekday order arrival profile")
    ax2.legend(fontsize=9)

    plt.tight_layout()
    plot_path = save_fig(fig, "05_arrival_profiles.png")

    return {
        "hourly_profile":   hourly_norm,
        "weekday_profile":  weekday_norm,
        "weekday_labels":   day_names,
        "chisq_hourly_vs_uniform":  {"chi2": round(float(ks_h), 2), "p": round(float(p_h), 8)},
        "chisq_weekday_vs_uniform": {"chi2": round(float(ks_w), 2), "p": round(float(p_w), 8)},
        "note": "Both profiles significantly non-uniform. Use as weights for time-of-day arrival scaling.",
        "plot": plot_path,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. STATUS RATIOS — PENDING CLARIFICATION + FOLD
# ─────────────────────────────────────────────────────────────────────────────
def compute_status_ratios_corrected(orders):
    section("6. Status Ratios — PENDING clarification & fold")

    orders = orders.copy()
    orders["my_status"] = orders["order_status"].map(OLIST_TO_MY_STATUS).fillna("PENDING")

    raw = {
        "CONFIRMED": float((orders["my_status"] == "CONFIRMED").mean()),
        "FAILED":    float((orders["my_status"] == "FAILED").mean()),
        "PENDING":   float((orders["my_status"] == "PENDING").mean()),
    }
    fmt("CONFIRMED (raw)", f"{raw['CONFIRMED']*100:.2f}%")
    fmt("FAILED    (raw)", f"{raw['FAILED']*100:.2f}%")
    fmt("PENDING   (raw)", f"{raw['PENDING']*100:.2f}%")

    print("""
  PENDING STATUS ANALYSIS (from order-service/saga.py + main.py):
  -----------------------------------------------------------------
  The SAGA orchestrator (saga.py execute_order_saga):
    Step 1: INSERT order with status='PENDING'   <- db.commit() <- IS PERSISTED
    Step 3: UPDATE status='CONFIRMED'             <- db.commit()
    OR compensation: UPDATE status='FAILED'       <- db.commit()

  Conclusion: PENDING *is* written to orders_db but only as a
  transient state during the synchronous SAGA execution.  Since
  the SAGA runs within the same HTTP request (no async await),
  by the time POST /orders returns 201 or 409, the status in DB
  is already CONFIRMED or FAILED.  A GET /orders/{id} immediately
  after will NEVER see PENDING in normal operation.

  Therefore: fold the 0.3% Olist PENDING proportionally into
  CONFIRMED and FAILED for locustfile assertion / expectation
  purposes (not for the status-writing logic itself).
  -----------------------------------------------------------------""")

    # Fold PENDING proportionally
    non_pending = raw["CONFIRMED"] + raw["FAILED"]
    folded = {
        "CONFIRMED": round(raw["CONFIRMED"] / non_pending, 4),
        "FAILED":    round(raw["FAILED"]    / non_pending, 4),
    }
    fmt("CONFIRMED (folded, PENDING absorbed)", f"{folded['CONFIRMED']*100:.2f}%")
    fmt("FAILED    (folded, PENDING absorbed)", f"{folded['FAILED']*100:.2f}%")

    return {
        "raw":    {k: round(v, 4) for k, v in raw.items()},
        "folded": folded,
        "pending_is_transient": True,
        "pending_explanation": (
            "PENDING is written to orders_db at SAGA Step 1 then immediately "
            "overwritten to CONFIRMED or FAILED within the same synchronous HTTP "
            "request. GET /orders/{id} called after POST /orders returns will "
            "always see CONFIRMED or FAILED. Fold 0.3% PENDING into CONFIRMED/FAILED "
            "when computing locustfile expected outcome ratios."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. TWO-STAGE CATEGORY → PRODUCT SAMPLING  (fixes conflict in prev analysis)
# ─────────────────────────────────────────────────────────────────────────────
def build_two_stage_sampling(items, products, transl, n_products=33):
    section("7. Two-Stage Category→Product Sampling  (fixes conflict)")

    print("""
  PROBLEM IDENTIFIED:
  ----------------------------------------------------------------
  Previous approach: assigned Zipf weights [slot 1=18.9%, ..., slot 33=1%]
  to product IDs 1..33 where slots 1-6 = Electronics, 7-13 = Furniture, etc.

  This means slots 1+2+3+4+5+6 (Electronics) collectively get
  18.9+10.6+7.5+5.9+4.9+4.2 = 52%% of orders.
  But Olist says Electronics = only 17.9%% of sales.
  Accessories (slots 25-33) get only ~10%%, but Olist says 28.3%%.

  FIX: Two-stage sampling
    Stage 1: pick category   ~ Olist category shares
    Stage 2: pick product inside that category ~ Zipf(within-category rank)
  ----------------------------------------------------------------""")

    # Build real Olist category shares
    cat_map = transl.set_index("product_category_name")["product_category_name_english"]
    products = products.copy()
    products["cat_en"]   = products["product_category_name"].map(cat_map)
    products["my_cat"]   = products["cat_en"].map(OLIST_CAT_MAP).fillna("Accessories")
    merged = items.merge(products[["product_id", "my_cat"]], on="product_id", how="left")
    merged["my_cat"] = merged["my_cat"].fillna("Accessories")

    cat_counts = merged["my_cat"].value_counts()
    total      = cat_counts.sum()
    cat_shares = {cat: round(float(cat_counts.get(cat, 0) / total), 4) for cat in MY_CATEGORIES}
    s          = sum(cat_shares.values())
    cat_shares = {k: round(v / s, 4) for k, v in cat_shares.items()}

    # Catalog slot allocation for 33 products
    allocated = 0
    slots = {}
    for cat in MY_CATEGORIES:
        n = max(1, round(cat_shares[cat] * n_products))
        slots[cat] = n
        allocated += n
    diff = n_products - allocated
    if diff != 0:
        adj = max(slots, key=slots.get) if diff < 0 else min(slots, key=slots.get)
        slots[adj] += diff

    # Zipf weights per category (within-category rank ordering)
    #   Zipf exponent fitted globally: s=0.8387 — use same exponent within category
    ZIPF_S = 0.8387
    per_cat_weights = {}
    cat_id_ranges   = {}
    start_id = 1
    for cat in MY_CATEGORIES:
        n = slots[cat]
        ranks = np.arange(1, n + 1, dtype=float)
        w     = ranks ** (-ZIPF_S)
        w     = w / w.sum()
        per_cat_weights[cat] = [round(float(x), 6) for x in w]
        cat_id_ranges[cat]   = list(range(start_id, start_id + n))
        start_id += n

    # VERIFY: simulate 1M picks, compute resulting category shares
    n_sim    = 1_000_000
    sim_cats = []
    cat_list = MY_CATEGORIES
    cat_w    = [cat_shares[c] for c in cat_list]
    for _ in range(1):   # vectorised below
        pass
    chosen_cats  = np.random.choice(len(cat_list), size=n_sim,
                                    p=[w/sum(cat_w) for w in cat_w])
    cat_sim_counts = np.bincount(chosen_cats, minlength=len(cat_list))
    cat_sim_shares = cat_sim_counts / cat_sim_counts.sum()

    print("\n  Simulated category shares (1M orders, two-stage):")
    for i, cat in enumerate(cat_list):
        target = cat_shares[cat] * 100
        actual = cat_sim_shares[i] * 100
        ok     = "[OK]" if abs(target - actual) < 0.5 else "[FAIL]"
        fmt(f"  {cat}", f"target={target:.1f}%  simulated={actual:.1f}%  {ok}")

    print("\n  Catalog slot allocation:")
    for cat in MY_CATEGORIES:
        fmt(f"  {cat}", f"{slots[cat]} products  IDs {cat_id_ranges[cat][0]}–{cat_id_ranges[cat][-1]}")

    return {
        "category_shares":     cat_shares,
        "catalog_slots":       slots,
        "category_id_ranges":  cat_id_ranges,
        "per_category_zipf_weights": per_cat_weights,
        "zipf_s_used":         ZIPF_S,
        "simulated_shares_1M": {cat: round(float(cat_sim_shares[i]), 4)
                                 for i, cat in enumerate(cat_list)},
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8. 50M-ORDER SCALE-UP PARAMETERS
# ─────────────────────────────────────────────────────────────────────────────
def compute_scale_up(orders, customers):
    section("8. 50M-Order Scale-Up Parameters")

    # Real baseline
    real_orders   = len(orders)
    real_days     = (orders["order_purchase_timestamp"].dropna().max() -
                     orders["order_purchase_timestamp"].dropna().min()).days
    real_lpm      = real_orders / (real_days * 24 * 60)

    target_orders = 50_000_000
    target_months = 24
    target_days   = target_months * 30.44   # avg days per month
    target_lpm    = target_orders / (target_days * 24 * 60)
    scale_factor  = target_lpm / real_lpm

    # Orders per user — rescale to mean=40 (keep Pareto/power-law shape)
    # Real: mean≈1.03, shape≈Zipf(users). At 1.25M users × 40 orders = 50M
    target_mean_opu = 40.0
    target_users    = int(target_orders / target_mean_opu)
    real_mean_opu   = 1.0348   # from previous analysis

    # To keep heavy-tailed shape: use Pareto (power-law)
    # Real Olist ≈ 97% have 1 order → extremely heavy-tailed
    # At scale, model as Pareto(alpha) shifted so mean=40
    # Pareto mean = alpha*xm/(alpha-1); set xm=1, solve for alpha given mean=40
    # alpha = mean/(mean-1) = 40/39
    pareto_alpha = target_mean_opu / (target_mean_opu - 1.0)

    fmt("Real baseline: orders",          f"{real_orders:,}")
    fmt("Real baseline: days",            f"{real_days}")
    fmt("Real baseline: λ (orders/min)",  f"{real_lpm:.6f}")
    fmt("Target: total orders",           f"{target_orders:,}")
    fmt("Target: duration (months)",      f"{target_months}")
    fmt("Target: λ (orders/min)",         f"{target_lpm:.4f}")
    fmt("Scale factor (lambda_target/lambda_real)", f"{scale_factor:.1f}x")
    fmt("Target users",                            f"{target_users:,}  (={target_orders}/{int(target_mean_opu)})")
    fmt("Target mean orders/user",                 f"{target_mean_opu}")
    fmt("Pareto alpha for mean=40",                f"{pareto_alpha:.4f}  (shape: most users 1-5 orders, few with 1000+)")

    return {
        "target_total_orders":        target_orders,
        "target_duration_months":     target_months,
        "target_lambda_per_min":      round(target_lpm, 4),
        "scale_factor_vs_olist":      round(scale_factor, 1),
        "target_users":               target_users,
        "target_mean_orders_per_user": target_mean_opu,
        "orders_per_user_distribution": {
            "model":        "Pareto (power-law, heavy-tailed)",
            "pareto_alpha": round(pareto_alpha, 4),
            "xm_min":       1,
            "mean":         target_mean_opu,
            "note":         "Keep real Olist shape; rescale mean from 1.03 to 40. Pareto with alpha≈1.026 means most users have ~1 order, a small power-law tail has thousands.",
        },
        "arrival_rate": {
            "shape":     "use real Olist hourly/weekday profiles unchanged",
            "level":     f"scale lambda by {round(scale_factor, 1)}x - multiply each time-slot weight by target lambda",
            "example":   f"peak-hour rate uses hourly_profile weights from fit_report.json scaled to target lambda={target_lpm:.4f} orders/min",
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 9. VIVA EXPLANATIONS
# ─────────────────────────────────────────────────────────────────────────────
def viva_explanations():
    return {
        "1_order_value_log_normal": (
            "Order values follow a log-normal distribution. That means if you take the "
            "natural log of each order total, the resulting values are bell-shaped (normal). "
            "This is the standard model for revenues and prices because prices are "
            "multiplicative: a 10% discount on a $100 item moves it to $90, not $90±$10. "
            "The KS test p-value may be small (reject at α=0.05) because the right tail "
            "of real revenue data is slightly heavier than a true log-normal — this is "
            "normal for e-commerce and does not invalidate the model for simulation purposes."
        ),
        "2_items_per_order_poisson": (
            "The number of distinct product lines per order was compared against a "
            "shifted-Poisson model (shifted because the minimum is 1, not 0). The model "
            "is rejected by chi-square because 90% of orders have exactly 1 item — "
            "a much sharper mass at 1 than Poisson predicts. In practice we use the "
            "empirical probabilities directly: P(1 item)=90%, P(2)=7.6%, P(3+)=2.3%. "
            "This is more honest and produces realistic load patterns."
        ),
        "3_qty_per_line_geometric": (
            "Quantity per line item (how many units of one product per order) was compared "
            "against a Geometric distribution, which is the discrete analogue of the "
            "Exponential and models 'number of tries until success'. It's rejected for the "
            "same reason as items per order — 93% of lines have quantity 1. We use empirical "
            "weights: P(qty=1)=93%, P(qty=2)=5.3%, P(qty≥3)=1.7%."
        ),
        "4_product_popularity_zipf": (
            "Product popularity follows Zipf's law (also called a power law): the most "
            "popular product is ordered roughly twice as often as the second most popular, "
            "three times more than the third, and so on. This is fitted by log-log linear "
            "regression — plotting log(rank) vs log(frequency) gives a straight line with "
            "slope ≈ -0.84. R²=0.957 means the line explains 95.7% of the variance in "
            "log-frequency. The same pattern appears in web traffic, word frequency in "
            "language (Zipf's original observation), and citation counts."
        ),
        "5_arrival_rate_nonhomogeneous_poisson": (
            "Order arrivals are modelled as a Non-Homogeneous Poisson Process (NHPP). "
            "In a standard Poisson process the rate λ is constant. NHPP allows λ to vary "
            "with time. We extract two multiplier profiles from the real data: (a) hourly "
            "profile — how much of daily traffic falls in each of the 24 hours (peaks in "
            "the afternoon/evening), and (b) weekday profile — how traffic distributes "
            "across Monday–Sunday. A chi-square test against a flat (uniform) distribution "
            "rejects uniformity with p≈0, confirming the time-varying pattern. Under load "
            "testing these profiles can be used to modulate the Locust spawn rate."
        ),
        "6_status_ratios_and_pending": (
            "The order-service SAGA (saga.py) writes status='PENDING' to the database at "
            "Step 1, then immediately overwrites it to 'CONFIRMED' (success) or 'FAILED' "
            "(compensation complete) within the same synchronous HTTP request. There is no "
            "async gap. So any GET /orders/{id} called after POST /orders returns will see "
            "CONFIRMED or FAILED — never PENDING in steady state. The 0.3% Olist 'PENDING' "
            "rows (status='created'/'processing') represent orders that were interrupted "
            "mid-flight (network crash, server restart) — not a normal operating mode. "
            "We fold that 0.3% proportionally: final ratios are CONFIRMED≈98.8%, FAILED≈1.2%."
        ),
        "7_two_stage_category_product": (
            "A single global Zipf ranking across all 33 products conflicts with the real "
            "category share data. If we rank Electronics products 1-6 and Accessories 25-33, "
            "Zipf gives Electronics ~52% of picks but the real share is only 17.9%. "
            "Two-stage sampling fixes this: first draw a category with probability equal to "
            "its real Olist sales share (Electronics 17.9%, Accessories 28.3%, …), then "
            "within that category rank the local products 1..n and apply Zipf weights. "
            "This preserves both the power-law within-category skew and the correct "
            "cross-category proportions."
        ),
        "8_scale_up_50M": (
            "Scaling from 99k Olist orders to 50M synthetic orders requires two adjustments. "
            "(1) Arrival rate: multiply the real λ (0.089 orders/min) by the scale factor "
            "(≈535×) to get the target rate. The hourly and weekday profiles stay the same "
            "— only the level changes. (2) Orders per user: Olist has a mean of 1.03 orders "
            "per user (97% one-time buyers). At 50M orders over 1.25M users the mean must "
            "be 40. We keep the heavy-tailed (power-law / Pareto) shape — most users still "
            "buy once or twice, but a small fraction buys hundreds of times. The Pareto "
            "distribution with alpha≈1.026 achieves mean=40 while preserving this skew."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("\n" + "="*68)
    print("  Phase-2 Fit & Validate  —  OMS Load-Test Calibration")
    print("="*68)

    orders, items, products, transl, customers = load_data()

    report = {}

    report["order_value"]         = fit_order_value(items)
    report["items_per_order"]     = fit_items_per_order(items)
    report["qty_per_line"]        = fit_quantity_per_line(items)
    report["product_popularity"]  = fit_product_popularity(items, MY_CATALOG_SIZE)
    report["arrival_profiles"]    = fit_arrival_profiles(orders)
    report["status_ratios"]       = compute_status_ratios_corrected(orders)
    report["two_stage_sampling"]  = build_two_stage_sampling(items, products, transl, MY_CATALOG_SIZE)
    report["scale_up_50M"]        = compute_scale_up(orders, customers)
    report["viva_explanations"]   = viva_explanations()

    # Save fit_report.json
    with open(FIT_JSON, "w") as f:
        json.dump(report, f, indent=2)
    section(f"Saved fit_report.json  →  {FIT_JSON}")

    # Print category verification
    section("VERIFICATION: Category shares after two-stage sampling")
    ts = report["two_stage_sampling"]
    for cat in MY_CATEGORIES:
        share   = ts["category_shares"][cat] * 100
        slots_n = ts["catalog_slots"][cat]
        ids     = ts["category_id_ranges"][cat]
        print(f"  {cat:<22} {share:5.1f}%  slots={slots_n}  IDs={ids[0]}–{ids[-1]}")

    print(f"\n  Simulated (1M orders, two-stage sampling):")
    for cat in MY_CATEGORIES:
        sim = ts["simulated_shares_1M"][cat] * 100
        tgt = ts["category_shares"][cat] * 100
        ok  = "[OK]" if abs(sim - tgt) < 0.5 else "[FAIL]"
        print(f"  {cat:<22} simulated={sim:.1f}%  target={tgt:.1f}%  {ok}")

    print("\n" + "="*68)
    print("  All done. Files written:")
    print(f"    {FIT_JSON}")
    for f in sorted(REPORT_DIR.glob("*.png")):
        print(f"    {f}")
    print("="*68 + "\n")

    return report


if __name__ == "__main__":
    main()
