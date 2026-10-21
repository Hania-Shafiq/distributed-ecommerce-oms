# Catalog Expansion & Order Generation Behavior

## Overview

The catalog was successfully expanded from 10 baseline seed products to **408 products** using real item descriptions and unit prices sourced from the UCI Online Retail II dataset (`online_retail_II.xlsx`).

All products were classified into the system's 5 canonical categories:
- **Accessories**: 111 products (1 baseline + 110 imported)
- **Kitchen**: 107 products (2 baseline + 105 imported)
- **Furniture**: 76 products (1 baseline + 75 imported)
- **Sports & Outdoors**: 67 products (2 baseline + 65 imported)
- **Electronics**: 47 products (2 baseline + 45 imported)
- **Total**: 408 products

---

## Analysis of `datagen/generate_orders.py`

A thorough code audit of `datagen/generate_orders.py` was conducted to examine how synthetic orders are sampled and distributed across catalog items.

### Findings:
1. **Dynamic Catalog Loading**:
   In `fetch_catalog_models()` ([datagen/generate_orders.py#L83-L143](file:///C:/Users/11/3D%20Objects/Desktop/PROJ/distributed-ecommerce-oms/datagen/generate_orders.py#L83-L143)):
   ```python
   def fetch_catalog_models():
       conn = get_connection("products")
       cur = conn.cursor()
       cur.execute("SELECT id, name, category, price FROM products ORDER BY id")
       rows = cur.fetchall()
       conn.close()
   ```
   The engine **reads every single product** currently present in `products_db`. It does **not** restrict itself to product IDs 1–33.

2. **Within-Category Power-Law (Zipf) Weighting**:
   Products are grouped by category, and Zipf power-law weights ($w_i \propto i^{-s}$) are dynamically calculated across all $k$ product IDs available in that category:
   ```python
   pids = categories_data[cat]["pids"]
   k = len(pids)
   ranks = np.arange(1, k + 1, dtype=float)
   w = ranks ** (-ZIPF_S)
   w = w / w.sum()
   ```

---

## ⚠️ Important Warnings & Operational Guidance

> [!WARNING]
> **New Products Have No Historical Orders**
> Newly imported products (IDs 11–408) currently have **zero order items** in `orders_db`. As a consequence:
> 1. They will **not** appear in `/analytics/top-selling-products` (top-selling rankings remain dominated by existing seed products).
> 2. They will **not** contribute to historical revenue figures or order status counts in the Admin Analytics service.
> 3. They will **not** appear in co-purchase knowledge graphs (`recommendation-service`) until orders are placed for them.

> [!CAUTION]
> **Do NOT Regenerate Order Data Without Checking This First**
> Because `datagen/generate_orders.py` loads all products dynamically from `products_db`:
> - If `datagen/generate_orders.py` is executed in the expanded catalog state, it will distribute new synthetic orders across all 408 products.
> - This will shift order distributions away from the calibrated baseline fit report (`data/fit_report.json`), and may invalidate existing benchmark run comparisons that relied on the small catalog schema.
> - **Operational rule**: Always verify order generation configuration and target product pools before triggering data regeneration post-expansion.

---

## Artifacts Generated

1. `data/catalog/catalog_seed.csv`: 400 clean product rows with median USD price, deterministic ratings (3.0–5.0), stock (20–200), and canonical descriptions (`<name>. Category: <category>.`).
2. `data/catalog/category_map.csv`: Mapping of `StockCode`, `Name`, and classified `Category`.
3. `scripts/build_catalog_seed.py`: Deterministic parser and batch classifier for UCI Online Retail II.
4. `scripts/import_catalog.py`: Idempotent admin import script with atomic inventory rollback.
5. `scripts/eval_search.py` & `docs/SEARCH_EVAL.md`: Search benchmark evaluation report.
