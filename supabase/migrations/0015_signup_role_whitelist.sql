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
