-- =====================================================================
-- PERRONES — Candados de seguridad (aplicar DESPUÉS de que el deploy
-- de Vercel esté READY). Pega TODO esto en Supabase → SQL Editor → Run.
-- =====================================================================

-- ============================================================
-- 0014 — Seguridad de reservations
-- ⚠️ APLICAR DESPUÉS de deployar el código que incluye /api/crear-reserva
--
-- 1. El navegador ya NO inserta reservas directo (iba con el precio
--    calculado en el cliente → cualquiera podía insertar un VIP a $1).
--    Ahora inserta /api/crear-reserva con service role y precio oficial.
-- 2. El dueño solo puede CANCELAR su reserva (antes podía cambiarse
--    price_mxn, payment_status, etc. desde la consola del navegador).
-- 3. El paseador asignado puede avanzar estado (en_curso/completada) o
--    soltar el paseo — antes sus botones no persistían nada (0 filas).
-- ============================================================

-- 1. Cerrar el insert directo del navegador
drop policy if exists "reservations_owner_insert" on public.reservations;

-- 2. Dueño puede actualizar SUS filas (el trigger de abajo limita columnas)
drop policy if exists "reservations_owner_update" on public.reservations;
create policy "reservations_owner_update" on public.reservations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Paseador asignado puede actualizar SUS paseos (el trigger limita a qué)
drop policy if exists "reservations_walker_update" on public.reservations;
create policy "reservations_walker_update" on public.reservations
  for update using (public.is_walker() and walker_id = auth.uid())
  with check (public.is_walker() and (walker_id = auth.uid() or walker_id is null));

-- 4. Trigger guardián: columnas de dinero intocables para no-admins,
--    y transiciones de estado limitadas por rol
create or replace function public.guard_reservation_update()
returns trigger as $$
declare
  caller uuid := auth.uid();
  caller_role public.user_role;
begin
  -- Service role (rutas del servidor) y jobs: sin restricción
  if caller is null then
    return new;
  end if;

  select role into caller_role from public.profiles where id = caller;
  if caller_role = 'admin' then
    return new;
  end if;

  -- Campos de dinero/identidad/paquete: solo admin o servidor.
  -- package_total entra aquí porque es multiplicador del pago (fee × paseos).
  if new.price_mxn is distinct from old.price_mxn
     or new.payment_status is distinct from old.payment_status
     or new.admin_fee_mxn is distinct from old.admin_fee_mxn
     or new.user_id is distinct from old.user_id
     or new.plan_name is distinct from old.plan_name
     or new.dogs_count is distinct from old.dogs_count
     or new.scheduled_at is distinct from old.scheduled_at
     or new.scheduled_until is distinct from old.scheduled_until
     or new.payment_reminded_at is distinct from old.payment_reminded_at
     or new.package_id is distinct from old.package_id
     or new.package_index is distinct from old.package_index
     or new.package_total is distinct from old.package_total
  then
    raise exception 'No tienes permiso para modificar esos campos';
  end if;

  -- Dueño de la reserva: solo puede cancelar, y solo desde un estado no final
  if caller = old.user_id then
    if new.walker_id is distinct from old.walker_id
       or new.visibility is distinct from old.visibility then
      raise exception 'No tienes permiso para modificar esos campos';
    end if;
    if new.status is distinct from old.status then
      if new.status <> 'cancelada' then
        raise exception 'Solo puedes cancelar tu reserva';
      end if;
      if old.status not in ('buscando_paseador', 'confirmada') then
        raise exception 'No puedes cancelar un paseo % ', old.status;
      end if;
    end if;
    return new;
  end if;

  -- Paseador asignado: avanzar estado o soltar, solo desde estados válidos
  if caller_role = 'paseador' and old.walker_id = caller then
    -- avanzar estado: solo confirmada/en_curso → en_curso/completada
    if new.status in ('en_curso', 'completada')
       and old.status in ('confirmada', 'en_curso')
       and new.walker_id is not distinct from old.walker_id
       and new.visibility is not distinct from old.visibility then
      return new;
    end if;
    -- soltar: regresa al pool, pero NO si ya se completó
    if new.status = 'buscando_paseador' and new.walker_id is null
       and old.status in ('confirmada', 'en_curso') then
      return new;
    end if;
    raise exception 'Cambio de estado no permitido';
  end if;

  raise exception 'No tienes permiso para modificar esta reserva';
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_guard_reservation_update on public.reservations;
create trigger trg_guard_reservation_update
  before update on public.reservations
  for each row execute function public.guard_reservation_update();


-- ============================================================
-- 0015 — El registro público SOLO puede crear dueño o paseador
--
-- Antes: handle_new_user confiaba en el rol que mandaba el navegador
-- (raw_user_meta_data->>'role'), así que CUALQUIERA podía crearse una
-- cuenta admin con /signup?role=admin y ver los datos bancarios de los
-- paseadores. Los admin ahora solo se crean promoviendo a un usuario
-- existente desde el panel de admin (o desde el dashboard de Supabase).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, role, zone, available_hours, bank_name, bank_clabe, bank_account, birth_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    -- SOLO dueño o paseador desde el registro público. Nunca admin.
    case
      when new.raw_user_meta_data->>'role' = 'paseador' then 'paseador'::user_role
      else 'dueno'::user_role
    end,
    new.raw_user_meta_data->>'zone',
    coalesce(new.raw_user_meta_data->'available_hours', '{}'::jsonb),
    new.raw_user_meta_data->>'bank_name',
    new.raw_user_meta_data->>'bank_clabe',
    new.raw_user_meta_data->>'bank_account',
    nullif(new.raw_user_meta_data->>'birth_date', '')::date
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    zone = excluded.zone,
    available_hours = excluded.available_hours,
    bank_name = excluded.bank_name,
    bank_clabe = excluded.bank_clabe,
    bank_account = excluded.bank_account,
    birth_date = excluded.birth_date;
  return new;
exception when others then
  raise warning 'handle_new_user error: %', SQLERRM;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Revisa que no se haya colado ningún admin falso (corre esto y verifica
-- que reconozcas todas las cuentas):
--   select id, full_name, role, created_at from public.profiles where role = 'admin';


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
