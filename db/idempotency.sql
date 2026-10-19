-- db/idempotency.sql
-- Partial unique index for order idempotency.
-- Executed independently out-of-band (CONCURRENTLY) to avoid locking production-scale tables.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
