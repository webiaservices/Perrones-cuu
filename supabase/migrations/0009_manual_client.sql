-- 0009 — Permitir paseos manuales sin cliente registrado
-- Para clientes mayores o sin email que llaman por telefono al admin
alter table public.reservations add column if not exists manual_client_name text;
alter table public.reservations add column if not exists manual_client_phone text;
