-- Siembra la fila del juego "Excavador" (Dig Dug).
-- SPEC: specs/game-jam/excavador/excavador-01-clasico.md
-- Idempotente: si la fila ya existe, no hace nada.
insert into public.games (id, title, short, long, cat, cover, color) values
('excavador', 'EXCAVADOR', 'Cava túneles y revienta monstruos bajo tierra.', 'Bajo la superficie, un excavador abre túneles a golpe de pala mientras los Pooka lo persiguen por los pasadizos. Ínflalos con la bomba de aire hasta reventarlos, o hazles caer una roca encima.', 'ARCADE', 'cover-excavador', 'magenta')
on conflict (id) do nothing;
