-- ============================================================
-- 0004 — El dueño puede actualizar (cancelar) sus propias reservas
-- ============================================================

drop policy if exists "reservations_owner_update" on public.reservations;
create policy "reservations_owner_update" on public.reservations
  for update using (auth.uid() = user_id);
