-- ============================================================
-- 0003 — Tabla de perros + soporte para reasignación + setting admin email
-- ============================================================

-- 1. Tabla DOGS (gestión de mascotas)
create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  breed text,
  age int,
  size text check (size in ('pequeno','mediano','grande')),
  notes text,
  special_needs text,
  photo_url text,
  created_at timestamptz default now()
);

alter table public.dogs enable row level security;

drop policy if exists "dogs_owner_all" on public.dogs;
create policy "dogs_owner_all" on public.dogs
  for all using (auth.uid() = owner_id);

drop policy if exists "dogs_staff_read" on public.dogs;
create policy "dogs_staff_read" on public.dogs
  for select using (public.is_staff());

create index if not exists dogs_owner_idx on public.dogs (owner_id);

-- 2. Agregar columna dog_id a reservations (opcional — link al perro guardado)
alter table public.reservations add column if not exists dog_id uuid references public.dogs(id);

-- 3. Agregar columnas para tracking de notificación admin
alter table public.reservations add column if not exists admin_notified_at timestamptz;

-- 4. Función helper: marcar reservas viejas como sin_asignar
create or replace function public.expire_unassigned_reservations(timeout_minutes int default 10)
returns table(reservation_id uuid, zone text)
language plpgsql
security definer
as $$
begin
  return query
  update public.reservations
  set status = 'sin_asignar', admin_notified_at = now()
  where status = 'buscando_paseador'
    and walker_id is null
    and created_at < now() - (timeout_minutes || ' minutes')::interval
    and admin_notified_at is null
  returning id, public.reservations.zone;
end;
$$;
