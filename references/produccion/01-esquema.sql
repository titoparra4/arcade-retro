-- ============================================================================
-- ARCADE RETRO — Esquema completo para un proyecto Supabase nuevo
-- ============================================================================
--
-- Reconstruido a partir del estado REAL del proyecto de desarrollo
-- (pg_policies, information_schema.role_table_grants, pg_get_functiondef...),
-- no a partir de los specs. Equivale a las 7 migraciones de
-- `supabase/migrations/`, comprimidas en un solo archivo idempotente.
--
-- SOLO PARA EL PRIMER DESPLIEGUE. Es el baseline de un proyecto vacío. Los
-- cambios POSTERIORES no se añaden aquí: son archivos nuevos en
-- `supabase/migrations/` que se aplican en orden encima de este baseline.
-- El paso 9 registra las 7 versiones para que producción sepa dónde está parada.
--
-- CÓMO EJECUTARLO
--   Dashboard de Supabase (proyecto de PRODUCCIÓN) → SQL Editor → pegar todo → Run.
--   Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- ORDEN
--   Los pasos van numerados y el orden IMPORTA. En particular, el paso 7
--   (grants) tiene que ir después de crear las tablas: Supabase concede por
--   defecto los 7 privilegios a anon/authenticated sobre toda tabla nueva en
--   `public`, y ese paso es el que los recorta.
--
-- DESPUÉS
--   1. Ejecutar 02-datos-games.sql  (catálogo de juegos)
--   2. Ejecutar 03-verificacion.sql (comprobar que todo quedó como debe)
--   3. Seguir RUNBOOK.md            (config de auth y OAuth — no se puede por SQL)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. TABLAS
-- ----------------------------------------------------------------------------

-- Catálogo de juegos. Dato de configuración: se rellena con 02-datos-games.sql
-- y crece una fila por cada juego nuevo que se añade con /add-game.
create table if not exists public.games (
  id         text primary key,
  title      text not null,
  short      text not null,
  long       text not null,
  cat        text not null check (cat = any (array['ARCADE','PUZZLE','SHOOTER','VERSUS'])),
  cover      text not null,
  color      text not null check (color = any (array['cyan','magenta','yellow','green'])),
  created_at timestamptz not null default now()
);

-- Puntuaciones. `user_id` es la única columna nullable del esquema: nace NULL
-- y se rellena al guardar la partida; si la cuenta se borra, la puntuación
-- sobrevive de forma anónima (ON DELETE SET NULL).
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  game_id     text not null references public.games (id),
  player_name text not null check (char_length(player_name) >= 1 and char_length(player_name) <= 10),
  score       integer not null check (score >= 0 and score <= 100000000),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null
);

-- Perfil público de cada cuenta. La PK es la propia id de auth.users, así que
-- la relación es 1:1 y borrar la cuenta borra el perfil (ON DELETE CASCADE).
-- `player_name` es el nombre que aparece en el leaderboard: único y en
-- mayúsculas, dígitos, guion y guion bajo, máximo 10 caracteres.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  player_name text not null unique check (player_name ~ '^[A-Z0-9_-]{1,10}$'),
  created_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2. ÍNDICES
-- ----------------------------------------------------------------------------

-- Sirve al "top N de un juego": getTopScores() en lib/supabase/games.ts.
create index if not exists scores_game_id_score_idx
  on public.scores (game_id, score desc);

-- ÚNICA DIFERENCIA DELIBERADA CON DESARROLLO.
-- El advisor de rendimiento marcó scores_user_id_fkey como foreign key sin
-- índice (ver references/security/audits/2026-07-28-auditoria.md, hallazgo de
-- rendimiento #1). En dev quedó propuesto y sin aplicar; aquí se aplica desde
-- el principio, que sobre una tabla vacía no cuesta nada.
create index if not exists scores_user_id_idx
  on public.scores (user_id);


-- ----------------------------------------------------------------------------
-- 3. FUNCIONES SECURITY DEFINER
-- ----------------------------------------------------------------------------

-- Crea el perfil automáticamente al registrarse, leyendo el player_name que
-- el formulario mete en raw_user_meta_data.
--
-- El `if coalesce(...) <> ''` es lo que hace funcionar OAuth (SPEC 14): quien
-- entra con Google o GitHub no trae player_name, así que NO se le crea perfil
-- aquí — lo elige después en /auth/completar-perfil, y esa inserción la cubre
-- la policy profiles_insert_own.
--
-- `search_path = ''` obliga a cualificar cada nombre con su esquema y evita
-- que un objeto malicioso en otro esquema secuestre la función.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(new.raw_user_meta_data->>'player_name', '') <> '' then
    insert into public.profiles (id, player_name)
    values (new.id, new.raw_user_meta_data->>'player_name');
  end if;
  return new;
end;
$function$;

-- Red de seguridad de la SPEC 15: activa RLS automáticamente en cualquier tabla
-- que se cree en `public`, para que nunca nazca una tabla desprotegida por
-- descuido. Se dispara con el event trigger `ensure_rls` (paso 4).
--
-- OJO: activa RLS, pero NO recorta los grants. Ver la nota final del archivo.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog','information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
        cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;


-- ----------------------------------------------------------------------------
-- 4. TRIGGERS
-- ----------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();


-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.games    enable row level security;
alter table public.scores   enable row level security;
alter table public.profiles enable row level security;


-- ----------------------------------------------------------------------------
-- 6. POLICIES
-- ----------------------------------------------------------------------------
--
-- Dos reglas que se respetan en las seis:
--   · Siempre `to anon, authenticated` — nunca el rol `public`, que incluiría
--     roles internos de Postgres.
--   · Siempre `(select auth.uid())` y no `auth.uid()` a secas: el envoltorio
--     hace que el planner lo evalúe una vez por consulta en lugar de una vez
--     por fila.
--
-- No hay ninguna policy de DELETE en ninguna tabla: nada se borra desde la app.

-- games: catálogo público, solo lectura.
drop policy if exists games_select_public on public.games;
create policy games_select_public on public.games
  for select to anon, authenticated
  using (true);

-- scores: leaderboard público.
drop policy if exists scores_select_public on public.scores;
create policy scores_select_public on public.scores
  for select to anon, authenticated
  using (true);

-- scores: solo puedes insertar TU puntuación, y con TU nombre.
-- La segunda condición es la que impide firmar una partida con el nombre de
-- otro jugador: fuerza que player_name sea el del perfil de quien inserta.
drop policy if exists scores_insert_own on public.scores;
create policy scores_insert_own on public.scores
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and player_name = (select player_name from public.profiles where id = (select auth.uid()))
  );

