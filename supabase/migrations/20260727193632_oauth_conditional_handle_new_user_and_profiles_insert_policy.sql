-- SPEC 14 — OAuth con Google y GitHub
-- 1) handle_new_user pasa a ser condicional: solo el alta por correo trae
--    player_name en la metadata. Google y GitHub no aportan ninguno; su perfil
--    lo crea /auth/completar-perfil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data->>'player_name', '') <> '' then
    insert into public.profiles (id, player_name)
    values (new.id, new.raw_user_meta_data->>'player_name');
  end if;
  return new;
end;
$$;

-- 2) Primera escritura en profiles que no viene del trigger security definer:
--    el onboarding inserta como usuario autenticado, y solo su propia fila.
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
