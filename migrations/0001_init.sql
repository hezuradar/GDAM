-- Migration number: 0001 — initial schema (same model as the original on-device database).
-- Amounts are integer cents; exchange rates are "1 EUR = X USD" * 1e6; dates are ISO text.

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('borrador','confirmado','enviado','recibido','cancelado')),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','USD')),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  shipping_currency TEXT NOT NULL CHECK (shipping_currency IN ('EUR','USD')),
  customs_cents INTEGER NOT NULL DEFAULT 0 CHECK (customs_cents >= 0),
  customs_currency TEXT NOT NULL CHECK (customs_currency IN ('EUR','USD')),
  fx_rate_micros INTEGER CHECK (fx_rate_micros IS NULL OR fx_rate_micros > 0),
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  piece_type TEXT NOT NULL,
  measurements TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0),
  raw_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('EUR','USD')),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL,
  fx_rate_micros INTEGER CHECK (fx_rate_micros IS NULL OR fx_rate_micros > 0),
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

CREATE INDEX idx_orders_supplier ON orders(supplier_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_lines_order ON order_lines(order_id, position);
CREATE INDEX idx_payments_order ON payments(order_id);
