# Synthetic Data Generation — Changes & Deviations from Olist Real Data

This document records all deliberate modifications, rescalings, mappings, and synthetic augmentations applied on top of the raw Olist dataset for the OMS synthetic data generation engine (`datagen/generate_orders.py`).

---

## 1. Scale & Volume Rescaling
* **Real Olist Baseline**: 99,441 orders recorded over 772 calendar days (average rate: $\lambda \approx 0.0894$ orders/minute).
* **Synthetic Modification**: Scaled to target volume $N$ (e.g. $N = 1,000,000$ or $N = 50,000,000$) distributed over a 24-month horizon (730 days).
* **Rationale**: Recreates the operational scale and query stress of an enterprise e-commerce platform while keeping empirical arrival rhythms.

## 2. Chronological Date Shift
* **Real Olist Baseline**: Historical Brazilian e-commerce orders spanning September 2016 through October 2018.
* **Synthetic Modification**: Shifted to a rolling 24-month window terminating at the present date (October 2024 to October 2026).
* **Rationale**: Enables realistic contemporary date filtering, recent order lookups, and analytics dashboards in the live OMS.

## 3. User Base & Orders-Per-User Scaling
* **Real Olist Baseline**: Mean of $1.035$ orders per user, with $96.88\%$ of users being strictly one-time buyers.
* **Synthetic Modification**: Rescaled user base to $U \approx N / 40$ users (25,000 users for 1M orders; 1,250,000 users for 50M orders). The distribution maintains the heavy-tailed Pareto power-law shape ($\alpha \approx 1.0256, x_m = 1$), resulting in a mean of $\approx 40$ orders/user.
* **Rationale**: High-volume load testing and recommendation graph traversals require recurring user histories (repeat buyers, recurring shopping baskets) rather than an extreme single-purchase churn model.

## 4. Status Mapping & Transient `PENDING` Folding
* **Real Olist Baseline**: Statuses include `delivered`, `shipped`, `invoiced`, `approved`, `canceled`, `unavailable`, and $0.31\%$ in `created`/`processing`.
* **Synthetic Modification**:
  - `delivered`, `shipped`, `invoiced`, `approved` $\to$ `CONFIRMED`
  - `canceled`, `unavailable` $\to$ `FAILED`
  - `created`, `processing` (proxy for `PENDING`): Folded proportionally into `CONFIRMED` ($98.76\%$) and `FAILED` ($1.24\%$).
* **Rationale**: Inspection of `order-service/saga.py` confirms that `PENDING` is a transient state during synchronous SAGA execution. In steady-state operation, orders stored in `orders_db` resolve to either `CONFIRMED` or `FAILED`.

## 5. Pricing & Product Catalog Realignment
* **Real Olist Baseline**: Real Brazilian Real (BRL) price points across 32,951 distinct products, with prices ranging from fractions of a Real to several thousand.
* **Synthetic Modification**: Prices are fetched directly from our active PostgreSQL `products_db` catalog (33 products across 5 categories, prices ranging from $29.99 to $999.00). Each order item's `unit_price` strictly mirrors its catalog price, and `total_amount` is calculated as $\sum (\text{quantity} \times \text{unit\_price})$.
* **Rationale**: Eliminates cross-currency discrepancies and ensures transactional consistency between `product-service` and `order-service`.

## 6. Two-Stage Category $\to$ Product Sampling
* **Real Olist Baseline**: Over 70 granular categories across 32k products.
* **Synthetic Modification**: Consolidated into OMS's 5 core categories (`Accessories` 28.3%, `Furniture` 21.8%, `Sports & Outdoors` 20.7%, `Electronics` 17.9%, `Kitchen` 11.2%). Sampling uses a two-stage process:
  1. Draw category according to Olist category proportions.
  2. Draw product within category according to within-category Zipf rank weights ($s = 0.8387$).
* **Rationale**: Resolves the category traffic skew bug where a single global Zipf index artificially allocated 52% of orders to Electronics.

## 7. Intra-Hour Random Noise
* **Real Olist Baseline**: Hourly arrival timestamps aggregate into discrete hourly buckets.
* **Synthetic Modification**: Within each sampled `(day, hour)` interval, minute ($0 \dots 59$), second ($0 \dots 59$), and microsecond offsets are uniformly randomized.
* **Rationale**: Prevents artificial micro-burst clustering on the top of each hour and provides smooth, continuous temporal distribution.

