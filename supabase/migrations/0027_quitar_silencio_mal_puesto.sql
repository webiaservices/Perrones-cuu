-- ============================================================
-- 0027 — Quitarle el silencio a los paseadores mal marcados
--
-- Correr DESPUÉS de desplegar el webhook nuevo (el que ya no cuenta 63049,
-- 63032 ni 63016 como número malo). Con el código viejo vivo, estos números
-- volverían a recibir el aviso masivo y a quedar silenciados otra vez.
-- Es re-ejecutable: el respaldo se conserva y el UPDATE vuelve a atrapar a
-- quien se haya re-silenciado por esos mismos códigos.
-- ============================================================

-- El webhook contaba como "número malo" cualquier falla. Tres códigos no lo
-- son: 63049 (Meta decidió no entregar un mensaje de marketing), 63032 (una
-- limitación de WhatsApp de ese usuario) y 63016 (texto libre fuera de la
-- ventana de 24 h: falla del emisor). Por eso 20 de los 28 silenciados tenían
-- un teléfono válido, incluidos 2 de los paseadores que sí toman paseos.
-- Se respalda antes de tocar nada.
create table if not exists public.respaldo_wa_rebotes_20260924 as
  select id, wa_rebotes, wa_ultimo_rebote_at, wa_ultimo_error
    from public.profiles
   where wa_rebotes >= 2;
-- Sin políticas: nadie la lee desde el navegador (tiene teléfonos de paseadores)
alter table public.respaldo_wa_rebotes_20260924 enable row level security;

update public.profiles
   set wa_rebotes = 0
 where wa_rebotes >= 2
   and split_part(coalesce(wa_ultimo_error, ''), ' ', 1) in ('63049', '63032', '63016');
