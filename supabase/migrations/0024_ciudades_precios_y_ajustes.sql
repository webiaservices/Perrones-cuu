-- ============================================================
-- 0024 — Ciudad, precios editables, ajustes y datos del perro
-- ============================================================
--
-- Cubre las peticiones de Endy que necesitan base de datos:
--   · Ciudad (Chihuahua / CDMX) en perfiles y en cada reserva
--   · Precios editables desde el panel, por ciudad
--   · Pago al paseador en PESOS por paquete (ya no 70% automático)
--   · Interruptores del panel (registro de paseadores por ciudad, avisos)
--   · Lista de espera de paseadores donde el registro está cerrado
--   · Antecedentes de conducta del perro
--   · Foto de la fachada, privada y solo para el paseador asignado
--
-- Los precios que ya cobró un cliente NO se tocan: cada reserva guarda su
-- price_mxn desde el día uno y todo el sistema lee ese valor, nunca la lista.

-- ---------- 1. Ciudad ----------
alter table public.profiles
  add column if not exists city text not null default 'chihuahua';
alter table public.reservations
  add column if not exists city text not null default 'chihuahua';

comment on column public.profiles.city is 'chihuahua | cdmx';
comment on column public.reservations.city is
  'Ciudad con la que se cotizó este paseo. Se congela junto con price_mxn.';

create index if not exists reservations_city_idx on public.reservations (city, status);

-- ---------- 2. Datos del perro ----------
alter table public.dogs
  add column if not exists has_bitten boolean,
  add column if not exists aggression_details text;

comment on column public.dogs.has_bitten is
  'Si ha mordido o mostrado conductas agresivas. NULL = todavía no contestado.';

-- ---------- 3. Foto de la fachada ----------
-- Privada: solo la ve el paseador YA asignado a ese paseo, nunca el resto.
alter table public.reservations
  add column if not exists house_photo_path text;

insert into storage.buckets (id, name, public)
values ('fachadas', 'fachadas', false)
on conflict (id) do update set public = false;

-- ---------- 4. Precios editables, por ciudad ----------
create table if not exists public.precios (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  plan_name text not null,
  dogs int not null check (dogs between 1 and 3),
  price_mxn int not null check (price_mxn >= 0),
  updated_at timestamptz not null default now(),
  unique (city, plan_name, dogs)
);

alter table public.precios enable row level security;

-- Cualquiera puede LEER (la página de precios es pública); solo admin escribe.
drop policy if exists precios_lectura_publica on public.precios;
create policy precios_lectura_publica on public.precios for select using (true);

drop policy if exists precios_solo_admin_escribe on public.precios;
create policy precios_solo_admin_escribe on public.precios for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- 5. Pago al paseador, en pesos por paquete ----------
-- El 70% automático no servía: el reparto cambia según paquete y cliente.
-- Esto define el default; cada paseo se puede sobrescribir a mano como hoy
-- (reservations.admin_fee_mxn sigue mandando cuando existe).
create table if not exists public.pagos_paseador (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  plan_name text not null,
  dogs int not null check (dogs between 1 and 3),
  walker_mxn int not null check (walker_mxn >= 0),
  updated_at timestamptz not null default now(),
  unique (city, plan_name, dogs)
);

alter table public.pagos_paseador enable row level security;

-- El paseador necesita leerlo para ver cuánto gana; solo admin lo edita.
drop policy if exists pagos_lectura on public.pagos_paseador;
create policy pagos_lectura on public.pagos_paseador for select
  using (auth.uid() is not null);

