#!/usr/bin/env python3
"""
scripts/build_catalog_seed.py
─────────────────────────────────────────────────────────────────────────────
Builds data/catalog/catalog_seed.csv and data/catalog/category_map.csv
from UCI Online Retail II dataset (data/real/uci/online_retail_II.xlsx).

Rules:
1. Distinct StockCode.
2. Skip non-products (postage, fees, manual, adjustments, test, damaged codes)
   and descriptions that are empty or contain "?".
3. Title Case the name.
4. Median UnitPrice per product converted at fixed 1 GBP = 1.3 USD (documented assumption).
5. Deterministic seeded rating (3.0-5.0) and stock (20-200).
6. Classify each product into the 5 existing categories:
   (Electronics, Furniture, Kitchen, Sports & Outdoors, Accessories).
   Skip items that fit none; do not force Electronics if the source has few.
7. Description = "<name>. Category: <category>." and nothing invented.
8. Maximum 400 rows.
9. Show category distribution and a random sample of 30 items for review.
─────────────────────────────────────────────────────────────────────────────
"""

import os
import re
import csv
import random
import statistics
from collections import defaultdict, Counter
from pathlib import Path
import openpyxl

BASE_DIR = Path(__file__).resolve().parent.parent
XLSX_PATH = BASE_DIR / "data" / "real" / "uci" / "online_retail_II.xlsx"
OUTPUT_DIR = BASE_DIR / "data" / "catalog"
CATALOG_SEED_CSV = OUTPUT_DIR / "catalog_seed.csv"
CATEGORY_MAP_CSV = OUTPUT_DIR / "category_map.csv"

# Documented assumption
GBP_TO_USD = 1.30

# Non-product stock codes and prefixes to skip
SKIP_STOCK_CODES = {
    "POST", "POSTAGE", "D", "M", "BANK CHARGES", "PADS", "DOT", "CRUK",
    "AMAZONFEE", "SAMPLES", "ADJUST", "ADJUST2", "TEST", "TEST001", "TEST002",
    "C2", "GIFT", "B", "S",
}

SKIP_PREFIXES = ("C", "AMAZON", "ADJUST", "TEST", "GIFT", "SP100")

# Bad description keywords (adjustments, damages, internal codes)
BAD_DESC_REGEX = re.compile(
    r"\b(damaged|damage|damages|check|lost|missing|broken|crushed|found|water damaged|"
    r"throw away|smash|wet|rusty|destroyed|wrongly coded|faulty|ebay|amazon|sample|samples|"
    r"adjust|adjustment|dotcom|manual|postage|carriage|fees|fee|barcode|uncoded|mix up|"
    r"re-order|stock check|count|discount|returned|wrong code)\b",
    re.IGNORECASE
)

def is_valid_stockcode(sc: str) -> bool:
    if not sc:
        return False
    sc = sc.strip()
    if sc.upper() in SKIP_STOCK_CODES:
        return False
    for pfx in SKIP_PREFIXES:
        if sc.upper().startswith(pfx):
            return False
    # StockCode should typically have numbers
    if not any(char.isdigit() for char in sc):
        return False
    return True

def clean_title(text: str) -> str:
    # Collapse multiple spaces
    text = re.sub(r"\s+", " ", text).strip()
    # Handle words like T-LIGHT, XMAS, SET/3, etc.
    words = text.split(" ")
    title_words = []
    for w in words:
        if "/" in w:
            parts = [p.capitalize() for p in w.split("/")]
            title_words.append("/".join(parts))
        elif "-" in w:
            parts = [p.capitalize() for p in w.split("-")]
            title_words.append("-".join(parts))
        elif w.upper() in ("LED", "USB", "RGB", "TKL", "IPX7", "4K", "BPA", "TPE", "RFID"):
            title_words.append(w.upper())
        else:
            title_words.append(w.capitalize())
    return " ".join(title_words)

