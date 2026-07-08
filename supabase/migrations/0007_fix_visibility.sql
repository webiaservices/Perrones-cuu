-- ============================================================
-- 0007 — Fix de privado/público
-- 1. Paseos viejos (ya confirmados/completados) deben estar como public
-- 2. RLS: paseador SOLO ve reservas public + las suyas
-- ============================================================

-- 1. Marcar como public todos los paseos que no estén buscando paseador
update public.reservations
set visibility = 'public'
where status in ('confirmada', 'en_curso', 'completada', 'cancelada', 'sin_asignar');

-- 2. Quitar la política antigua que dejaba al paseador ver todo
drop policy if exists "reservations_staff_all" on public.reservations;
drop policy if exists "reservations_walker_zone_read" on public.reservations;
drop policy if exists "reservations_admin_all" on public.reservations;
drop policy if exists "reservations_walker_select" on public.reservations;

-- 3. Admin sigue viendo todo
create policy "reservations_admin_all" on public.reservations
  for all using (public.is_admin());

-- 4. Paseador ve SOLO: las que tiene asignadas + las disponibles públicas
create policy "reservations_walker_select" on public.reservations
  for select using (
    public.is_walker() and (
      walker_id = auth.uid()
      or (visibility = 'public' and walker_id is null and status = 'buscando_paseador')
    )
  );