drop policy if exists pagos_solo_admin_escribe on public.pagos_paseador;
create policy pagos_solo_admin_escribe on public.pagos_paseador for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- 6. Ajustes del panel (interruptores) ----------
create table if not exists public.ajustes (
  clave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ajustes enable row level security;

drop policy if exists ajustes_lectura_publica on public.ajustes;
create policy ajustes_lectura_publica on public.ajustes for select using (true);

drop policy if exists ajustes_solo_admin_escribe on public.ajustes;
create policy ajustes_solo_admin_escribe on public.ajustes for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into public.ajustes (clave, valor) values
  ('registro_paseadores_chihuahua', 'true'::jsonb),
  ('registro_paseadores_cdmx',      'false'::jsonb),
  ('aviso_rutas_panel_cliente',     'true'::jsonb)
on conflict (clave) do nothing;

-- ---------- 7. Lista de espera de paseadores ----------
create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  city text not null,
  nombre text,
  telefono text,
  created_at timestamptz not null default now()
);

alter table public.lista_espera enable row level security;

-- Cualquiera puede apuntarse (el formulario es público); solo admin la lee.
drop policy if exists lista_espera_alta_publica on public.lista_espera;
create policy lista_espera_alta_publica on public.lista_espera for insert with check (true);

drop policy if exists lista_espera_solo_admin_lee on public.lista_espera;
create policy lista_espera_solo_admin_lee on public.lista_espera for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- 8. El trigger de alta tiene que copiar la ciudad ----------
-- Copiado TAL CUAL de 0020, sumando solo `city`. Se respeta pieza por pieza:
--   · el CASE del rol, que impide registrarse como admin desde el navegador
--   · el ON CONFLICT DO UPDATE (no DO NOTHING), que es como se completa el
--     perfil cuando el alta llega en dos pasos
--   · el coalesce que no borra la identificación ya subida
--   · el EXCEPTION final, que evita que un error aquí tumbe el registro
-- Si este trigger falla, NINGÚN registro nuevo crea perfil.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, email, role, zone, city, available_hours, bank_name, bank_clabe, bank_account, birth_date, id_document_path)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new.email,
    -- SOLO dueño o paseador desde el registro público. Nunca admin.
    case
      when new.raw_user_meta_data->>'role' = 'paseador' then 'paseador'::user_role
      else 'dueno'::user_role
    end,
    new.raw_user_meta_data->>'zone',
    -- Igual que el rol: solo se aceptan las ciudades conocidas
    case
      when new.raw_user_meta_data->>'city' = 'cdmx' then 'cdmx'
      else 'chihuahua'
    end,
    coalesce(new.raw_user_meta_data->'available_hours', '{}'::jsonb),
    new.raw_user_meta_data->>'bank_name',
    new.raw_user_meta_data->>'bank_clabe',
    new.raw_user_meta_data->>'bank_account',
    nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    nullif(new.raw_user_meta_data->>'id_document_path', '')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    role = excluded.role,
    zone = excluded.zone,
    city = excluded.city,
    available_hours = excluded.available_hours,
    bank_name = excluded.bank_name,
    bank_clabe = excluded.bank_clabe,
    bank_account = excluded.bank_account,
    birth_date = excluded.birth_date,
    -- si el registro no mandó identificación, no borrar la que ya estaba
    id_document_path = coalesce(excluded.id_document_path, public.profiles.id_document_path);
  return new;
exception when others then
  raise warning 'handle_new_user error: %', SQLERRM;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 9. El guardián de profiles no deja mover la ciudad desde el navegador ----------
-- Se reconstruye a partir de 0023 sumando city.
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

  if auth.uid() is null then
    return new;
  end if;

  new.email := old.email;
  new.role := old.role;

  if new.manual_accepted_at is distinct from old.manual_accepted_at then
    if new.manual_accepted_at is null then
      new.manual_accepted_at := old.manual_accepted_at;
      new.manual_version := old.manual_version;
    else
      new.manual_accepted_at := now();
    end if;
  end if;

  new.wa_rebotes := old.wa_rebotes;
  new.wa_ultimo_rebote_at := old.wa_ultimo_rebote_at;
  new.wa_ultimo_error := old.wa_ultimo_error;

  -- La ciudad define el precio: si el navegador pudiera cambiarla, un cliente
  -- se movería a la ciudad más barata.
  new.city := old.city;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists guard_profile_update_trg on public.profiles;
