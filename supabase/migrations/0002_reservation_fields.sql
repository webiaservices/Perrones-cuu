-- ============================================================
-- 0002 — Campos extra para reservations (paso 2: hora, lugar, perro)
-- Idempotente: usa "if not exists" para columnas, política y vista.
-- ============================================================

alter table public.reservations add column if not exists scheduled_at timestamptz;
alter table public.reservations add column if not exists scheduled_until timestamptz;
alter table public.reservations add column if not exists zone text;
alter table public.reservations add column if not exists pickup_address text;
alter table public.reservations add column if not exists dog_name text;
alter table public.reservations add column if not exists dog_size text;
alter table public.reservations add column if not exists dog_notes text;
alter table public.reservations add column if not exists walker_id uuid references public.profiles(id);

-- Índice útil para que el paseador busque jales en su zona
create index if not exists reservations_zone_status_idx
  on public.reservations (zone, status);

-- Política: paseador acepta jales sin paseador asignado
drop policy if exists "reservations_walker_accept" on public.reservations;
create policy "reservations_walker_accept" on public.reservations
  for update using (
    walker_id is null
    and status = 'buscando_paseador'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'paseador'
    )
  );
