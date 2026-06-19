-- 0012 — Agrupar paseos recurrentes en una sola tarjeta visual
-- Bug reportado: paseo semanal se ve como 5 filas separadas en admin/paseador/dueño

alter table public.reservations add column if not exists package_id uuid;
alter table public.reservations add column if not exists package_index int;
alter table public.reservations add column if not exists package_total int;

create index if not exists reservations_package_idx on public.reservations (package_id);

-- Permitir DELETE en reservas canceladas
drop policy if exists "reservations_admin_delete" on public.reservations;
create policy "reservations_admin_delete" on public.reservations
  for delete using (public.is_admin());

drop policy if exists "reservations_owner_delete_cancelled" on public.reservations;
create policy "reservations_owner_delete_cancelled" on public.reservations
  for delete using (auth.uid() = user_id and status = 'cancelada');
