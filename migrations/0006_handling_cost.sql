-- Migration number: 0006 — handling cost per unit before selling (cleaning, cutting, packing…).
-- Added to the landed cost in Productos; it does not change the order or its total.
ALTER TABLE order_lines ADD COLUMN handling_cost_cents INTEGER CHECK (handling_cost_cents IS NULL OR handling_cost_cents >= 0);
ALTER TABLE order_lines ADD COLUMN handling_currency TEXT CHECK (handling_currency IS NULL OR handling_currency IN ('EUR','USD','INR'));