## 8. Shared Precomputed Bcrypt Hash for Synthetic Users
* **Synthetic Modification**: All synthetic users (`syn_*`) share a single precomputed bcrypt hash (`$2b$12$...`) rather than computing individual salts and hashes per user.
* **Rationale**: Hashing 25,000 (or 1.25M) users on CPU using bcrypt cost factor 12 would take hours of compute time during data generation without adding value for synthetic test accounts.

## 9. Orders-Per-User Truncated Lognormal Model (Replacing Pure Pareto)
* **Problem**: Pure Pareto distribution ($\alpha = 1.0256$) produces extreme heavy-tail variance with an unbounded maximum. In earlier test runs, the single top user absorbed over 524,617 orders ($52.5\%$ of the total dataset), which is highly unrealistic for an operational e-commerce OMS.
* **Mathematical Derivation & Scaling Factor**:
  - The theoretical unconstrained expected value of $\text{Lognormal}(\mu=1.0, \sigma=1.7)$ is:
    $$E[X] = \exp\left(\mu + \frac{\sigma^2}{2}\right) = \exp\left(1.0 + \frac{1.7^2}{2}\right) = \exp(2.445) \approx 11.5306$$
  - When samples are clipped to $[1.0, 2000.0]$, the continuous clipped expectation is $E[X_{\text{clipped}}] \approx 11.6082$.
  - Target enterprise operations require $N = 50,000,000$ orders across $U = 1,250,000$ users, giving a target mean of $\bar{Y} = N / U = 40.0$ orders/user.
  - Allocation probability weights $p_i = X_i / \sum_{j=1}^U X_j$ are multiplied by $N$. Because $\sum X_j \approx U \cdot E[X_{\text{clipped}}]$, the expected discrete allocation for each user is:
    $$E[\text{Orders}_i] = N \cdot \frac{X_i}{U \cdot E[X_{\text{clipped}}]} = \left(\frac{N/U}{E[X_{\text{clipped}}]}\right) X_i = S \cdot X_i$$
  - The **effective scaling factor** is:
    $$S = \frac{40.0}{11.6082} \approx 3.4454$$
    This preserves the relative lognormal shape and heavy tail across the entire customer base while elevating the population mean from $11.61$ to $40.0$.
  - A strict hard cap of $2,000$ orders per user is enforced, with residual discrete counts balanced across eligible non-capped users.
* **Real 50M Database Measurements & Theoretical Validation**:
  - **Validation Context**: This validates the data generator implementation against its intended mathematical scaled truncated model, **not against raw Olist data** (Olist is ~97% one-time buyers with mean 1.035, so target mean ~40 is a documented enterprise scale-up assumption).
  - **Sample Size & P-Value Note**: With $N = 1,250,249$ real user samples, statistical p-values are not meaningful (converging to 0.0 for any discrete boundary effect); the earlier claim of $p = 0.99999$ cannot be reproduced mathematically.
  - **Kolmogorov-Smirnov Statistic**: Against the true scaled, truncated, and discretized pipeline ($S = 3.4454$, hard cap $= 2000$), the KS statistic is **$D = 0.024346$** (the earlier reported $D = 0.287241$ was computed against the raw unscaled model).

| Metric | Measured (50M DB) | Theoretical Model | Delta |
|:---|:---:|:---:|:---:|
| **Mean (orders/user)** | 40.00 | 38.84 | +1.16 |
| **Median ($p_{50}$)** | 9.0 | 9.0 | 0.0 (Exact Match) |
| **90th Percentile ($p_{90}$)** | 86.0 | 83.0 | +3.0 |
| **99th Percentile ($p_{99}$)** | 503.0 | 489.0 | +14.0 |
| **Maximum (Cap)** | 2,000 | 2,000 | 0 (Strict Cap Respected) |
| **Top 1% User Share** | 23.69% | 23.85% | -0.16% |

  - **Distribution Plot**: `data/fit_report/06_orders_per_user_truncated_lognormal.png`


