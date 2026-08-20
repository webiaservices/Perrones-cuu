-- ============================================================
-- 0022: soporte para los avisos automáticos por tiempo
--
-- El cron corre cada 15 minutos. Sin una marca de "ya se mandó", un paseo
-- sin cubrir generaría 8 mensajes por hora al mismo cliente. Estas columnas
-- son el candado: se escriben junto con el envío y el cron filtra por ellas.
--
-- El trigger se REDEFINE conservando íntegra la lógica de la 0014 (reglas de
-- transición de estado por rol, campos de dinero intocables). Lo único que
-- cambia es que la lista de campos protegidos crece con las marcas nuevas.
-- Se conserva a propósito el nombre trg_guard_reservation_update: con otro
-- nombre quedarían DOS triggers peleándose sobre la misma tabla.
--
-- Es aditiva: correr ANTES de desplegar el código nuevo.
-- ============================================================

alter table public.reservations
  add column if not exists sin_cubrir_avisado_at timestamptz,
  add column if not exists recordatorio_paseador_at timestamptz,
  add column if not exists resena_solicitada_at timestamptz,
  add column if not exists pago_vencido_avisos int not null default 0,
  add column if not exists pago_vencido_ultimo_at timestamptz;

-- ---------- Índices ----------
-- El cron corre cada 15 min; sin esto barre la tabla completa cada vez.
create index if not exists reservations_cron_pendientes_idx
  on public.reservations (scheduled_at)
  where status in ('buscando_paseador', 'confirmada');

create index if not exists reservations_cron_pago_idx
  on public.reservations (scheduled_at)
  where payment_status = 'pendiente';

-- ---------- Trigger guardián (0014 + columnas nuevas) ----------
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
     -- Marcas de los avisos automáticos (migración 0022): las escribe SOLO
     -- el cron con service role. Si el navegador pudiera moverlas, un cliente
     -- podría silenciarse sus propios avisos o forzar reenvíos.
     or new.sin_cubrir_avisado_at is distinct from old.sin_cubrir_avisado_at
     or new.recordatorio_paseador_at is distinct from old.recordatorio_paseador_at
     or new.resena_solicitada_at is distinct from old.resena_solicitada_at
     or new.pago_vencido_avisos is distinct from old.pago_vencido_avisos
     or new.pago_vencido_ultimo_at is distinct from old.pago_vencido_ultimo_at
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
-- Comprobación:
--   select id, scheduled_at, sin_cubrir_avisado_at, recordatorio_paseador_at
--   from public.reservations order by scheduled_at desc limit 5;
-- ============================================================
