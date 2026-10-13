-- Migration number: 0007 — reception check per line: how many pieces actually arrived.
-- NULL = not checked yet; equal to quantity = complete; less = missing pieces.
ALTER TABLE order_lines ADD COLUMN received_quantity REAL CHECK (received_quantity IS NULL OR received_quantity >= 0);
