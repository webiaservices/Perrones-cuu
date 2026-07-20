-- ============================================================
-- 0017 — Reseñas moderadas y sin necesidad de reservar
--
-- - approved: la reseña solo aparece en la página cuando el admin la aprueba.
-- - reviewer_name / dog_name: para reseñas que no vienen de un paseo
--   (el cliente escribe su nombre y el de su perro).
-- - reservation_id ya era opcional, así que una reseña puede existir sin paseo.
-- - RLS: el público solo lee las aprobadas; el admin lee todas y puede aprobar.
-- ============================================================

alter table public.reviews add column if not exists approved boolean not null default false;
alter table public.reviews add column if not exists reviewer_name text;
alter table public.reviews add column if not exists dog_name text;

-- El público solo ve reseñas aprobadas
drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
  for select using (approved = true);

-- El admin ve TODAS (para moderar)
drop policy if exists "reviews_admin_read" on public.reviews;
create policy "reviews_admin_read" on public.reviews
  for select using (public.is_admin());

-- Quitar la política vieja que dejaba al DUEÑO actualizar su reseña: sin ella
-- un cliente podía editar su propia fila y ponerse approved=true, saltándose
-- la moderación. Ahora SOLO el admin puede actualizar (aprobar).
drop policy if exists "reviews_owner_update" on public.reviews;

-- El admin puede aprobar / editar reseñas
drop policy if exists "reviews_admin_update" on public.reviews;
create policy "reviews_admin_update" on public.reviews
  for update using (public.is_admin());

-- El admin puede borrar reseñas (spam / falsas)
drop policy if exists "reviews_admin_delete" on public.reviews;
create policy "reviews_admin_delete" on public.reviews
  for delete using (public.is_admin());

-- El dueño puede leer sus propias reseñas (para ver el estado)
drop policy if exists "reviews_owner_read" on public.reviews;
create policy "reviews_owner_read" on public.reviews
  for select using (auth.uid() = owner_id);

-- Reseña con sesión, pero SIEMPRE entra como pendiente (approved=false).
-- Así un cliente no puede auto-aprobarse la reseña metiendo approved=true
-- desde la consola del navegador — solo el admin aprueba (policy de arriba).
drop policy if exists "reviews_owner_insert" on public.reviews;
create policy "reviews_owner_insert" on public.reviews
  for insert with check (auth.uid() = owner_id and approved = false);
