"""
analyze_olist.py
─────────────────────────────────────────────────────────────────────────────
Reads the Olist Brazilian E-Commerce dataset and extracts the following
distribution shapes to calibrate load-test parameters:

  1. Product popularity rank  →  Zipf/power-law weights per catalog slot
  2. Order inter-arrival rate →  λ (orders/minute) from purchase timestamps
  3. Order value distribution →  mean & std of total_amount per order
  4. Items-per-order          →  mean & std of item count
  5. Orders-per-user          →  mean & std (most users buy once)
  6. Status ratio             →  CONFIRMED / PENDING / FAILED split
  7. Category distribution    →  mapped to 5 system categories

Usage:
    pip install pandas numpy scipy
    python data/analyze_olist.py

Output:
    • Console report with all key statistics
    • data/olist_distributions.json  (machine-readable, for locustfile use)
─────────────────────────────────────────────────────────────────────────────
"""

import os
import json
import math
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore", category=FutureWarning)

# ── Paths ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "real" / "olist"

ORDERS_CSV     = DATA_DIR / "olist_orders_dataset.csv"
ITEMS_CSV      = DATA_DIR / "olist_order_items_dataset.csv"
PRODUCTS_CSV   = DATA_DIR / "olist_products_dataset.csv"
TRANSL_CSV     = DATA_DIR / "product_category_name_translation.csv"
CUSTOMERS_CSV  = DATA_DIR / "olist_customers_dataset.csv"

OUTPUT_JSON    = Path(__file__).parent / "olist_distributions.json"

# ── System constants ──────────────────────────────────────────────────────────
MY_CATALOG_SIZE = 33   # total products in our catalog

# Our 5 categories exactly as stored in product-service DB
MY_CATEGORIES = ["Electronics", "Furniture", "Kitchen", "Sports & Outdoors", "Accessories"]

# Olist status  →  our status mapping
#   delivered / shipped / invoiced / approved  →  CONFIRMED
#   canceled / unavailable                     →  FAILED
#   created / processing / (all others)        →  PENDING
OLIST_TO_MY_STATUS = {
    "delivered":    "CONFIRMED",
    "shipped":      "CONFIRMED",
    "invoiced":     "CONFIRMED",
    "approved":     "CONFIRMED",
    "canceled":     "FAILED",
    "unavailable":  "FAILED",
    "created":      "PENDING",
    "processing":   "PENDING",
}

