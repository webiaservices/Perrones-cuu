-- ============================================================
-- 0025 — Documentar commission_pct y limpiar datos raros
-- ============================================================
--
-- commission_pct existe en la base y se lee y escribe desde el panel, pero
-- NUNCA estuvo en una migración: alguien la agregó a mano. Si se recreara la
-- base desde cero, el guardado de la comisión fallaría en silencio.
--
-- El nombre engaña: NO es un porcentaje, es una cantidad en PESOS. Se queda
-- así para no romper el código que ya la usa, pero queda documentado.

alter table public.profiles
  add column if not exists commission_pct int;

comment on column public.profiles.commission_pct is
  'MAL NOMBRADA: no es porcentaje, es la comisión del admin en PESOS que se '
  'estampa en cada paseo que él crea a mano. Vacía = 30% del total. '
  'Desde 0024 el reparto normal sale de la tabla pagos_paseador.';

-- ---------- Comisión guardada en días que no llevan precio ----------
-- En un paquete, el precio va solo en el primer día y los demás quedan en 0.
-- La comisión se estaba copiando a TODOS los días: no cobra de más (la
-- fórmula la topa al precio, y con precio 0 da 0), pero al leer la tabla
-- parece que el admin gana una comisión por cada día del paquete.
update public.reservations
   set admin_fee_mxn = null
 where admin_fee_mxn is not null
   and coalesce(price_mxn, 0) = 0;

-- Comprobación:
--   select count(*) from public.reservations
--   where admin_fee_mxn is not null and coalesce(price_mxn,0) = 0;  -- debe dar 0
