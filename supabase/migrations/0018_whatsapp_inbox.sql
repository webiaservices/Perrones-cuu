-- ============================================================
-- 0018 — Bandeja de WhatsApp
--
-- Con la API de WhatsApp los mensajes que responden los clientes NO llegan a
-- ningún celular: llegan a un servidor. Aquí los guardamos para que el admin
-- los vea y conteste desde su panel.
-- ============================================================

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  -- Número del cliente, solo dígitos con lada (ej. 5216141234567)
  phone text not null,
  -- Nombre que trae WhatsApp del contacto (puede venir vacío)
  nombre text,
  -- 'entrante' = lo mandó el cliente · 'saliente' = lo mandó el negocio
  direccion text not null check (direccion in ('entrante', 'saliente')),
  texto text,
  -- ID del mensaje en el proveedor (para no duplicar)
  message_sid text unique,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_phone_idx
  on public.whatsapp_messages (phone, created_at desc);
create index if not exists whatsapp_messages_created_idx
  on public.whatsapp_messages (created_at desc);

alter table public.whatsapp_messages enable row level security;

-- Solo el admin puede leer/escribir. El webhook entra con service role
-- (bypassa RLS), así que no necesita política propia.
drop policy if exists "whatsapp_admin_all" on public.whatsapp_messages;
create policy "whatsapp_admin_all" on public.whatsapp_messages
  for all using (public.is_admin());
