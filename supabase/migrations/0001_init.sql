-- ============================================================
-- Perrones Cuu — schema inicial
-- Crea: profiles, reservations, contracts, reviews
-- + enum de roles, trigger para crear profile al registrarse, RLS
-- ============================================================

-- 1. Enum de roles
do $$ begin
  create type user_role as enum ('dueno', 'paseador', 'admin');
exception when duplicate_object then null; end $$;

-- 2. PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role user_role not null default 'dueno',
  zone text,
  available_hours jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_staff_read" on public.profiles;
create policy "profiles_staff_read" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('paseador','admin')
    )
  );

-- 3. Trigger: crear profile al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone, role, zone, available_hours)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'dueno'),
    new.raw_user_meta_data->>'zone',
    coalesce(new.raw_user_meta_data->'available_hours', '{}'::jsonb)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. RESERVATIONS
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_name text not null,
  dogs_count int not null default 1,
  price_mxn numeric not null,
  status text not null default 'buscando_paseador'
    check (status in ('buscando_paseador','confirmada','en_curso','completada','cancelada','sin_asignar')),
  notes text,
  created_at timestamptz default now()
);

alter table public.reservations enable row level security;

drop policy if exists "reservations_owner_read" on public.reservations;
create policy "reservations_owner_read" on public.reservations
  for select using (auth.uid() = user_id);

drop policy if exists "reservations_owner_insert" on public.reservations;
create policy "reservations_owner_insert" on public.reservations
  for insert with check (auth.uid() = user_id);

drop policy if exists "reservations_staff_all" on public.reservations;
create policy "reservations_staff_all" on public.reservations
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('paseador','admin')
    )
  );

-- 5. CONTRACTS
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('cliente','paseador')),
  version text not null default 'v1',
  accepted_at timestamptz default now()
);

alter table public.contracts enable row level security;

drop policy if exists "contracts_self_read" on public.contracts;
create policy "contracts_self_read" on public.contracts
  for select using (auth.uid() = user_id);

drop policy if exists "contracts_self_insert" on public.contracts;
create policy "contracts_self_insert" on public.contracts
  for insert with check (auth.uid() = user_id);

drop policy if exists "contracts_staff_read" on public.contracts;
create policy "contracts_staff_read" on public.contracts
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 6. REVIEWS
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

alter table public.reviews enable row level security;

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
  for select using (true);

drop policy if exists "reviews_owner_insert" on public.reviews;
create policy "reviews_owner_insert" on public.reviews
  for insert with check (auth.uid() = owner_id);

drop policy if exists "reviews_owner_update" on public.reviews;
create policy "reviews_owner_update" on public.reviews
  for update using (auth.uid() = owner_id);

-- ============================================================
-- LISTO. Si todo corre sin errores, las tablas ya existen.
-- ============================================================
