-- 0010 — Asegurar que admin pueda ver paseadores asignados a paseos publicos
-- Bug reportado: admin sube paseo a publico, paseador lo agarra, admin no ve quien

-- 1. Asegurar que existen las funciones SECURITY DEFINER (bypass RLS)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_walker()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'paseador');
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','paseador'));
$$;

-- 2. Reescribir profiles_staff_read sin recursion
-- (la version vieja usaba 'exists (select from profiles)' que causaba recursion infinita)
drop policy if exists "profiles_staff_read" on public.profiles;
create policy "profiles_staff_read" on public.profiles
  for select using (public.is_staff());

-- 3. Politica explicita: admin lee todos los profiles siempre
drop policy if exists "profiles_admin_read_all" on public.profiles;
create policy "profiles_admin_read_all" on public.profiles
  for select using (public.is_admin());
