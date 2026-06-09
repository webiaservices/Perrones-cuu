-- 0008 — Fecha de nacimiento del paseador
alter table public.profiles add column if not exists birth_date date;

-- Actualizar trigger pa guardar birth_date al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, role, zone, available_hours, bank_name, bank_clabe, bank_account, birth_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.raw_user_meta_data->>'role', '')::user_role, 'dueno'::user_role),
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