# Mapping Olist English category names → our 5 categories
OLIST_CAT_MAP = {
    # Electronics / Computers / Phones / Games / Auto-tech
    "computers_accessories": "Electronics",
    "computers":             "Electronics",
    "telephony":             "Electronics",
    "electronics":           "Electronics",
    "tablets_printing_image":"Electronics",
    "consoles_games":        "Electronics",
    "audio":                 "Electronics",
    "small_appliances":      "Electronics",
    "small_appliances_home_oven_and_coffee": "Electronics",
    "air_conditioning":      "Electronics",
    "fixed_telephony":       "Electronics",
    "signaling_and_security":"Electronics",
    "home_appliances":       "Electronics",
    "home_appliances_2":     "Electronics",
    "cds_dvds_musicals":     "Electronics",
    "dvds_blu_ray":          "Electronics",
    "musical_instruments":   "Electronics",

    # Furniture / Home decor / Office
    "furniture_decor":       "Furniture",
    "furniture_bedroom":     "Furniture",
    "furniture_living_room": "Furniture",
    "furniture_mattress_and_upholstery": "Furniture",
    "office_furniture":      "Furniture",
    "home_confort":          "Furniture",
    "home_comfort_2":        "Furniture",
    "housewares":            "Furniture",
    "garden_tools":          "Furniture",
    "construction_tools_lights": "Furniture",
    "construction_tools_safety": "Furniture",
    "construction_tools_tools":  "Furniture",
    "construction_tools_construction": "Furniture",
    "costruction_tools_garden": "Furniture",
    "christmas_supplies":    "Furniture",
    "market_place":          "Furniture",

    # Kitchen / Food / Drink
    "kitchen_dining_laundry_garden_furniture": "Kitchen",
    "bed_bath_table":        "Kitchen",
    "food":                  "Kitchen",
    "food_drink":            "Kitchen",
    "drinks":                "Kitchen",
    "party_supplies":        "Kitchen",
    "la_cuisine":            "Kitchen",
    "portable_kitchen_food_processors": "Kitchen",

    # Sports & Outdoors / Health / Beauty / Animals
    "sports_leisure":        "Sports & Outdoors",
    "health_beauty":         "Sports & Outdoors",
    "pet_shop":              "Sports & Outdoors",
    "diapers_and_hygiene":   "Sports & Outdoors",
    "baby":                  "Sports & Outdoors",

    # Accessories / Fashion / Watches / Art / Books / Toys / Stationery
    "watches_gifts":         "Accessories",
    "fashion_bags_accessories": "Accessories",
    "fashion_male_clothing": "Accessories",
    "fashion_female_clothing": "Accessories",
    "fashion_underwear_beach": "Accessories",
    "fashion_sport":         "Accessories",
    "fashion_childrens_clothes": "Accessories",
    "luggage_accessories":   "Accessories",
    "books_general_interest":"Accessories",
    "books_technical":       "Accessories",
    "books_imported":        "Accessories",
    "toys":                  "Accessories",
    "stationery":            "Accessories",
    "arts_and_craftmanship": "Accessories",
    "art":                   "Accessories",
    "flowers":               "Accessories",
    "cool_stuff":            "Accessories",
    "industry_commerce_and_business": "Accessories",
    "agro_industry_and_commerce": "Accessories",
    "security_and_services": "Accessories",
    "music":                 "Accessories",
    "perfumery":             "Accessories",
    "auto":                  "Accessories",
}

# ─────────────────────────────────────────────────────────────────────────────
# HELPER UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

def section(title):
    width = 68
    print(f"\n{'=' * width}")
    print(f"  {title}")
    print(f"{'=' * width}")


def fmt(label, value):
    print(f"  {label:<42} {value}")


# ─────────────────────────────────────────────────────────────────────────────
# 1. LOAD DATA
# ─────────────────────────────────────────────────────────────────────────────

def load_data():
    section("Loading Olist datasets ...")

    orders   = pd.read_csv(ORDERS_CSV,   parse_dates=["order_purchase_timestamp"])
    items    = pd.read_csv(ITEMS_CSV)
    products = pd.read_csv(PRODUCTS_CSV)
    transl   = pd.read_csv(TRANSL_CSV)
    customers= pd.read_csv(CUSTOMERS_CSV)

    fmt("Orders rows",    f"{len(orders):,}")
    fmt("Items rows",     f"{len(items):,}")
    fmt("Products rows",  f"{len(products):,}")
    fmt("Translation rows", f"{len(transl):,}")
    fmt("Customers rows", f"{len(customers):,}")

    return orders, items, products, transl, customers


# ─────────────────────────────────────────────────────────────────────────────
# 2. STATUS RATIOS
# ─────────────────────────────────────────────────────────────────────────────

def compute_status_ratios(orders):
    section("Order Status Ratios")

    raw_counts = orders["order_status"].value_counts()
    print("\n  Raw Olist statuses:")
    for status, count in raw_counts.items():
        pct = count / len(orders) * 100
        print(f"    {status:<20} {count:>7,}  ({pct:5.1f}%)")

    orders = orders.copy()
    orders["my_status"] = orders["order_status"].map(OLIST_TO_MY_STATUS).fillna("PENDING")
    mapped = orders["my_status"].value_counts(normalize=True)

    print("\n  Mapped to system statuses:")
    result = {}
    for status in ["CONFIRMED", "PENDING", "FAILED"]:
        pct = mapped.get(status, 0.0)
        result[status] = round(float(pct), 4)
        fmt(f"  {status}", f"{pct*100:.1f}%")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 3. INTER-ARRIVAL RATE
