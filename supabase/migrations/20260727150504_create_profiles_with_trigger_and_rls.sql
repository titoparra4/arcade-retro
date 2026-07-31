-- SPEC 13 · Paso 1 — Tabla profiles + trigger de creación + RLS

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null unique
    check (player_name ~ '^[A-Z0-9_-]{1,10}$'),
  created_at timestamptz not null default now()
);

-- Crea el perfil dentro de la misma transacción que el insert en auth.users:
-- si player_name está ocupado, el unique aborta el registro completo.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, player_name)
  values (new.id, new.raw_user_meta_data->>'player_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Lectura pública: los player_name ya son públicos en el salón y el registro
-- necesita comprobar disponibilidad. No hay policy de insert: solo escribe el
-- trigger security definer.
create policy profiles_select_public on public.profiles
  for select to anon, authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()));
