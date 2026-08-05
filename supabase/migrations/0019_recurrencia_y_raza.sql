-- ============================================================
-- 0019 — Recurrencia del paseo y raza del perro en la reserva
--
-- 1. recurrencia: si el paseo se repite cada semana o es una sola vez.
--    Lo elige el dueño al reservar y el admin lo ve en su tabla.
-- 2. dog_breed: la raza ya estaba en la tabla `dogs`, pero no se copiaba a la
--    reserva. El admin y el paseador la necesitan de un vistazo.
-- ============================================================

alter table public.reservations
  add column if not exists recurrencia text
    check (recurrencia in ('una_vez', 'semanal'));

alter table public.reservations
  add column if not exists dog_breed text;

-- Los paseos que ya existen: los de paquete se marcan como semanales
-- (así se agendaban) y los sueltos como una sola vez.
update public.reservations
set recurrencia = case when package_id is not null then 'semanal' else 'una_vez' end
where recurrencia is null;
