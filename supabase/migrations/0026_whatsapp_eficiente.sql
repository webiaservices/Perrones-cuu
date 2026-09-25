-- ============================================================
-- 0026 — WhatsApp eficiente
--
-- POR QUÉ: medido del 25-ago al 24-sep-2026, el 93% de los WhatsApp pagados
-- era UN solo aviso: cada vacante salía a los 62 teléfonos de paseadores al
-- mismo tiempo. 57 de esos 62 nunca han tomado un paseo, y las vacantes de
-- CDMX les llegaban a los de Chihuahua. Además Meta ya trata ese aviso como
-- marketing (error 63049 en 21 paseadores), que cuesta 3.5 veces más que un
-- aviso normal y sube otro 30% el 1-oct-2026.
--
-- Con esto:
--   1. wa_envios: bitácora de TODO WhatsApp saliente. Antes no quedaba
--      registro de ninguna plantilla automática: nadie sabía cuánto se
--      mandaba ni a quién. También es el candado contra mandar dos veces lo
--      mismo (índice único sobre `clave`).
--   2. push_suscripciones: avisos gratis al celular del paseador (web push).
--   3. vacante_avisos + vacante_notificados: la vacante se anuncia en
--      oleadas. Primero gratis (push) a todos; por WhatsApp solo a los pocos
--      que sí toman paseos, y a más gente solo si nadie la tomó.
--   4. Reloj confiable: GitHub Actions corre el cron cada ~2.8 h en vez de
--      cada 15 min (243 corridas en 30 días). pg_cron lo llama desde aquí.
--
-- Es aditiva. Correr ANTES de desplegar el código nuevo (el código aguanta
-- que no exista, pero entonces no hay bitácora ni oleadas).
-- Quitarle el "silencio" a los paseadores mal marcados va aparte, en la 0027,
-- y se corre DESPUÉS de desplegar: con el código viejo vivo, esos 20 números
-- volverían a recibir el aviso masivo y a quedar silenciados.
-- ============================================================

-- ---------- 1. Bitácora de WhatsApp saliente ----------
create table if not exists public.wa_envios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plantilla text not null,              -- nombre de plantilla o 'texto_libre'
  telefono text not null,               -- solo dígitos, con lada
  profile_id uuid references public.profiles(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  -- Candado: dos envíos con la misma clave no pueden estar vivos a la vez.
  -- Ej. 'paseador_acepta|<paquete>|<teléfono>'. Nulo = sin candado.
  clave text,
  motivo text,                          -- para qué se mandó (ej. 'vacante ola 1')
  -- pendiente → enviado | error | saltado | simulado
  resultado text not null default 'pendiente'
    check (resultado in ('pendiente', 'enviado', 'error', 'saltado', 'simulado')),
  detalle text,
  message_sid text unique,
  -- Lo que Twilio avisa después: sent, delivered, read, failed, undelivered
  estado text,
  error_code text
);

-- El candado: solo cuenta lo que salió o está saliendo. Un error libera la
-- clave para que el siguiente intento pueda mandar.
create unique index if not exists wa_envios_clave_viva_idx
  on public.wa_envios (clave)
  where clave is not null and resultado in ('pendiente', 'enviado', 'simulado');

create index if not exists wa_envios_created_idx on public.wa_envios (created_at desc);
create index if not exists wa_envios_reserva_idx on public.wa_envios (reservation_id);

alter table public.wa_envios enable row level security;
drop policy if exists "wa_envios_admin_select" on public.wa_envios;
create policy "wa_envios_admin_select" on public.wa_envios
  for select using (public.is_admin());
-- Escribe solo el servidor (service role, que se salta RLS).

-- ---------- 2. Suscripciones a avisos del celular (web push) ----------
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  ultimo_ok_at timestamptz,
  fallas int not null default 0
);

create index if not exists push_suscripciones_profile_idx
  on public.push_suscripciones (profile_id);

alter table public.push_suscripciones enable row level security;
-- Cada quien ve las suyas (para que el panel sepa si ya activó); el admin,
-- todas. Altas y bajas pasan por /api/push con service role.
drop policy if exists "push_propias_select" on public.push_suscripciones;
create policy "push_propias_select" on public.push_suscripciones
  for select using (profile_id = auth.uid() or public.is_admin());

-- ---------- 3. Oleadas por vacante ----------
-- Una fila por vacante (el paseo 1 del paquete, o el paseo suelto).
create table if not exists public.vacante_avisos (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Cada vez que la vacante se vuelve a abrir (el paseador la soltó, o Endy
  -- la vuelve a publicar tiempo después) empieza un ciclo nuevo de avisos.
  ciclo int not null default 1,
  ola int not null default 0,
  ultima_ola_at timestamptz,
  -- Cuándo el reloj vio que alguien la tomó. Si después vuelve a quedar sin
  -- paseador (la soltó), el reloj arranca un ciclo nuevo solo.
  tomada_at timestamptz
);
alter table public.vacante_avisos add column if not exists ciclo int not null default 1;
alter table public.vacante_avisos add column if not exists tomada_at timestamptz;
-- El reloj busca las que les toca la siguiente ola
create index if not exists vacante_avisos_pendientes_idx
  on public.vacante_avisos (ultima_ola_at) where ola < 2;

-- A quién se le avisó y por qué canal. La llave primaria es el candado:
-- volver a publicar la vacante NO le vuelve a mandar a la misma persona.
create table if not exists public.vacante_notificados (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  canal text not null check (canal in ('push', 'whatsapp', 'correo')),
  ola int not null,
  ok boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (reservation_id, profile_id, canal)
);

alter table public.vacante_avisos enable row level security;
alter table public.vacante_notificados enable row level security;
drop policy if exists "vacante_avisos_admin" on public.vacante_avisos;
create policy "vacante_avisos_admin" on public.vacante_avisos
  for select using (public.is_admin());
drop policy if exists "vacante_notificados_admin" on public.vacante_notificados;
create policy "vacante_notificados_admin" on public.vacante_notificados
  for select using (public.is_admin());

-- ---------- 4. Reloj confiable para los avisos ----------
-- La llave se genera AQUÍ DENTRO y nunca sale de la base: pg_cron la manda
-- como Bearer y el endpoint la valida preguntándole a la base con
-- avisos_llave_valida(). Así no hay que copiar ningún secreto a ningún lado.
-- Como lo pide la documentación de Supabase
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'avisos_llave') then
    -- gen_random_uuid es del núcleo de Postgres: no depende de pgcrypto
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'avisos_llave');
  end if;
end $$;

create or replace function public.avisos_llave_valida(llave text)
returns boolean as $$
  select exists (
    select 1 from vault.decrypted_secrets
     where name = 'avisos_llave' and decrypted_secret = llave
  );
$$ language sql security definer set search_path = public, vault;

revoke all on function public.avisos_llave_valida(text) from public, anon, authenticated;
grant execute on function public.avisos_llave_valida(text) to service_role;

-- Si ya existía el trabajo (se corrió dos veces), se reemplaza
select cron.unschedule(jobid) from cron.job where jobname = 'avisos-perrones';
select cron.schedule(
  'avisos-perrones',
  '*/15 * * * *',
  $cron$
    select net.http_get(
      url := 'https://perronescuu.com/api/cron/avisos',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_llave')
      ),
      timeout_milliseconds := 60000
    );
  $cron$
);