# ─────────────────────────────────────────────────────────────────────────────

def compute_arrival_rate(orders):
    section("Order Inter-Arrival Rate")

    ts = orders["order_purchase_timestamp"].dropna().sort_values()

    duration_days  = (ts.iloc[-1] - ts.iloc[0]).total_seconds() / 86400
    duration_mins  = duration_days * 24 * 60
    total_orders   = len(ts)
    lambda_per_min = total_orders / duration_mins

    fmt("Dataset time window (days)",     f"{duration_days:.0f}")
    fmt("Total orders",                   f"{total_orders:,}")
    fmt("Lambda (orders/minute) overall", f"{lambda_per_min:.4f}")

    hourly = ts.dt.floor("h").value_counts().sort_index()
    p95_hourly_count = float(np.percentile(hourly.values, 95))
    lambda_peak_per_min = p95_hourly_count / 60.0
    fmt("Lambda_peak (orders/min @ p95 hour)", f"{lambda_peak_per_min:.4f}")

    diff_sec = ts.diff().dt.total_seconds().dropna()
    diff_sec = diff_sec[diff_sec < 86400]
    mean_iat_sec   = float(diff_sec.mean())
    median_iat_sec = float(diff_sec.median())

    fmt("Mean inter-arrival time (s)",    f"{mean_iat_sec:.2f}")
    fmt("Median inter-arrival time (s)",  f"{median_iat_sec:.2f}")

    locust_min_wait = max(0.5, round(median_iat_sec * 0.5, 1))
    locust_max_wait = round(median_iat_sec * 1.5, 1)
    fmt("Suggested locust wait_time",     f"between({locust_min_wait}, {locust_max_wait})")

    return {
        "lambda_per_min":      round(lambda_per_min, 6),
        "lambda_peak_per_min": round(lambda_peak_per_min, 6),
        "mean_iat_seconds":    round(mean_iat_sec, 2),
        "median_iat_seconds":  round(median_iat_sec, 2),
        "locust_wait_min":     locust_min_wait,
        "locust_wait_max":     locust_max_wait,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. ORDER VALUE DISTRIBUTION
# ─────────────────────────────────────────────────────────────────────────────

def compute_order_value(items):
    section("Order Value Distribution (price + freight per order)")

    items = items.copy()
    items["line_total"] = items["price"] + items["freight_value"]
    order_totals = items.groupby("order_id")["line_total"].sum()

    mean_val   = float(order_totals.mean())
    std_val    = float(order_totals.std())
    median_val = float(order_totals.median())
    p25_val    = float(order_totals.quantile(0.25))
    p75_val    = float(order_totals.quantile(0.75))
    p95_val    = float(order_totals.quantile(0.95))

    fmt("Mean order total (BRL)",   f"{mean_val:.2f}")
    fmt("Std  order total",         f"{std_val:.2f}")
    fmt("Median order total",       f"{median_val:.2f}")
    fmt("P25 / P75 / P95",          f"{p25_val:.2f} / {p75_val:.2f} / {p95_val:.2f}")

    log_vals      = np.log(order_totals[order_totals > 0])
    lognorm_mu    = float(log_vals.mean())
    lognorm_sigma = float(log_vals.std())
    fmt("Log-normal mu (log scale)",  f"{lognorm_mu:.4f}")
    fmt("Log-normal sigma (log scale)", f"{lognorm_sigma:.4f}")

    return {
        "mean_brl":      round(mean_val, 2),
        "std_brl":       round(std_val, 2),
        "median_brl":    round(median_val, 2),
        "p25_brl":       round(p25_val, 2),
        "p75_brl":       round(p75_val, 2),
        "p95_brl":       round(p95_val, 2),
        "lognorm_mu":    round(lognorm_mu, 4),
        "lognorm_sigma": round(lognorm_sigma, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. ITEMS PER ORDER
# ─────────────────────────────────────────────────────────────────────────────

def compute_items_per_order(items):
    section("Items Per Order Distribution")

    items_per = items.groupby("order_id")["order_item_id"].count()

    value_counts = items_per.value_counts().sort_index()
    print("\n  Items/order frequency:")
    for n_items, count in value_counts.head(10).items():
        pct = count / len(items_per) * 100
        print(f"    {n_items} item(s): {count:>7,}  ({pct:5.1f}%)")

    mean_items   = float(items_per.mean())
    std_items    = float(items_per.std())
    median_items = float(items_per.median())

    fmt("Mean items/order",   f"{mean_items:.3f}")
    fmt("Std  items/order",   f"{std_items:.3f}")
    fmt("Median items/order", f"{median_items:.1f}")

    p1     = float((items_per == 1).mean())
    p2     = float((items_per == 2).mean())
    p3plus = float((items_per >= 3).mean())

    fmt("P(1 item)",   f"{p1*100:.1f}%")
    fmt("P(2 items)",  f"{p2*100:.1f}%")
    fmt("P(3+ items)", f"{p3plus*100:.1f}%")

    return {
        "mean":      round(mean_items, 4),
        "std":       round(std_items, 4),
        "median":    round(median_items, 1),
        "p_1_item":  round(p1, 4),
        "p_2_items": round(p2, 4),
        "p_3plus":   round(p3plus, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. ORDERS PER USER
# ─────────────────────────────────────────────────────────────────────────────

def compute_orders_per_user(orders, customers):
    section("Orders Per User Distribution")

    merged = orders.merge(customers[["customer_id", "customer_unique_id"]], on="customer_id", how="left")
    orders_per_user = merged.groupby("customer_unique_id").size()

    value_counts = orders_per_user.value_counts().sort_index()
    print("\n  Orders/user frequency (top 10):")
    for n_orders, count in value_counts.head(10).items():
        pct = count / len(orders_per_user) * 100
        print(f"    {n_orders} order(s): {count:>7,}  ({pct:5.1f}%)")

    mean_opu   = float(orders_per_user.mean())
    std_opu    = float(orders_per_user.std())
    median_opu = float(orders_per_user.median())
    p_one_time = float((orders_per_user == 1).mean())
    p_repeat   = float((orders_per_user > 1).mean())

    fmt("Mean orders/user",    f"{mean_opu:.4f}")
    fmt("Std  orders/user",    f"{std_opu:.4f}")
    fmt("Median orders/user",  f"{median_opu:.1f}")
    fmt("One-time buyers (%)", f"{p_one_time*100:.1f}%")
    fmt("Repeat buyers (%)",   f"{p_repeat*100:.1f}%")

    return {
        "mean":       round(mean_opu, 4),
        "std":        round(std_opu, 4),
        "median":     round(median_opu, 1),
        "p_one_time": round(p_one_time, 4),
        "p_repeat":   round(p_repeat, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. PRODUCT POPULARITY (ZIPF WEIGHTS)
# ─────────────────────────────────────────────────────────────────────────────

def compute_popularity_weights(items, n_products=33):
    section(f"Product Popularity Weights  (mapped to {n_products} catalog slots)")

    popularity = items["product_id"].value_counts()
    ranks = np.arange(1, len(popularity) + 1, dtype=float)
    freqs = popularity.values.astype(float)

    log_ranks = np.log(ranks)
    log_freqs = np.log(freqs)
    slope, intercept, r_value, _, _ = stats.linregress(log_ranks, log_freqs)
    zipf_s = -slope

    fmt("Zipf exponent s (fitted)", f"{zipf_s:.4f}  (R2={r_value**2:.4f})")
    top20_pct = freqs[:int(len(freqs)*0.2)].sum() / freqs.sum() * 100
    fmt("Top 20% products => pct of sales", f"{top20_pct:.0f}%")

    catalog_ranks = np.arange(1, n_products + 1, dtype=float)
    raw_weights   = catalog_ranks ** (-zipf_s)
    norm_weights  = (raw_weights / raw_weights.sum()).tolist()
    norm_weights  = [round(w, 6) for w in norm_weights]

    print(f"\n  Popularity weights for {n_products} products (rank 1 = most popular):")
    for i, w in enumerate(norm_weights, 1):
        bar = "#" * max(1, int(w * 300))
        print(f"    slot {i:>2}  w={w:.5f}  {bar}")

    return {
        "zipf_exponent": round(zipf_s, 4),
        "r_squared":     round(r_value**2, 4),
        "n_products":    n_products,
        "weights":       norm_weights,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8. CATEGORY DISTRIBUTION
# ─────────────────────────────────────────────────────────────────────────────

def compute_category_distribution(items, products, transl):
    section("Category Distribution  (mapped to 5 system categories)")

    cat_map_df = transl.set_index("product_category_name")["product_category_name_english"]
    products   = products.copy()
    products["category_en"] = products["product_category_name"].map(cat_map_df)

    merged = items.merge(products[["product_id", "category_en"]], on="product_id", how="left")
    merged["my_category"] = merged["category_en"].map(OLIST_CAT_MAP).fillna("Accessories")

    cat_counts = merged["my_category"].value_counts()
    total      = cat_counts.sum()

    print("\n  Sales volume by system category:")
    result = {}
    for cat in MY_CATEGORIES:
        cnt  = cat_counts.get(cat, 0)
        pct  = cnt / total if total > 0 else 0.0
        result[cat] = round(float(pct), 4)
        bar  = "#" * max(1, int(pct * 60))
        fmt(f"  {cat}", f"{pct*100:5.1f}%  {bar}")

    s = sum(result.values())
    result = {k: round(v / s, 4) for k, v in result.items()}

    print(f"\n  Suggested product slots ({MY_CATALOG_SIZE} catalog items):")
    allocated = 0
    slots = {}
    for cat in MY_CATEGORIES:
        n = max(1, round(result[cat] * MY_CATALOG_SIZE))
        slots[cat] = n
        allocated += n
        fmt(f"  {cat}", f"{n} products")

    diff = MY_CATALOG_SIZE - allocated
    if diff != 0:
        adjust_cat = max(slots, key=slots.get) if diff < 0 else min(slots, key=slots.get)
        slots[adjust_cat] += diff
        fmt(f"  (adjusted {adjust_cat})", f"-> {slots[adjust_cat]}")

    return {"proportions": result, "catalog_slots": slots}


# ─────────────────────────────────────────────────────────────────────────────
# 9. QUANTITY PER LINE ITEM
# ─────────────────────────────────────────────────────────────────────────────

def compute_quantity_distribution(items):
    section("Quantity Per Line Item")

    qty_proxy = items.groupby(["order_id", "product_id"]).size()

    mean_qty   = float(qty_proxy.mean())
    std_qty    = float(qty_proxy.std())
    median_qty = float(qty_proxy.median())
    p90_qty    = float(qty_proxy.quantile(0.90))

    fmt("Mean qty per line item",    f"{mean_qty:.4f}")
    fmt("Std  qty per line item",    f"{std_qty:.4f}")
    fmt("Median qty per line item",  f"{median_qty:.1f}")
    fmt("P90 qty per line item",     f"{p90_qty:.1f}")

    p1     = float((qty_proxy == 1).mean())
    p2     = float((qty_proxy == 2).mean())
    p3plus = float((qty_proxy >= 3).mean())
    fmt("P(qty=1)",  f"{p1*100:.1f}%")
    fmt("P(qty=2)",  f"{p2*100:.1f}%")
    fmt("P(qty>=3)", f"{p3plus*100:.1f}%")

    return {
        "mean":    round(mean_qty, 4),
        "std":     round(std_qty, 4),
        "median":  round(median_qty, 1),
        "p90":     round(p90_qty, 1),
        "p_qty1":  round(p1, 4),
        "p_qty2":  round(p2, 4),
        "p_qty3p": round(p3plus, 4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 10. SAVE JSON
# ─────────────────────────────────────────────────────────────────────────────

def save_distributions(results):
    section("Saving distributions to JSON ...")
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Written to:  {OUTPUT_JSON}")


# ─────────────────────────────────────────────────────────────────────────────
# 11. PRINT LOCUSTFILE CALIBRATION HINTS
# ─────────────────────────────────────────────────────────────────────────────

def print_locust_hints(dist):
    section("Locust Calibration Hints")

    arr  = dist["arrival_rate"]
    pop  = dist["product_popularity"]
    stat = dist["status_ratios"]
    ipo  = dist["items_per_order"]
    qty  = dist["quantity_per_line"]
    cat  = dist["category_distribution"]

    print(f"""
  # Wait Times
  wait_time = between({arr['locust_wait_min']}, {arr['locust_wait_max']})
  # Based on median inter-arrival time: {arr['median_iat_seconds']:.1f} s

  # Product Weights (Zipf s={pop['zipf_exponent']})
  # Top product gets {pop['weights'][0]*100:.1f}% of traffic
  # Use: random.choices(PRODUCT_IDS, weights=PRODUCT_WEIGHTS, k=1)[0]
  PRODUCT_WEIGHTS = {pop['weights'][:10]} ... (33 entries total in JSON)

  # Items per Order
  # {ipo['p_1_item']*100:.0f}% single-item  {ipo['p_2_items']*100:.0f}% two-item  {ipo['p_3plus']*100:.0f}% three+
  n_items = random.choices([1,2,3], weights=[{ipo['p_1_item']:.2f},{ipo['p_2_items']:.2f},{ipo['p_3plus']:.2f}])[0]

  # Quantity per Line Item
  # {qty['p_qty1']*100:.0f}% qty=1  {qty['p_qty2']*100:.0f}% qty=2  {qty['p_qty3p']*100:.0f}% qty>=3
  qty = random.choices([1,2,3], weights=[{qty['p_qty1']:.2f},{qty['p_qty2']:.2f},{qty['p_qty3p']:.2f}])[0]

  # Expected Final Status (after SAGA)
  # CONFIRMED (success): {stat['CONFIRMED']*100:.1f}%
  # FAILED    (rollback): {stat['FAILED']*100:.1f}%
  # PENDING   (in-flight): {stat['PENDING']*100:.1f}%

  # Category Slots (33 products)""")

    for cat_name, n in cat["catalog_slots"].items():
        pct = cat["proportions"][cat_name] * 100
        print(f"  #   {cat_name:<20} {n:>2} products  ({pct:.0f}% of sales volume)")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "=" * 68)
    print("  Olist Distribution Analyzer  =>  OMS Load-Test Calibration")
    print("=" * 68)

    orders, items, products, transl, customers = load_data()

    results = {
        "status_ratios":          compute_status_ratios(orders),
        "arrival_rate":           compute_arrival_rate(orders),
        "order_value":            compute_order_value(items),
        "items_per_order":        compute_items_per_order(items),
        "orders_per_user":        compute_orders_per_user(orders, customers),
        "product_popularity":     compute_popularity_weights(items, MY_CATALOG_SIZE),
        "category_distribution":  compute_category_distribution(items, products, transl),
        "quantity_per_line":      compute_quantity_distribution(items),
    }

    save_distributions(results)
    print_locust_hints(results)

    print("\n" + "=" * 68)
    print("  Analysis complete.")
    print("=" * 68 + "\n")

    return results


if __name__ == "__main__":
    main()