create trigger guard_profile_update_trg
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- 10. Comprobación ----------
--   select clave, valor from public.ajustes;
--   select city, count(*) from public.precios group by city;

-- ---------- 11. Semilla: las dos ciudades arrancan con los precios de hoy ----------
-- Endy: "CDMX los mismos que Chihuahua por ahora, lo importante es que sean
-- editables". Se siembran iguales y desde el panel se separan cuando quiera.
insert into public.precios (city, plan_name, dogs, price_mxn) values
  ('chihuahua', 'Paseo de 1 día',  1,  250),
  ('chihuahua', 'Paseo de 1 día',  2,  300),
  ('chihuahua', 'Paseo de 1 día',  3,  350),
  ('chihuahua', 'Paseo de 3 días', 1,  500),
  ('chihuahua', 'Paseo de 3 días', 2,  600),
  ('chihuahua', 'Paseo de 3 días', 3,  700),
  ('chihuahua', 'Paseo semanal',   1,  700),
  ('chihuahua', 'Paseo semanal',   2,  900),
  ('chihuahua', 'Paseo semanal',   3, 1000),
  ('chihuahua', 'Paseo VIP',       1,  950),
  ('chihuahua', 'Paseo VIP',       2, 1300),
  ('chihuahua', 'Paseo VIP',       3, 1700),
  ('cdmx',      'Paseo de 1 día',  1,  250),
  ('cdmx',      'Paseo de 1 día',  2,  300),
  ('cdmx',      'Paseo de 1 día',  3,  350),
  ('cdmx',      'Paseo de 3 días', 1,  500),
  ('cdmx',      'Paseo de 3 días', 2,  600),
  ('cdmx',      'Paseo de 3 días', 3,  700),
  ('cdmx',      'Paseo semanal',   1,  700),
  ('cdmx',      'Paseo semanal',   2,  900),
  ('cdmx',      'Paseo semanal',   3, 1000),
  ('cdmx',      'Paseo VIP',       1,  950),
  ('cdmx',      'Paseo VIP',       2, 1300),
  ('cdmx',      'Paseo VIP',       3, 1700)
on conflict (city, plan_name, dogs) do nothing;

-- Pago al paseador: se siembra con el 70% de hoy para no cambiarle el trato a
-- nadie de golpe. Endy lo ajusta paquete por paquete desde el panel.
insert into public.pagos_paseador (city, plan_name, dogs, walker_mxn) values
  ('chihuahua', 'Paseo de 1 día',  1,  175),
  ('chihuahua', 'Paseo de 1 día',  2,  210),
  ('chihuahua', 'Paseo de 1 día',  3,  245),
  ('chihuahua', 'Paseo de 3 días', 1,  350),
  ('chihuahua', 'Paseo de 3 días', 2,  420),
  ('chihuahua', 'Paseo de 3 días', 3,  490),
  ('chihuahua', 'Paseo semanal',   1,  490),
  ('chihuahua', 'Paseo semanal',   2,  630),
  ('chihuahua', 'Paseo semanal',   3,  700),
  ('chihuahua', 'Paseo VIP',       1,  665),
  ('chihuahua', 'Paseo VIP',       2,  910),
  ('chihuahua', 'Paseo VIP',       3, 1190),
  ('cdmx',      'Paseo de 1 día',  1,  175),
  ('cdmx',      'Paseo de 1 día',  2,  210),
  ('cdmx',      'Paseo de 1 día',  3,  245),
  ('cdmx',      'Paseo de 3 días', 1,  350),
  ('cdmx',      'Paseo de 3 días', 2,  420),
  ('cdmx',      'Paseo de 3 días', 3,  490),
  ('cdmx',      'Paseo semanal',   1,  490),
  ('cdmx',      'Paseo semanal',   2,  630),
  ('cdmx',      'Paseo semanal',   3,  700),
  ('cdmx',      'Paseo VIP',       1,  665),
  ('cdmx',      'Paseo VIP',       2,  910),
  ('cdmx',      'Paseo VIP',       3, 1190)
on conflict (city, plan_name, dogs) do nothing;
