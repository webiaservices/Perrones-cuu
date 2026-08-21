-- ============================================================
-- 0023 — Dejar de mandarle WhatsApp a números que rebotan
-- ============================================================
--
-- POR QUÉ: el 19 de agosto salieron 42 mensajes en un día, casi todos en el
-- mismo segundo, y 35 rebotaron (números sin WhatsApp, apagados o inválidos).
-- Al día siguiente Meta tumbó la cuenta. Un negocio que manda decenas de
-- mensajes de golpe y del que el 87% rebota se ve, para Meta, exactamente
-- igual que un spammer.
--
-- Con esto el sistema aprende: si un número rebota dos veces, se deja de
-- intentar hasta que alguien lo corrija en el panel. Así la reputación del
-- número no se quema sola.

alter table public.profiles
  add column if not exists wa_rebotes int not null default 0,
  add column if not exists wa_ultimo_rebote_at timestamptz,
  add column if not exists wa_ultimo_error text;

comment on column public.profiles.wa_rebotes is
  'Rebotes seguidos de WhatsApp a este número. A partir de 2 se deja de intentar.';
comment on column public.profiles.wa_ultimo_error is
  'Último motivo que devolvió Meta, para que el admin sepa qué corregir.';

-- Para que "a quién sí le mando" no tenga que leer toda la tabla
create index if not exists profiles_wa_sanos_idx
  on public.profiles (id)
  where wa_rebotes < 2;

-- ---------- Guardián de profiles (0021 + columnas nuevas) ----------
-- Se reconstruye completo a partir de 0021 para no perder nada de lo de antes.
-- Las columnas wa_* las escribe SOLO el webhook con service role: si el
-- navegador pudiera moverlas, un paseador se descontaría sus propios rebotes
-- y forzaría que el sistema le siguiera mandando mensajes que rebotan.
create or replace function public.guard_profile_update()
returns trigger as $$
declare
  es_admin boolean;
begin
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) into es_admin;

  if es_admin then
    return new;
  end if;

  -- Service role (rutas del servidor y el webhook de Twilio): sin restricción
  if auth.uid() is null then
    return new;
  end if;

  -- El correo lo mandan los triggers de auth, no el navegador
  new.email := old.email;
  -- El rol tampoco se auto-asciende
  new.role := old.role;

  -- La aceptación del manual solo avanza, nunca se borra ni se reescribe
  -- con una fecha inventada: el timestamp lo pone la base, no el cliente.
  if new.manual_accepted_at is distinct from old.manual_accepted_at then
    if new.manual_accepted_at is null then
      -- intento de borrar la constancia
      new.manual_accepted_at := old.manual_accepted_at;
      new.manual_version := old.manual_version;
    else
      new.manual_accepted_at := now();
    end if;
  end if;

  -- El contador de rebotes no se toca desde el navegador
  new.wa_rebotes := old.wa_rebotes;
  new.wa_ultimo_rebote_at := old.wa_ultimo_rebote_at;
  new.wa_ultimo_error := old.wa_ultimo_error;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists guard_profile_update_trg on public.profiles;
create trigger guard_profile_update_trg
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Comprobación rápida después de correrla:
--   select id, phone, wa_rebotes, wa_ultimo_error from public.profiles
--   where wa_rebotes > 0 order by wa_ultimo_rebote_at desc;

-- ---------- Funciones que usa el webhook ----------
-- Van como RPC y no como update directo porque el webhook solo conoce el
-- teléfono, no el id del perfil, y así la lógica de "cuántos van" vive en un
-- solo lugar.

create or replace function public.registrar_rebote_wa(tel text, motivo text)
returns void as $$
declare
  limpio text := regexp_replace(tel, '\D', '', 'g');
begin
  -- Se compara por los últimos 10 dígitos: en la base los teléfonos están
  -- guardados de varias formas (con +52, con 52, con 521, o pelones).
  update public.profiles
     set wa_rebotes = wa_rebotes + 1,
         wa_ultimo_rebote_at = now(),
         wa_ultimo_error = left(motivo, 200)
   where right(regexp_replace(phone, '\D', '', 'g'), 10) = right(limpio, 10);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.limpiar_rebotes_wa(tel text)
returns void as $$
declare
  limpio text := regexp_replace(tel, '\D', '', 'g');
begin
  update public.profiles
     set wa_rebotes = 0,
         wa_ultimo_error = null
   where right(regexp_replace(phone, '\D', '', 'g'), 10) = right(limpio, 10)
     and wa_rebotes > 0;
end;
$$ language plpgsql security definer set search_path = public;

-- Solo el servidor las llama, nunca el navegador
revoke all on function public.registrar_rebote_wa(text, text) from public, anon, authenticated;
revoke all on function public.limpiar_rebotes_wa(text) from public, anon, authenticated;
