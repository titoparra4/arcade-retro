# Sugerencias de juegos — Arcade Retro

> Memoria del subagente `game-planner`. Cada fila es una idea evaluada, con su estado.
> Estados: `Sugerido` · `Descartada` · `En spec` · `Implementado`.
> El agente agrega filas al final; no reescribe el historial.

| Fecha      | Candidato    | Ref. clásica        | Categoría | Estado   | Razonamiento                                                                                                                                            |
| ---------- | ------------ | ------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-23 | duelo-pixel  | Pong                | VERSUS    | Sugerido | Principal. Única categoría VERSUS con 0 jugables; ya tiene fila en `games` + `cover-duelo`; port más barato (física de pelota + IA trivial de paleta).  |
| 2026-07-23 | invasores    | Space Invaders      | SHOOTER   | Sugerido | Alternativa. Win barato (fila + `cover-invaders`), pero SHOOTER ya tiene rocas; dificultad media (grilla de enemigos que baja y dispara).               |
| 2026-07-23 | gloton       | Pac-Man             | ARCADE    | Sugerido | Alternativa. Win barato (fila + `cover-glot`), pero ARCADE ya tiene 2 y es el más caro: IA de fantasmas + laberinto.                                    |
| 2026-07-23 | estelas      | Tron (Light Cycles) | VERSUS    | Sugerido | Batch 20. Port VERSUS más barato: grilla + colisión, IA trivial. Estrena la categoría vacía con riesgo mínimo. Cover nueva + fila nueva.                |
| 2026-07-23 | tanques      | Combat (Atari)      | VERSUS    | Sugerido | Batch 20. Duelo de tanques; reusa movimiento vector+rotación de rocas, IA de persecución agrega costo. Cover nueva + fila nueva.                        |
| 2026-07-23 | murallas     | Warlords            | VERSUS    | Sugerido | Batch 20. Hereda física de pelota/ladrillos de Arkanoid (única con física ya resuelta en repo). Cover nueva + fila nueva.                               |
| 2026-07-23 | justa        | Joust               | VERSUS    | Sugerido | Batch 20. Física de aleteo/gravedad + colisión por altura + IA voladora; el más caro de VERSUS. Cover nueva + fila nueva.                               |
| 2026-07-23 | boxeo        | Boxing (Atari)      | VERSUS    | Sugerido | Batch 20. Cuerpo a cuerpo con timer; hitboxes + cooldown, sin física continua. Segundo más barato de VERSUS. Cover nueva + fila nueva.                  |
| 2026-07-23 | enjambre     | Galaga              | SHOOTER   | Sugerido | Batch 20. Fixed shooter con dive-bomb + captura de nave; el más seguro del set SHOOTER. Cover nueva + fila nueva.                                       |
| 2026-07-23 | legion       | Gradius / Nemesis   | SHOOTER   | Sugerido | Batch 20. Shmup horizontal con barra de power-ups (usa extraStat) y options satélite + jefe. Media-alta. Cover nueva + fila nueva.                      |
| 2026-07-23 | vigia        | Xevious             | SHOOTER   | Sugerido | Batch 20. Shmup vertical con doble arma aire/suelo (dos planos de colisión). Media. Cover nueva + fila nueva.                                           |
| 2026-07-23 | defensor     | Defender            | SHOOTER   | Sugerido | Batch 20. Scroll bidireccional + rescate + minimapa; el más complejo de SHOOTER. Alta. Cover nueva + fila nueva.                                        |
| 2026-07-23 | vortice      | Tempest             | SHOOTER   | Sugerido | Batch 20. Tube shooter vectorial; encaja perfecto con el tema neón/perspective-grid. Alta (geometría de túnel). Cover nueva + fila nueva.               |
| 2026-07-23 | almacen      | Sokoban             | PUZZLE    | Sugerido | Batch 20. Empujar cajas a metas; turn-based determinista, niveles hardcodeados. Win barato de PUZZLE. Cover nueva + fila nueva.                         |
| 2026-07-23 | columnas     | Columns (Sega)      | PUZZLE    | Sugerido | Batch 20. Caída de gemas + match-3 en 8 direcciones; puede reusar cover-tetro. Riesgo: diferenciarlo de Tetris. Media.                                  |
| 2026-07-23 | tuberias     | Pipe Mania          | PUZZLE    | Sugerido | Batch 20. Rutear cañería contrarreloj antes del flujo; conectividad de piezas. Media. Cover nueva + fila nueva.                                         |
| 2026-07-23 | atrapafichas | Klax                | PUZZLE    | Sugerido | Batch 20. Atrapar en cinta + alinear 3; único PUZZLE con uso natural de onLivesChange (fichas escapadas). Media. Cover nueva + fila nueva.              |
| 2026-07-23 | burbujas     | Puzzle Bobble       | PUZZLE    | Sugerido | Batch 20. Apuntar y disparar match-3 en grilla hexagonal + flood-fill; el más caro de PUZZLE. Alta. Cover nueva + fila nueva.                           |
| 2026-07-23 | alunizaje    | Lunar Lander        | ARCADE    | Sugerido | Batch 20. Aterrizaje con física vectorial + combustible (extraStat FUEL); sin IA, terreno hardcodeable. Win barato de ARCADE. Cover nueva + fila nueva. |
| 2026-07-23 | cubitos      | Q*bert              | ARCADE    | Sugerido | Batch 20. Hopper isométrico; lógica discreta acotada pero iso-render agrega trabajo. Media. Cover nueva + fila nueva.                                   |
| 2026-07-23 | excavador    | Dig Dug             | ARCADE    | Sugerido | Batch 20. Tierra destructible + rocas que caen + IA por túneles con modo fantasma. Media-alta. Cover nueva + fila nueva.                                |
| 2026-07-23 | chef-loco    | BurgerTime          | ARCADE    | Sugerido | Batch 20. Plataforma-escalera con cascada de ingredientes + pimienta (extraStat). Media-alta. Cover nueva + fila nueva.                                 |
| 2026-07-23 | escalador    | Donkey Kong         | ARCADE    | Sugerido | Batch 20. Climber con física de salto/plataformas + barriles; el de mayor riesgo de game-feel. Alta. Cover nueva + fila nueva.                          |
