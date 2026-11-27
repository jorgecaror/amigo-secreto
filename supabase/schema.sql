-- =====================================================================================
-- Amigo Secreto — esquema de Supabase (D12–D14). Ejecutar completo en: SQL Editor → New query.
-- Es idempotente: se puede volver a ejecutar sin perder datos.
--
-- Principios:
--   * Solo se guardan LISTAS (nombres, exclusiones, evento) e HISTORIAL (fecha + cantidad).
--     Nunca resultados del sorteo, links ni códigos.
--   * Row Level Security: cada usuario solo ve y modifica sus propias filas.
--   * El rol anon (visitante sin sesión) no tiene acceso a ninguna tabla.
-- =====================================================================================

-- ---------- Tablas ----------
create table if not exists public.listas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre        text not null check (char_length(btrim(nombre)) between 1 and 80),
  participantes jsonb not null check (jsonb_typeof(participantes) = 'array'
                                      and jsonb_array_length(participantes) between 3 and 100),
  exclusiones   jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusiones) = 'array'
                                      and jsonb_array_length(exclusiones) <= 200),
  evento        jsonb not null default '{}'::jsonb check (jsonb_typeof(evento) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint listas_tamano_max check (
    pg_column_size(participantes) + pg_column_size(exclusiones) + pg_column_size(evento) <= 32768)
);
create index if not exists listas_user_updated_idx on public.listas (user_id, updated_at desc);

create table if not exists public.sorteos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lista_id      uuid references public.listas (id) on delete set null,
  participantes integer not null check (participantes between 3 and 100),
  created_at    timestamptz not null default now()
);
create index if not exists sorteos_user_created_idx on public.sorteos (user_id, created_at desc);
create index if not exists sorteos_lista_idx on public.sorteos (lista_id);

-- ---------- Permisos ----------
revoke all on public.listas  from anon, authenticated;
revoke all on public.sorteos from anon, authenticated;
grant select, insert, update, delete on public.listas  to authenticated;
grant select, insert, delete         on public.sorteos to authenticated;   -- el historial no se edita

alter table public.listas  enable row level security;
alter table public.sorteos enable row level security;

-- ---------- Políticas RLS ----------
drop policy if exists listas_select on public.listas;
drop policy if exists listas_insert on public.listas;
drop policy if exists listas_update on public.listas;
drop policy if exists listas_delete on public.listas;
create policy listas_select on public.listas for select to authenticated
  using ((select auth.uid()) = user_id);
create policy listas_insert on public.listas for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy listas_update on public.listas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy listas_delete on public.listas for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists sorteos_select on public.sorteos;
drop policy if exists sorteos_insert on public.sorteos;
drop policy if exists sorteos_delete on public.sorteos;
create policy sorteos_select on public.sorteos for select to authenticated
  using ((select auth.uid()) = user_id);
-- La lista referenciada (si hay) también debe ser del usuario: la FK por sí sola ignora RLS.
create policy sorteos_insert on public.sorteos for insert to authenticated
  with check ((select auth.uid()) = user_id
              and (lista_id is null or exists (
                    select 1 from public.listas l where l.id = lista_id and l.user_id = (select auth.uid()))));
create policy sorteos_delete on public.sorteos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- Triggers ----------
-- updated_at automático
create or replace function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists listas_updated_at on public.listas;
create trigger listas_updated_at before update on public.listas
  for each row execute function public.tocar_updated_at();

-- No permitir cambiar el dueño ni la fecha de creación.
create or replace function public.listas_inmutables() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'No se puede cambiar el dueño de la lista' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists listas_inmutables on public.listas;
create trigger listas_inmutables before update on public.listas
  for each row execute function public.listas_inmutables();

-- Límite de 50 listas por usuario (anti-abuso).
-- SECURITY INVOKER y por auth.uid() (no por new.user_id): un BEFORE trigger corre antes del WITH CHECK de RLS,
-- así que contar por new.user_id revelaría si OTRO usuario llegó al límite (SEGURIDAD.md H4).
-- El advisory lock serializa inserciones concurrentes del mismo usuario (evita pasarse del límite por carrera).
create or replace function public.limitar_listas() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  perform pg_advisory_xact_lock(hashtext('listas:' || coalesce(uid::text, '')));
  if (select count(*) from public.listas where user_id = uid) >= 50 then
    raise exception 'Llegaste al máximo de 50 listas guardadas. Borra alguna para guardar otra.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists listas_limite on public.listas;