# Classification rules
def classify_product(name: str) -> str | None:
    n = f" {name.lower()} "

    # 1. Electronics (specific tech, electronic gadgets, clocks, timers, digital devices, torches)
    # Check this first so items like 'Alarm Clock' don't get misrouted
    if re.search(r"\b(alarm clock|wall clock|grand clock|clock|torch|flashlight|calculator|radio|led light|usb|battery|speaker|headphone|stopwatch|digital timer)\b", n):
        # Exclude decorative clock keys, etc. if any
        if not re.search(r"\b(cushion|towel|paper|tin|fabric)\b", n):
            return "Electronics"

    # 2. Furniture (functional home furniture: tables, chairs, cabinets, shelves, stools, desks, coat racks)
    if re.search(r"\b(cabinet|shelves|shelf|shelving|bookcase|cupboard|sideboard|desk|table|stool|chair|benches|bench|drawers|chest of drawers|bedside|nightstand|coat rack|wall rack|furniture|folding chair|wall cabinet|coat stand)\b", n):
        # Make sure it's not "table runner", "table cloth", "placemat", "table game"
        if not re.search(r"\b(cloth|runner|placemat|napkin|game|mat|confetti)\b", n):
            return "Furniture"

    # 3. Kitchen (food preparation, dining, tableware, cookware, drinkware, kitchen storage)
    if re.search(r"\b(mug|mugs|teapot|tea pot|coffee pot|cup|cups|saucer|saucers|plate|plates|bowl|bowls|baking|cake|cutlery|spoon|spoons|fork|forks|knife|knives|napkin|napkins|coaster|coasters|placemat|placemats|jug|jugs|tumbler|tumblers|apron|aprons|toaster|pot|pots|pan|pans|saucepan|cookware|salt shaker|pepper shaker|salt & pepper|chopping board|cutting board|colander|whisk|spatula|peeler|corkscrew|bottle opener|lunch box|lunchbox|biscuit tin|cake tin|storage jar|jam jar|bread bin|butter dish|pitcher|carafe|dish|dishes|baking case|baking cases|cake stand|cutlery set|tea set|fondue|pie dish|casserole|egg cup|egg cups|kettle|teapot)\b", n):
        return "Kitchen"

    # 4. Sports & Outdoors (gardening, picnic, camping, travel gear, outdoor tools, fitness)
    if re.search(r"\b(garden|gardening|picnic|camping|camp|tent|bike|bicycle|cycling|cycle bell|bicycle bell|compass|binoculars|water bottle|sports|sport|yoga mat|gym|fitness|hiking|hike|skate|swimming|kite|kites|hammock|barbecue|bbq|watering can|flower pot|plant pot|planter|bird feeder|wind chime|outdoor lantern|garden stake|garden tool|garden thermometer|picnic basket|picnic rug)\b", n):
        return "Sports & Outdoors"

    # 5. Accessories (personal wearable / carry items: bags, wallets, purses, umbrellas, jewelry, keyrings, cases, compact mirrors)
    if re.search(r"\b(bag|bags|handbag|tote|tote bag|shopping bag|shopper|purse|purses|wallet|wallets|pouch|pouches|cosmetic bag|pencil case|scarf|scarves|gloves|umbrella|umbrellas|keyring|keyrings|key chain|keychain|jewellery|jewelry|necklace|necklaces|bracelet|bracelets|brooch|brooches|badge|badges|compact mirror|pocket mirror|sunglasses|eyeglass case|glasses case|watch|watches|luggage tag|travel pass holder|lanyard|card holder)\b", n):
        return "Accessories"

    return None

