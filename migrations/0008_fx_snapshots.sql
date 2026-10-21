-- Migration number: 0008 — frozen exchange rates for every amount.
-- Each amount that keeps its own currency stores the rates that were in force when it was written
-- ("1 EUR = X USD" and "1 EUR = Y INR"), so its cost does not drift when the market moves.
-- NULL means "written before the rates were frozen": the amount then follows the market as before.
ALTER TABLE orders ADD COLUMN shipping_fx_rate_micros INTEGER CHECK (shipping_fx_rate_micros IS NULL OR shipping_fx_rate_micros > 0);
ALTER TABLE orders ADD COLUMN shipping_inr_rate_micros INTEGER CHECK (shipping_inr_rate_micros IS NULL OR shipping_inr_rate_micros > 0);
ALTER TABLE orders ADD COLUMN customs_fx_rate_micros INTEGER CHECK (customs_fx_rate_micros IS NULL OR customs_fx_rate_micros > 0);
ALTER TABLE orders ADD COLUMN customs_inr_rate_micros INTEGER CHECK (customs_inr_rate_micros IS NULL OR customs_inr_rate_micros > 0);
ALTER TABLE order_lines ADD COLUMN theoretical_fx_rate_micros INTEGER CHECK (theoretical_fx_rate_micros IS NULL OR theoretical_fx_rate_micros > 0);
ALTER TABLE order_lines ADD COLUMN theoretical_inr_rate_micros INTEGER CHECK (theoretical_inr_rate_micros IS NULL OR theoretical_inr_rate_micros > 0);
ALTER TABLE order_lines ADD COLUMN sale_fx_rate_micros INTEGER CHECK (sale_fx_rate_micros IS NULL OR sale_fx_rate_micros > 0);
ALTER TABLE order_lines ADD COLUMN sale_inr_rate_micros INTEGER CHECK (sale_inr_rate_micros IS NULL OR sale_inr_rate_micros > 0);
ALTER TABLE order_lines ADD COLUMN handling_fx_rate_micros INTEGER CHECK (handling_fx_rate_micros IS NULL OR handling_fx_rate_micros > 0);
ALTER TABLE order_lines ADD COLUMN handling_inr_rate_micros INTEGER CHECK (handling_inr_rate_micros IS NULL OR handling_inr_rate_micros > 0);
ALTER TABLE payments ADD COLUMN inr_rate_micros INTEGER CHECK (inr_rate_micros IS NULL OR inr_rate_micros > 0);

-- Backfill: the amounts that already exist are frozen with today's market rate. Their value does not
-- change (the market is the same rate that was used to read them) but from now on it does not drift.
CREATE TABLE _fx_backfill (usd_micros INTEGER NOT NULL, inr_micros INTEGER NOT NULL);
INSERT INTO _fx_backfill (usd_micros, inr_micros)
SELECT
  COALESCE((SELECT CASE WHEN CAST(s.value AS INTEGER) > 0 THEN CAST(s.value AS INTEGER) END FROM settings s WHERE s.key = 'fx_eur_usd_micros'), 1120000),
  COALESCE((SELECT CASE WHEN CAST(s.value AS INTEGER) > 0 THEN CAST(s.value AS INTEGER) END FROM settings s WHERE s.key = 'fx_eur_inr_micros'), 100000000);

UPDATE orders SET
  shipping_fx_rate_micros = (SELECT usd_micros FROM _fx_backfill),
  shipping_inr_rate_micros = (SELECT inr_micros FROM _fx_backfill),
  customs_fx_rate_micros = (SELECT usd_micros FROM _fx_backfill),
  customs_inr_rate_micros = (SELECT inr_micros FROM _fx_backfill);

UPDATE order_lines SET
  theoretical_fx_rate_micros = (SELECT usd_micros FROM _fx_backfill),
  theoretical_inr_rate_micros = (SELECT inr_micros FROM _fx_backfill),
  sale_fx_rate_micros = (SELECT usd_micros FROM _fx_backfill),
  sale_inr_rate_micros = (SELECT inr_micros FROM _fx_backfill),
  handling_fx_rate_micros = (SELECT usd_micros FROM _fx_backfill),
  handling_inr_rate_micros = (SELECT inr_micros FROM _fx_backfill);

-- payments.fx_rate_micros is the rate the user fixed for that payment and is left untouched;
-- only the rupee rate, which was always the market, gets frozen.
UPDATE payments SET inr_rate_micros = (SELECT inr_micros FROM _fx_backfill);

DROP TABLE _fx_backfill;
