-- Migration number: 0004 — theoretical unit value for zero-price lines (replacements of defective parts).
-- Only used for costing / sale pricing in Productos; unit_price_cents (the order price) is not touched.
ALTER TABLE order_lines ADD COLUMN theoretical_cost_cents INTEGER CHECK (theoretical_cost_cents IS NULL OR theoretical_cost_cents >= 0);
ALTER TABLE order_lines ADD COLUMN theoretical_currency TEXT CHECK (theoretical_currency IS NULL OR theoretical_currency IN ('EUR','USD'));
