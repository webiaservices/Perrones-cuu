-- ============================================================
-- 0021: aceptación del manual de paseadores
--
-- Endy lo pidió como respaldo del negocio: si un paseador incumple una
-- regla de operación, queda constancia de que la leyó y cuándo.
--
-- Se guarda también la VERSIÓN aceptada. Si el manual cambia y se sube
-- MANUAL_VERSION en lib/manual-paseadores.ts, a los que aceptaron la
-- versión vieja les vuelve a aparecer para aceptar la nueva — sin borrar
-- el registro anterior, que sigue siendo la constancia de ese momento.
--
-- Es aditiva: correr ANTES de desplegar el código nuevo.
-- ============================================================

alter table public.profiles
  add column if not exists manual_accepted_at timestamptz,
  add column if not exists manual_version text;

-- ---------- Guarda de integridad ----------
-- profiles_self_update deja al paseador editar su propia fila, así que sin
-- esto podría antedatar su aceptación desde la consola del navegador y
-- destruir el valor probatorio del registro. La fecha la pone el servidor.
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

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists guard_profile_update_trg on public.profiles;
create trigger guard_profile_update_trg
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============================================================
-- Comprobación:
--   select full_name, manual_version, manual_accepted_at
--   from public.profiles where role = 'paseador' order by manual_accepted_at desc nulls last;
-- ============================================================
