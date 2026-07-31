-- Reconciliación — registra en el historial de migraciones lo que la SPEC 15
-- aplicó a mano sobre dev y nunca quedó como migración: la red de seguridad
-- `rls_auto_enable` + `ensure_rls`, y el recorte de grants a los 9 necesarios.
--
-- Es idempotente y no-op sobre desarrollo: el estado que describe ya está ahí.
-- Su valor es que a partir de aquí `supabase/migrations/` describe el esquema
-- entero, sin bloques que solo existan en references/produccion/01-esquema.sql.

-- 1) Red de seguridad: RLS automático en toda tabla nueva de `public`.
--    Activa RLS, pero NO recorta los grants — eso sigue siendo manual.
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

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

-- 2) Grants: Supabase concede los 7 privilegios a anon/authenticated sobre
--    toda tabla nueva de `public`. Se revoca todo y se devuelven solo 9.
revoke all on public.games    from anon, authenticated;
revoke all on public.scores   from anon, authenticated;
revoke all on public.profiles from anon, authenticated;

grant select on public.games    to anon, authenticated;
grant select on public.scores   to anon, authenticated;
grant select on public.profiles to anon, authenticated;

grant insert         on public.scores   to authenticated;
grant insert, update on public.profiles to authenticated;

-- 3) Las funciones security definer no son invocables desde PostgREST.
revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()  from public, anon, authenticated;
