-- 0011 — Desactivar auto-expire de paseos
-- Bug reportado: los paseos expiran automaticamente antes que los paseadores los acepten
-- Solucion: la funcion ya no hace nada (no-op). Solo el admin/dueño pueden cancelar.

create or replace function public.expire_unassigned_reservations(timeout_minutes int default 10080)
returns table(reservation_id uuid, zone text)
language plpgsql
security definer
as $$
begin
  -- No-op: los paseos ya no expiran automaticamente.
  -- Si quieres que expiren despues de 1 semana, baja timeout_minutes a 10080.
  return;
end;
$$;

-- Revivir los paseos que ya estan "sin_asignar" para que paseadores los puedan agarrar
update public.reservations
set status = 'buscando_paseador'
where status = 'sin_asignar'
  and walker_id is null
  and (scheduled_at is null or scheduled_at > now());
