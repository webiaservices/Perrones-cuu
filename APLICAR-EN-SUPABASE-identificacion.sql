-- ============================================================
-- 0020: correo del cliente visible en el panel + identificación oficial
--
-- 1) profiles.email — el correo vivía solo en auth.users, así que el panel
--    de admin no lo podía mostrar sin pegarle a la API de auth por cada
--    usuario. Se copia a profiles y se mantiene sincronizado.
--
-- 2) profiles.id_document_path — ruta del archivo de la identificación
--    (INE, pasaporte, licencia) dentro del bucket privado `identificaciones`.
--    NUNCA se guarda el archivo en la base, solo la ruta.
--
-- Es aditiva: correr ANTES de desplegar el código nuevo.
-- ============================================================

-- ---------- 1. Columnas ----------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists id_document_path text;

-- Backfill del correo de los usuarios que ya existen
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- ---------- 2. El trigger ahora guarda el correo ----------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, email, role, zone, available_hours, bank_name, bank_clabe, bank_account, birth_date, id_document_path)
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

-- Si el usuario cambia su correo desde Supabase Auth, que se refleje aquí
create or replace function public.sync_profile_email()
returns trigger as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'sync_profile_email error: %', SQLERRM;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ---------- 3. El dueño no debe poder cambiarse el correo a mano ----------
-- profiles_self_update deja al dueño editar su propia fila. Sin esto podría
-- escribir un email distinto al de su cuenta y romper la correspondencia.
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
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists guard_profile_update_trg on public.profiles;
create trigger guard_profile_update_trg
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- 4. Bucket privado para las identificaciones ----------
insert into storage.buckets (id, name, public)
values ('identificaciones', 'identificaciones', false)
on conflict (id) do update set public = false;

-- Cada quien sube la suya en una carpeta con su propio user id
drop policy if exists "ident_owner_insert" on storage.objects;
create policy "ident_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'identificaciones'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- El dueño puede ver/reemplazar la suya
drop policy if exists "ident_owner_read" on storage.objects;
create policy "ident_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'identificaciones'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );

drop policy if exists "ident_owner_update" on storage.objects;
create policy "ident_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'identificaciones'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Los paseadores NO tienen acceso: solo el dueño de la identificación y el admin.

-- ============================================================
-- Comprobación (opcional):
--   select id, full_name, email, id_document_path from public.profiles limit 10;
-- ============================================================
