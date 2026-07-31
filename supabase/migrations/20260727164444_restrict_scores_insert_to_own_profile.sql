-- SPEC 13 · Paso 11 — Guardar puntuación exige sesión.
-- Punto de no retorno: a partir de aquí no entran puntuaciones anónimas.
-- Las 16 filas históricas conservan user_id nulo y siguen visibles.

drop policy scores_insert_public on public.scores;

create policy scores_insert_own on public.scores
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and player_name = (select player_name from public.profiles where id = (select auth.uid()))
  );
