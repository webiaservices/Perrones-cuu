-- ============================================================
-- 0016 — Borrar un perro ya no truena
--
-- reservations.dog_id apuntaba a dogs(id) sin ON DELETE, así que un perro
-- que ya tuvo cualquier paseo era imborrable para siempre (error crudo de
-- Postgres en un alert). Las reservas guardan el nombre del perro aparte
-- (dog_name), así que el historial no pierde nada.
-- ============================================================

alter table public.reservations drop constraint if exists reservations_dog_id_fkey;
alter table public.reservations
  add constraint reservations_dog_id_fkey
  foreign key (dog_id) references public.dogs(id) on delete set null;
