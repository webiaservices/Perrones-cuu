-- ============================================================
-- 0006 — Cambios pedidos por el cliente (junio 2026)
-- ============================================================

-- 1. Tabla DOGS: comportamiento, enfermedad, distancias largas
alter table public.dogs add column if not exists behavior text;
alter table public.dogs add column if not exists illness text;
alter table public.dogs add column if not exists long_distance boolean default false;

-- 2. Tabla PROFILES: cuenta de banco para paseadores
alter table public.profiles add column if not exists bank_account text;
alter table public.profiles add column if not exists bank_name text;
alter table public.profiles add column if not exists bank_clabe text;

-- 3. Tabla RESERVATIONS:
-- - visibility: 'pending_admin' (recién creada, espera aprobación) | 'public' (disponible para paseadores)
-- - payment_status: pendiente | pagado
-- - cancelled_at: cuando dueño cancela
alter table public.reservations add column if not exists visibility text default 'pending_admin'
  check (visibility in ('pending_admin','public'));
alter table public.reservations add column if not exists payment_status text default 'pendiente'
  check (payment_status in ('pendiente','pagado'));
alter table public.reservations add column if not exists cancelled_at timestamptz;
alter table public.reservations add column if not exists responsibility_accepted boolean default false;
alter table public.reservations add column if not exists payment_reminded_at timestamptz;

-- Trigger: leer los campos de banco al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, role, zone, available_hours, bank_name, bank_clabe, bank_account)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'role', '')::user_role,
      'dueno'::user_role
    ),
    new.raw_user_meta_data->>'zone',
    coalesce(new.raw_user_meta_data->'available_hours', '{}'::jsonb),
    new.raw_user_meta_data->>'bank_name',
    new.raw_user_meta_data->>'bank_clabe',
    new.raw_user_meta_data->>'bank_account'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    zone = excluded.zone,
    available_hours = excluded.available_hours,
    bank_name = excluded.bank_name,
    bank_clabe = excluded.bank_clabe,
    bank_account = excluded.bank_account;
  return new;
exception when others then
  raise warning 'handle_new_user error: %', SQLERRM;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Política: paseador solo ve reservas PÚBLICAS en su zona
-- (sobreescribe la política anterior que mostraba todas las buscando_paseador)
drop policy if exists "reservations_walker_accept" on public.reservations;
create policy "reservations_walker_accept" on public.reservations
  for update using (
    walker_id is null
    and status = 'buscando_paseador'
    and visibility = 'public'
    and public.is_walker()
  );
