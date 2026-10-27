-- Migration number: 0009 — date each order was received.
-- Set when the order moves to «recibido» and cleared if it leaves that status, so the app can show
-- how many days the order took to arrive.
ALTER TABLE orders ADD COLUMN received_date TEXT;

-- Backfill: orders already received get the day they were last updated (the closest record we have
-- of when they arrived), never earlier than the order date.
UPDATE orders SET received_date = max(order_date, date(updated_at)) WHERE status = 'recibido';
