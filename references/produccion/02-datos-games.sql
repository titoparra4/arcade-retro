-- ============================================================================
-- ARCADE RETRO — Catálogo de juegos
-- ============================================================================
--
-- Las 8 filas de `games` copiadas tal cual del proyecto de desarrollo.
-- Ejecutar DESPUÉS de 01-esquema.sql.
--
-- `games` es dato de CONFIGURACIÓN, no de usuario: describe qué juegos existen
-- en el arcade. Por eso sí viaja a producción, mientras que `scores` y
-- `profiles` arrancan vacíos.
--
-- `on conflict do nothing` lo hace re-ejecutable y, sobre todo, seguro: si
-- algún día se edita un texto en producción, volver a correr este archivo no
-- lo pisa.
--
-- `created_at` se omite a propósito para que tome el default (now()).
--
-- NOTA — `cover` es una clase CSS de app/globals.css (arte de portada en CSS
-- puro, sin imágenes), no una ruta a un archivo. Existen 8 y aquí se usan las 8.
--
-- NOTA — De estos 8 juegos, 5 son jugables de verdad (rocas, caida,
-- bloque-buster, serpentina, ranaria). Los otros 3 (gloton, invasores,
-- duelo-pixel) todavía no están en GAME_REGISTRY, así que en producción se
-- verán en la biblioteca y el player mostrará su placeholder decorativo, igual
-- que en desarrollo. Es el comportamiento esperado, no un fallo del despliegue.
-- ============================================================================

insert into public.games (id, title, short, long, cat, cover, color) values

  ('bloque-buster', 'BLOQUE BUSTER',
   'Rebota la pelota y destruye muros de neón.',
   'Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?',
   'ARCADE', 'cover-bricks', 'cyan'),

  ('caida', 'CAÍDA',
   'Encaja las piezas antes de que el techo te aplaste.',
   'Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.',
   'PUZZLE', 'cover-tetro', 'magenta'),

  ('serpentina', 'SERPENTINA',
   'Crece sin morder tu propia cola.',
   'Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.',
   'ARCADE', 'cover-snake', 'green'),

  ('gloton', 'GLOTÓN',
   'Devora puntos y escapa de los fantasmas.',
   'Un círculo glotón patrulla un laberinto coleccionando puntos luminosos. Cuatro espectros lo persiguen, pero cada cierto tiempo aparece una píldora que invierte los papeles.',
   'ARCADE', 'cover-glot', 'yellow'),

  ('invasores', 'INVASORES',
   'Defiende el planeta de filas alienígenas.',
   'Olas de pixeles hostiles descienden formación tras formación. Mueve tu cañón en horizontal y abre fuego con precisión, antes de que toquen la superficie.',
   'SHOOTER', 'cover-invaders', 'green'),

  ('rocas', 'ROCAS',
   'Pulveriza asteroides en gravedad cero.',
   'Tu nave triangular flota en vacío absoluto. Dispara y rota para dividir rocas en fragmentos cada vez más pequeños. Cuidado con los OVNIs en el horizonte.',
   'SHOOTER', 'cover-rocas', 'yellow'),

  ('ranaria', 'RANARIA',
   'Cruza la autopista de pixeles.',
   'Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo.',
   'ARCADE', 'cover-rana', 'green'),

  ('duelo-pixel', 'DUELO PIXEL',
   'Dos paletas. Una pelota. Reflejos máximos.',
   'El duelo más puro: dos paletas verticales se enfrentan por rebotar una pelota luminosa. Modo solitario contra la CPU o partida local a dos jugadores.',
   'VERSUS', 'cover-duelo', 'cyan')

on conflict (id) do nothing;
