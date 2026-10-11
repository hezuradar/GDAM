-- Migration number: 0003 — sale pricing per product line.
-- Either a sale price (in sale_currency) or a margin over landed cost (basis points, 2500 = 25 %).
ALTER TABLE order_lines ADD COLUMN sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0);
ALTER TABLE order_lines ADD COLUMN sale_currency TEXT CHECK (sale_currency IS NULL OR sale_currency IN ('EUR','USD'));
ALTER TABLE order_lines ADD COLUMN margin_bp INTEGER;