create trigger listas_limite before insert on public.listas
  for each row execute function public.limitar_listas();

-- Historial: conservar solo los últimos 200 sorteos por usuario.
create or replace function public.recortar_historial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.sorteos
   where user_id = new.user_id
     and id in (select id from public.sorteos where user_id = new.user_id
                order by created_at desc offset 200);
  return null;
end $$;

drop trigger if exists sorteos_recorte on public.sorteos;
create trigger sorteos_recorte after insert on public.sorteos
  for each row execute function public.recortar_historial();

-- Las funciones de trigger no deben poder llamarse por la API.
revoke all on function public.tocar_updated_at()   from public, anon, authenticated;
revoke all on function public.listas_inmutables()  from public, anon, authenticated;
revoke all on function public.limitar_listas()     from public, anon, authenticated;
revoke all on function public.recortar_historial() from public, anon, authenticated;

-- ---------- Cupo de envío por correo (D20) ----------
-- Solo cuenta CUÁNTOS correos envió cada usuario y cuándo. Nunca destinatarios, links ni códigos.
-- La Edge Function `enviar-correo` inserta una fila por envío con el JWT del usuario (RLS aplica) antes de enviar.
create table if not exists public.envios_correo (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cantidad   integer not null check (cantidad between 1 and 100),
  creado_en  timestamptz not null default now()
);
create index if not exists envios_correo_user_idx  on public.envios_correo (user_id, creado_en desc);
create index if not exists envios_correo_fecha_idx on public.envios_correo (creado_en);

revoke all on public.envios_correo from anon, authenticated;
grant select, insert (cantidad) on public.envios_correo to authenticated;   -- no se edita ni se borra
alter table public.envios_correo enable row level security;

drop policy if exists envios_correo_select on public.envios_correo;
drop policy if exists envios_correo_insert on public.envios_correo;
create policy envios_correo_select on public.envios_correo for select to authenticated
  using ((select auth.uid()) = user_id);
create policy envios_correo_insert on public.envios_correo for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Máximo 200 correos por usuario en 24 horas. Mismo patrón que limitar_listas (H4): security invoker, por
-- auth.uid() y con advisory lock para que dos envíos simultáneos no se pasen del límite.
create or replace function public.limitar_envios_correo() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  usados integer;
begin
  perform pg_advisory_xact_lock(hashtext('correo:' || coalesce(uid::text, '')));
  select coalesce(sum(cantidad), 0) into usados from public.envios_correo
   where user_id = uid and creado_en > now() - interval '24 hours';
  if usados + new.cantidad > 200 then
    raise exception 'Llegaste al máximo de 200 correos en 24 horas (te quedan %). Envía el resto por WhatsApp o intenta mañana.',
      greatest(200 - usados, 0) using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists envios_correo_limite on public.envios_correo;
create trigger envios_correo_limite before insert on public.envios_correo
  for each row execute function public.limitar_envios_correo();

-- Limpieza: no guardar más de 30 días de registros de envío.
create or replace function public.recortar_envios_correo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.envios_correo where creado_en < now() - interval '30 days';
  return null;
end $$;

drop trigger if exists envios_correo_recorte on public.envios_correo;
create trigger envios_correo_recorte after insert on public.envios_correo
  for each statement execute function public.recortar_envios_correo();

revoke all on function public.limitar_envios_correo()  from public, anon, authenticated;
revoke all on function public.recortar_envios_correo() from public, anon, authenticated;

-- ---------- Eliminar mi cuenta ----------
-- security definer para poder borrar de auth.users; solo borra la fila del propio usuario.
-- El ON DELETE CASCADE elimina sus listas e historial.
create or replace function public.eliminar_mi_cuenta() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = 'P0001';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
