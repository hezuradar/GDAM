-- Migration number: 0002 — failed sign-in attempts per client IP (brute-force protection).
CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
