-- 0013 — Ganancia del admin editable por paseo
-- Cada reservación puede tener su propio admin_fee custom.
-- Si es NULL, se usa el commission_pct global del admin (por default).

alter table public.reservations add column if not exists admin_fee_mxn int;
