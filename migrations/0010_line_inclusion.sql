-- Migration number: 0010 — lines left out of an order and substitutions.
-- is_excluded = 1: the supplier did not send it (or it was swapped); the line is kept but no longer
-- counts in totals, payments, reception or product costs.
-- substitutes_line_id: the line this one replaces (a substitution agreed with the supplier).
ALTER TABLE order_lines ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0 CHECK (is_excluded IN (0, 1));
ALTER TABLE order_lines ADD COLUMN substitutes_line_id INTEGER REFERENCES order_lines(id) ON DELETE SET NULL;
