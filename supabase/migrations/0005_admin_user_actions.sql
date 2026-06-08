-- ============================================================
-- 0005 — Acciones de admin sobre usuarios
-- ============================================================

-- Columna banned para suspender usuarios sin borrarlos
alter table public.profiles add column if not exists banned boolean not null default false;

-- Política: admin puede actualizar cualquier perfil (cambiar rol, banear, editar)
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin());

-- Política: admin puede insertar perfiles (para crear paseos en nombre del cliente)
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_admin());

-- Política: admin también puede insertar reservas en nombre de otros
drop policy if exists "reservations_admin_insert" on public.reservations;
create policy "reservations_admin_insert" on public.reservations
  for insert with check (public.is_admin());