def main():
    print(f"Loading UCI Online Retail II dataset from {XLSX_PATH}...")
    if not XLSX_PATH.exists():
        raise FileNotFoundError(f"Missing dataset at {XLSX_PATH}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Dictionary to aggregate per StockCode:
    # prices: list of unit prices > 0
    # desc_counter: Counter of descriptions
    products_data = defaultdict(lambda: {"prices": [], "descriptions": Counter()})

    wb = openpyxl.load_workbook(str(XLSX_PATH), read_only=True, data_only=True)
    total_processed_rows = 0

    # Stream both sheets: 'Year 2009-2010' and 'Year 2010-2011'
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        print(f"Streaming sheet '{sheet_name}'...")
        header_map = {}
        for row_idx, row in enumerate(sheet.iter_rows(values_only=True)):
            if row_idx == 0:
                header_map = {str(col).strip(): idx for idx, col in enumerate(row) if col is not None}
                continue

            total_processed_rows += 1
            if total_processed_rows % 200000 == 0:
                print(f"  Processed {total_processed_rows:,} rows so far...")

            sc_idx = header_map.get("StockCode")
            desc_idx = header_map.get("Description")
            price_idx = header_map.get("Price")

            if sc_idx is None or desc_idx is None or price_idx is None:
                continue

            raw_sc = row[sc_idx]
            raw_desc = row[desc_idx]
            raw_price = row[price_idx]

            if raw_sc is None or raw_desc is None or raw_price is None:
                continue

            sc_str = str(raw_sc).strip()
            if not is_valid_stockcode(sc_str):
                continue

            desc_str = str(raw_desc).strip()
            # Skip descriptions containing '?' or empty
            if not desc_str or "?" in desc_str:
                continue

            # Skip bad description / adjustment keywords
            if BAD_DESC_REGEX.search(desc_str):
                continue

            try:
                price = float(raw_price)
            except (ValueError, TypeError):
                continue

            if price <= 0:
                continue

            products_data[sc_str]["prices"].append(price)
            products_data[sc_str]["descriptions"][desc_str] += 1

    print(f"Completed streaming. Total rows scanned: {total_processed_rows:,}")
    print(f"Found {len(products_data):,} valid candidate StockCodes with positive prices.")

    # Process and classify candidates
    classified_items = []
    unclassified_count = 0

    for sc, pdata in products_data.items():
        if not pdata["prices"]:
            continue
        # Most common description
        best_desc, _ = pdata["descriptions"].most_common(1)[0]
        name = clean_title(best_desc)

        category = classify_product(name)
        if not category:
            unclassified_count += 1
            continue

        median_gbp = statistics.median(pdata["prices"])
        price_usd = round(median_gbp * GBP_TO_USD, 2)
        if price_usd <= 0:
            price_usd = 0.99

        classified_items.append({
            "stock_code": sc,
            "name": name,
            "category": category,
            "price_usd": price_usd,
            "median_gbp": round(median_gbp, 2),
            "freq": len(pdata["prices"]),
        })

    print(f"Classified {len(classified_items)} products into 5 categories. (Skipped {unclassified_count} unclassified items).")

    # Group by category and order by transaction frequency (popularity/stability)
    by_category = defaultdict(list)
    for item in classified_items:
        by_category[item["category"]].append(item)

    for cat in by_category:
        by_category[cat].sort(key=lambda x: x["freq"], reverse=True)
        print(f"  Category '{cat}': {len(by_category[cat])} available products")

    # Select target products up to 400 rows total:
    # We want a healthy balance across all 5 categories without forcing Electronics:
    # Electronics: take all available (up to ~40)
    # Sports & Outdoors: take all available (up to ~60)
    # Furniture: take up to ~70
    # Accessories: take up to ~110
    # Kitchen: take up to ~115
    # Total <= 385-395 (strictly under 400 rows)
    selected_items = []

    target_quotas = {
        "Electronics": min(len(by_category["Electronics"]), 45),
        "Sports & Outdoors": min(len(by_category["Sports & Outdoors"]), 65),
        "Furniture": min(len(by_category["Furniture"]), 75),
        "Accessories": min(len(by_category["Accessories"]), 110),
        "Kitchen": min(len(by_category["Kitchen"]), 105),
    }

    # Ensure total <= 400
    total_planned = sum(target_quotas.values())
    if total_planned > 400:
        excess = total_planned - 400
        target_quotas["Kitchen"] -= excess

    for cat, quota in target_quotas.items():
        chosen = by_category[cat][:quota]
        selected_items.extend(chosen)
        print(f"Selected {len(chosen)} items for category '{cat}'")

    print(f"Total selected items: {len(selected_items)} (limit: 400)")

    # Sort selected items deterministically by stock_code
    selected_items.sort(key=lambda x: x["stock_code"])

    # Deterministic seeded rating (3.0-5.0) and stock (20-200)
    rng = random.Random(42)
    final_seed_rows = []
    category_map_rows = []

    for item in selected_items:
        sc = item["stock_code"]
        name = item["name"]
        cat = item["category"]
        price = item["price_usd"]
        rating = round(rng.uniform(3.0, 5.0), 1)
        stock = rng.randint(20, 200)
        # Description: "<name>. Category: <category>." and nothing invented.
        description = f"{name}. Category: {cat}."

        final_seed_rows.append({
            "stock_code": sc,
            "name": name,
            "category": cat,
            "price": price,
            "description": description,
            "stock_quantity": stock,
            "rating": rating,
        })

        category_map_rows.append({
            "stock_code": sc,
            "name": name,
            "category": cat,
        })

    # Save category_map.csv
    print(f"Saving {len(category_map_rows)} rows to {CATEGORY_MAP_CSV}...")
    with open(CATEGORY_MAP_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["stock_code", "name", "category"])
        writer.writeheader()
        writer.writerows(category_map_rows)

    # Save catalog_seed.csv
    print(f"Saving {len(final_seed_rows)} rows to {CATALOG_SEED_CSV}...")
    with open(CATALOG_SEED_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["stock_code", "name", "category", "price", "description", "stock_quantity", "rating"]
        )
        writer.writeheader()
        writer.writerows(final_seed_rows)

    # Report Category Distribution
    cat_dist = Counter(r["category"] for r in final_seed_rows)
    print("\n" + "=" * 60)
    print("CATEGORY DISTRIBUTION IN catalog_seed.csv:")
    print("=" * 60)
    for cat, count in sorted(cat_dist.items(), key=lambda x: x[1], reverse=True):
        print(f"  {cat:20s}: {count:4d} ({count / len(final_seed_rows) * 100:.1f}%)")
    print(f"  {'TOTAL':20s}: {len(final_seed_rows):4d}")

    # Random sample of 30 items for review
    review_rng = random.Random(12345)
    sample_30 = review_rng.sample(final_seed_rows, min(30, len(final_seed_rows)))
    print("\n" + "=" * 80)
    print("RANDOM SAMPLE OF 30 ITEMS FOR REVIEW:")
    print("=" * 80)
    print(f"{'StockCode':10s} | {'Category':18s} | {'Price ($)':9s} | {'Rating':6s} | {'Stock':5s} | Name")
    print("-" * 80)
    for r in sample_30:
        print(f"{r['stock_code']:10s} | {r['category']:18s} | ${r['price']:7.2f} | {r['rating']:6.1f} | {r['stock_quantity']:5d} | {r['name']}")
    print("=" * 80)

if __name__ == "__main__":
    main()
