-- Migration number: 0005 — Indian rupee (INR) as a third currency.
-- SQLite cannot alter CHECK constraints, so orders, order_lines and payments are rebuilt.
-- Order matters: the new child tables reference orders_new, and the old child tables are
-- dropped before the old orders table, so no ON DELETE CASCADE ever fires on real data.
PRAGMA defer_foreign_keys = true;

CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('borrador','confirmado','enviado','recibido','cancelado')),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','USD','INR')),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  shipping_currency TEXT NOT NULL CHECK (shipping_currency IN ('EUR','USD','INR')),
  customs_cents INTEGER NOT NULL DEFAULT 0 CHECK (customs_cents >= 0),
  customs_currency TEXT NOT NULL CHECK (customs_currency IN ('EUR','USD','INR')),
  fx_rate_micros INTEGER CHECK (fx_rate_micros IS NULL OR fx_rate_micros > 0),
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO orders_new (id, supplier_id, order_date, status, currency, shipping_cents, shipping_currency, customs_cents,
  customs_currency, fx_rate_micros, carrier, tracking_number, notes, created_at, updated_at)
SELECT id, supplier_id, order_date, status, currency, shipping_cents, shipping_currency, customs_cents,
  customs_currency, fx_rate_micros, carrier, tracking_number, notes, created_at, updated_at
FROM orders;

CREATE TABLE order_lines_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders_new(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  piece_type TEXT NOT NULL,
  measurements TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0),
  raw_text TEXT NOT NULL DEFAULT '',
  sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0),
  sale_currency TEXT CHECK (sale_currency IS NULL OR sale_currency IN ('EUR','USD','INR')),
  margin_bp INTEGER,
  theoretical_cost_cents INTEGER CHECK (theoretical_cost_cents IS NULL OR theoretical_cost_cents >= 0),
  theoretical_currency TEXT CHECK (theoretical_currency IS NULL OR theoretical_currency IN ('EUR','USD','INR'))
);
INSERT INTO order_lines_new (id, order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text,
  sale_price_cents, sale_currency, margin_bp, theoretical_cost_cents, theoretical_currency)
SELECT id, order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text,
  sale_price_cents, sale_currency, margin_bp, theoretical_cost_cents, theoretical_currency
FROM order_lines;

CREATE TABLE payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders_new(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','USD','INR')),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL,
  fx_rate_micros INTEGER CHECK (fx_rate_micros IS NULL OR fx_rate_micros > 0),
  note TEXT NOT NULL DEFAULT ''
);
INSERT INTO payments_new (id, order_id, amount_cents, currency, paid_on, method, fx_rate_micros, note)
SELECT id, order_id, amount_cents, currency, paid_on, method, fx_rate_micros, note
FROM payments;

-- Children first: nothing references them, and afterwards nothing references the old orders.
DROP TABLE order_lines;
DROP TABLE payments;
DROP TABLE orders;

-- Renaming orders_new also rewrites the REFERENCES clauses of the new child tables.
ALTER TABLE orders_new RENAME TO orders;
ALTER TABLE order_lines_new RENAME TO order_lines;
ALTER TABLE payments_new RENAME TO payments;

CREATE INDEX idx_orders_supplier ON orders(supplier_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_lines_order ON order_lines(order_id, position);
CREATE INDEX idx_payments_order ON payments(order_id);