-- profiles: los nombres son públicos (se muestran en el leaderboard).
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (true);

-- profiles: alta del propio perfil. Es el camino de OAuth, donde
-- handle_new_user() no creó nada por venir sin player_name.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- profiles: cada quien edita el suyo.
-- Sin WITH CHECK explícito, igual que en dev: Postgres reutiliza el USING, así
-- que tampoco se puede reasignar la fila a otro id. Revisado y aceptado en la
-- auditoría del 2026-07-28.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()));


-- ----------------------------------------------------------------------------
-- 7. GRANTS  ← EL PASO CRÍTICO
-- ----------------------------------------------------------------------------
--
-- Supabase concede por defecto los 7 privilegios (SELECT, INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER) a anon y authenticated sobre toda
-- tabla nueva en `public`. Sin este bloque, las tablas quedan con permisos de
-- escritura abiertos y RLS es lo único que las protege.
--
-- Con este bloque hay DOS capas: un intento de escritura no autorizada muere
-- en los grants, antes siquiera de que RLS entre a evaluar.
--
-- Este es exactamente el bloque que en desarrollo se ejecutó a mano en el SQL
-- Editor y no dejó registro de migración.

revoke all on public.games    from anon, authenticated;
revoke all on public.scores   from anon, authenticated;
revoke all on public.profiles from anon, authenticated;

-- Lectura pública en las tres tablas.
grant select on public.games    to anon, authenticated;
grant select on public.scores   to anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- Escritura mínima, solo para quien ha iniciado sesión.
grant insert         on public.scores   to authenticated;
grant insert, update on public.profiles to authenticated;

-- Resultado esperado: 9 filas de grant para anon/authenticated.
-- Ninguna de DELETE, TRUNCATE ni REFERENCES. Lo comprueba 03-verificacion.sql.
-- (Los grants de service_role los gestiona Supabase; no se tocan.)


-- ----------------------------------------------------------------------------
-- 8. REVOKE DE EXECUTE SOBRE LAS FUNCIONES SECURITY DEFINER
-- ----------------------------------------------------------------------------
--
-- Ambas corren con los privilegios de su dueño, así que nadie desde la API
-- debe poder invocarlas directamente. Solo las llaman sus triggers.
-- (Migración 20260728105418 de la SPEC 15.)

revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()  from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 9. REGISTRO DEL BASELINE DE MIGRACIONES
-- ----------------------------------------------------------------------------
--
-- Este archivo equivale a las 7 migraciones de `supabase/migrations/`. Sin este
-- bloque, producción no tendría forma de saber cuáles ya lleva aplicadas y el
-- próximo despliegue volvería a ser arqueología.
--
-- Marca las 7 como aplicadas SIN reejecutarlas. A partir de aquí, cada
-- migración nueva se ejecuta y se registra igual (ver supabase/migrations/README.md).
--
-- El `create ... if not exists` es solo una red: Supabase ya crea esta tabla en
-- todo proyecto nuevo. Las columnas que no se rellenan (`statements`, `rollback`)
-- son nulables y solo las usa el CLI, que aquí no interviene.

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260721215144', 'create_games_and_scores'),
  ('20260727150504', 'create_profiles_with_trigger_and_rls'),
  ('20260727150654', 'add_user_id_to_scores'),
  ('20260727164444', 'restrict_scores_insert_to_own_profile'),
  ('20260727193632', 'oauth_conditional_handle_new_user_and_profiles_insert_policy'),
  ('20260728105418', 'spec15_revoke_execute_security_definer_functions'),
  ('20260731103126', 'reconcile_spec15_grants_and_rls_auto_enable')
on conflict (version) do nothing;


-- ============================================================================
-- AVISO PARA EL FUTURO — default privileges
-- ============================================================================
--
-- Los default privileges NO se han alterado, igual que en desarrollo: es una
-- decisión consciente de la SPEC 15, porque tocarlos afecta a extensiones y
-- objetos internos de Supabase.
--
-- Consecuencia práctica: la PRÓXIMA tabla que se cree en `public` nacerá otra
-- vez con los 7 grants para anon y authenticated. El event trigger ensure_rls
-- le activará RLS, pero los grants hay que recortarlos a mano, repitiendo el
-- patrón del paso 7:
--
--   revoke all on public.<tabla> from anon, authenticated;
--   grant select on public.<tabla> to anon, authenticated;
--   -- ...y solo los INSERT/UPDATE que esa tabla necesite de verdad.
--
-- ============================================================================
