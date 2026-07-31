-- ============================================================================
-- ARCADE RETRO — Verificación post-despliegue
-- ============================================================================
--
-- Ejecutar DESPUÉS de 01-esquema.sql y 02-datos-games.sql, en el SQL Editor
-- del proyecto de producción.
--
-- Todo aquí es de SOLO LECTURA: no modifica nada, se puede correr las veces
-- que haga falta.
--
-- Cada consulta lleva anotado su resultado esperado. Si alguna no cuadra, NO
-- sigas con el RUNBOOK: vuelve a 01-esquema.sql y mira qué paso falló.
--
-- El SQL Editor de Supabase solo muestra el resultado de la ÚLTIMA consulta
-- cuando se pegan varias. Ejecútalas de una en una, o selecciona el bloque que
-- quieras y pulsa Run.
--
-- Son las mismas comprobaciones que usa el agente `security-auditor`
-- (.claude/agents/security-auditor.md), así que la primera auditoría de
-- producción puede partir de aquí.
-- ============================================================================


-- ---------------------------------------------------------------- 1. TABLAS Y RLS
-- ESPERADO: exactamente 3 filas — games, profiles, scores — todas con rls = true.
select c.relname as tabla, c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;


-- ---------------------------------------------------------------- 2. POLICIES
-- ESPERADO: 6 filas.
--   games    → games_select_public      {anon,authenticated}  SELECT
--   profiles → profiles_insert_own      {authenticated}       INSERT
--   profiles → profiles_select_public   {anon,authenticated}  SELECT
--   profiles → profiles_update_own      {authenticated}       UPDATE
--   scores   → scores_insert_own        {authenticated}       INSERT
--   scores   → scores_select_public     {anon,authenticated}  SELECT
--
-- Ninguna debe tener `public` en `roles`, y ninguna debe ser de DELETE.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ---------------------------------------------------------------- 3. GRANTS
-- ESPERADO: exactamente 9 filas.
--   anon          → games, profiles, scores   SELECT           (3)
--   authenticated → games, profiles, scores   SELECT           (3)
--   authenticated → profiles                  INSERT, UPDATE   (2)
--   authenticated → scores                    INSERT           (1)
--
-- Si aparece algún DELETE, TRUNCATE o REFERENCES, el paso 7 de 01-esquema.sql
-- no se ejecutó. Vuelve a correrlo.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- El conteo, para leerlo de un vistazo. ESPERADO: 9
select count(*) as grants_anon_authenticated
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');


-- ---------------------------------------------------------------- 4. FUNCIONES SECURITY DEFINER
-- ESPERADO: 2 filas.
--   handle_new_user   secdef=true  search_path={search_path=""}
--   rls_auto_enable   secdef=true  search_path={search_path=pg_catalog}
--
-- Las dos columnas de la derecha deben ser AMBAS false: nadie desde la API
-- puede invocarlas directamente.
select
  p.proname                                                as funcion,
  p.prosecdef                                              as security_definer,
  p.proconfig                                              as search_path,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as puede_anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as puede_auth
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ---------------------------------------------------------------- 5. TRIGGERS
-- ESPERADO: 1 fila — on_auth_user_created, AFTER INSERT sobre auth.users.
-- Sin esto, el registro con email crea la cuenta pero no el perfil.
select t.tgname, c.relname as tabla, pg_get_triggerdef(t.oid) as definicion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname = 'auth';

-- ESPERADO: la fila `ensure_rls` con enabled = 'O' (habilitado).
-- Aparecerán también varios event triggers internos de Supabase
-- (pgrst_ddl_watch, issue_pg_cron_access...): son normales.
select evtname, evtevent, evtenabled as enabled, evtfoid::regproc as funcion
from pg_event_trigger
order by evtname;


-- ---------------------------------------------------------------- 6. DATOS
-- ESPERADO: games = 8, scores = 0, profiles = 0.
-- scores y profiles a cero es lo correcto: producción arranca con el
-- leaderboard limpio y sin usuarios.
select
  (select count(*) from public.games)    as games,
  (select count(*) from public.scores)   as scores,
  (select count(*) from public.profiles) as profiles;

-- ESPERADO: 8 filas, una por juego, con su cat/cover/color.
select id, title, cat, cover, color from public.games order by id;


-- ---------------------------------------------------------------- 7. VISTAS
-- ESPERADO: 0 filas.
-- Una vista en `public` sería un agujero: las vistas no heredan la RLS de sus
-- tablas base y pueden filtrar datos por debajo de las policies.
select table_name
from information_schema.views
where table_schema = 'public';


-- ---------------------------------------------------------------- 8. ÍNDICES
-- ESPERADO: 5 filas — games_pkey, profiles_pkey, profiles_player_name_key,
-- scores_pkey, scores_game_id_score_idx... más scores_user_id_idx = 6 en total.
-- (Producción tiene uno más que desarrollo: ver la nota del paso 2 de
-- 01-esquema.sql.)
select tablename, indexname
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;


-- ============================================================================
-- ÚLTIMA COMPROBACIÓN — desde fuera, no desde aquí
-- ============================================================================
--
-- Las consultas de arriba corren como `postgres` y ven la base desde dentro.
-- Falta comprobar lo que ve un visitante cualquiera con la publishable key.
-- Desde tu terminal, sustituyendo <URL_PROD> y <PUBLISHABLE_KEY_PROD>:
--
--   # Lectura pública → debe devolver 200 y el JSON de los juegos
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     '<URL_PROD>/rest/v1/games?select=id' \
--     -H 'apikey: <PUBLISHABLE_KEY_PROD>'
--
--   # Escritura anónima → debe devolver 401 con code "42501"
--   curl -s '<URL_PROD>/rest/v1/scores' \
--     -H 'apikey: <PUBLISHABLE_KEY_PROD>' \
--     -H 'Content-Type: application/json' \
--     -d '{"game_id":"rocas","player_name":"TEST","score":1}'
--
-- El segundo tiene que fallar con "permission denied" (42501), que es el error
-- de la capa de GRANTS. Si en su lugar sale un error de RLS, significa que los
-- grants siguen abiertos: falta ejecutar el paso 7 de 01-esquema.sql.
-- ============================================================================
