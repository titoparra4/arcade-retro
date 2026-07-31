-- SPEC 13 · Paso 2 — Columna scores.user_id (nullable, sin tocar policies todavía)

alter table public.scores
  add column user_id uuid references auth.users(id) on delete set null;
