# SPEC — Juego real: Excavador (Dig Dug)

> **Estado:** Aprobado
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (esquema de `games`/`scores` en Supabase — la fila `excavador` **no** existe todavía y debe insertarse), SPEC 07 (convención sin sonido, estado mutable en `useRef`, loop con `dt` capado a 50ms)
> **Fecha:** 2026-08-03
> **Objetivo:** Crear desde cero un componente cliente en canvas (`ExcavadorGame`) que implemente un Dig Dug clásico —grilla subterránea cavable, bomba de aire para inflar y reventar monstruos Pooka, rocas que caen y aplastan, 3 vidas y niveles hardcodeados en dificultad creciente— e integrarlo en `/games/excavador/jugar`, sembrando por primera vez la fila `excavador` en Supabase (no existe placeholder previo).

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/excavador-game.tsx` que implementa Dig Dug desde cero, sin fuente de port previa (no existe en `references/started-games/` ni en `references/source-assets/`).
- Grilla subterránea de 16 columnas × 12 filas, celda de 50px, canvas de resolución fija 800×600 (mismo tamaño que Asteroids/Arkanoid/Snake, escalado dentro de `.crt-screen`). Filas 0–1 son "cielo" (siempre abiertas); filas 2–11 son tierra cavable.
- Tipos de celda: `sky` (cielo, siempre transitable), `dirt` (tierra sólida, bloquea el paso hasta ser cavada), `empty` (túnel ya cavado, transitable), y una lista aparte de rocas (`rocks`) que ocupan una celda de tierra y bloquean el paso hasta que caen o son cavadas alrededor.
- Excavador controlable por grilla: ocupa una celda, se mueve una celda por vez en la dirección presionada. Si la celda destino es `empty` o `sky`, el paso tarda `TUNNEL_STEP_MS`; si es `dirt`, el paso la convierte en `empty` (la cava) y tarda `DIG_STEP_MS` (más lento que moverse por un túnel ya abierto); si contiene una roca estable o está fuera de la grilla, el movimiento no ocurre. La última dirección de movimiento válida queda como `dir` (orientación de la bomba de aire).
- Niveles definidos como una lista hardcodeada (`LEVELS`) de layouts: celda de inicio, celdas pre-cavadas (túnel de salida + cámaras de los Pooka), posiciones de rocas, posiciones iniciales de los Pooka. 3 layouts en este spec; al superar el último se vuelve al primero con la velocidad de los Pooka aumentada (juego sin fin, sin condición de victoria final — igual que Asteroids/Snake).
- Un único tipo de enemigo, Pooka (monstruo redondo rojo): se mueve una celda por vez cada `ENEMY_STEP_MS`, únicamente a través de celdas `empty`/`sky` ya cavadas (nunca cava tierra por sí mismo), eligiendo entre los vecinos transitables el que reduce la distancia Manhattan hacia el excavador (sin invertir de golpe salvo que sea la única opción).
- Bomba de aire: al mantener presionado `Space`, la manguera se extiende celda a celda en la dirección `dir` del excavador, a razón de `PUMP_EXTEND_MS` por celda, solo a través de celdas ya cavadas (`empty`/`sky`), hasta `PUMP_MAX_RANGE` celdas o hasta encontrar un Pooka. Si conecta con un Pooka, mientras `Space` siga presionado el Pooka avanza de etapa de inflado cada `INFLATE_STAGE_MS` (0→1→2→3); un tick más tras la etapa 3 lo revienta (+250 puntos, desaparece). Soltar `Space` antes de reventarlo retrae la manguera de inmediato y el Pooka vuelve a la etapa 0 sin daño. Si el Pooka sale de la línea de la manguera antes de reventar, la conexión se corta y la manguera se retrae igual.
- Rocas: cada una ocupa una celda de tierra fija por nivel; se mantiene estable mientras la celda inmediatamente debajo siga siendo `dirt` o contener otra roca estable. En cuanto esa celda queda `empty` (por haber sido cavada), la roca pasa a "cayendo" y desciende una celda cada `ROCK_FALL_STEP_MS` hasta aterrizar sobre tierra sólida, otra roca, o el borde inferior de la grilla. Una roca cayendo que entra en la celda de un Pooka lo destruye (+500 puntos); si entra en la celda del excavador, este pierde una vida. Al aterrizar, la roca queda fija como obstáculo permanente por el resto del nivel (ya no se puede cavar ni volver a caer).
- Vidas: arranca en 3 (`onLivesChange(3)`). Colisión por contacto con un Pooka, o ser aplastado por una roca, resta una vida; el excavador respawnea en la celda de inicio del nivel actual (los túneles ya cavados y las rocas quedan como estaban) con `RESPAWN_INVULN_MS` de invulnerabilidad antes de poder volver a perder una vida. A 0 vidas: `onGameOver(score, false)`.
- Nivel completo: al eliminar (reventar o aplastar) a todos los Pooka del nivel, suma `LEVEL_CLEAR_BONUS` (1000 puntos), avanza al siguiente layout de `LEVELS` (o vuelve al primero con `ENEMY_STEP_MS` reducido, mínimo `ENEMY_STEP_MIN_MS`), reconstruye la grilla completa (tierra + pre-cavados + rocas del nuevo layout) y respawnea al excavador en la celda de inicio. `onLevelChange` se dispara con el número de nivel acumulado (no vuelve a 1 al hacer loop, para que el HUD refleje la progresión real).
- Controles por teclado vía `e.code` (flechas para mover, `Space` para la bomba de aire), con `preventDefault` en las teclas de control.
- Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa) y acumuladores de paso de grilla independientes para excavador, cada Pooka, la manguera y las rocas cayendo.
- `onScoreChange`/`onLevelChange` disparados solo al cambiar; `onLivesChange` disparado solo al cambiar. El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa en este spec.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye el nivel 1 desde `LEVELS[0]`, excavador en la celda de inicio, score 0, 3 vidas, nivel 1; `forceGameOver()` fuerza el game over inmediato con el score acumulado.
- Metadata nueva a sembrar en Supabase (tabla `games`, sin fila previa): `id='excavador'`, `title='EXCAVADOR'`, `cat='ARCADE'`, `color='magenta'`, `cover='cover-excavador'` (clase CSS nueva, no existe hoy en `app/globals.css`); `short`/`long` propuestos en este spec. Se registra el componente en `GAME_REGISTRY` con la clave `"excavador"`.

**Fuera de alcance (para specs futuros si llegan):**

- Fygar (el dragón que respira fuego) y cualquier segundo tipo de enemigo — va en `excavador-02-modo-fygar.md`.
- "Modo fantasma": el movimiento ocasional de los Pooka a través de tierra sólida sin cavar (existe en el original clásico) — se descarta explícitamente, los Pooka en este spec solo usan túneles ya cavados.
- Verduras/frutas bonus que aparecen al eliminar cierta cantidad de enemigos.
- Puntaje variable por profundidad (todas las reventadas valen 250 fijos, sin importar cuán abajo esté el excavador).
- Controles táctiles/móviles.
- Sonido/música.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

Introduce una fila nueva en `games` (esquema ya definido por SPEC 06, sin cambios de esquema) y el estado interno del componente:

```ts
// app/components/games/excavador-game.tsx
type Direction = "up" | "down" | "left" | "right";
type CellKind = "sky" | "dirt" | "empty";

interface GridPos {
  col: number; // 0..15
  row: number; // 0..11
}

interface Rock extends GridPos {
  falling: boolean;
  fallAccum: number; // ms acumulados desde el último paso de caída
}

interface Enemy extends GridPos {
  alive: boolean;
  stepAccum: number; // ms acumulados desde el último paso de grilla
  pumpStage: 0 | 1 | 2 | 3; // 0 = normal, 3 = a punto de reventar
}

interface Pump {
  active: boolean;
  dir: Direction;
  cells: number; // celdas actuales de extensión, 0..PUMP_MAX_RANGE
  extendAccum: number;
  targetEnemyIndex: number | null; // índice en enemies[] si conectó con uno
  inflateAccum: number;
}

interface GameData {
  grid: CellKind[][]; // ROWS × COLS
  player: GridPos & { dir: Direction; moveAccum: number };
  pendingDir: Direction | null; // último input de teclado pendiente de aplicar
  enemies: Enemy[];
  rocks: Rock[];
  pump: Pump;
  score: number;
  lives: number;
  level: number; // acumulado, no reinicia al hacer loop de LEVELS
  enemyStepMs: number; // recalculado en cada loop de LEVELS
  invulnMs: number; // ms restantes de invulnerabilidad tras respawn
  state: "playing" | "gameover";
}

export type ExcavadorGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type ExcavadorGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

```ts
// app/components/games/excavador-levels.ts
interface LevelLayout {
  startCell: GridPos;
  preCarved: GridPos[]; // túnel de salida + cámaras de monstruos ya abiertas
  rocks: GridPos[];
  enemies: GridPos[]; // posiciones iniciales de los Pooka
}

export const LEVELS: LevelLayout[] = [
  /* nivel 1: 4 Pooka, 2 rocas, cámaras simétricas */
  /* nivel 2: 5 Pooka, 3 rocas */
  /* nivel 3: 6 Pooka, 3 rocas, cámaras más profundas */
];
```

Convenciones:

- `COLS = 16`, `ROWS = 12`, `CELL = 50` (canvas 800×600). Filas 0–1 son `sky` en todos los niveles.
- `TUNNEL_STEP_MS = 220`, `DIG_STEP_MS = 480` (cavar es más lento que recorrer un túnel abierto).
- `ENEMY_STEP_MS` inicial `340`, reducido `30` ms en cada loop completo de `LEVELS`, con piso `ENEMY_STEP_MIN_MS = 160`.
- `PUMP_EXTEND_MS = 90`, `PUMP_MAX_RANGE = 5`, `INFLATE_STAGE_MS = 550`.
- `ROCK_FALL_STEP_MS = 140`.
- Puntaje: `+250` por Pooka reventado, `+500` por Pooka aplastado por roca, `+1000` de bonus al limpiar un nivel.
- `RESPAWN_INVULN_MS = 1200`, `LIVES_START = 3`.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo.

## Plan de implementación

1. **Metadata propuesta (sin insertar todavía).** Confirmar `id='excavador'`, `title='EXCAVADOR'`, `cat='ARCADE'`, `color='magenta'`, `cover='cover-excavador'`, `short`/`long` de este spec como la fila a insertar en `games`. La inserción real y la creación de la clase CSS `cover-excavador` en `app/globals.css` (siguiendo el patrón visual de gradiente + pseudo-elementos de las demás `cover-*`) las ejecuta `/add-game`, no este spec. Prueba: `select * from games where id = 'excavador'` no devuelve filas antes de la implementación.
2. **Módulo de niveles.** Crear `app/components/games/excavador-levels.ts` con `LEVELS` (3 layouts: celda de inicio, pre-cavados, rocas, posiciones de Pooka). Prueba: cada layout tiene celdas dentro de los límites de la grilla (0–15 col, 2–11 row para tierra) y ninguna roca coincide con una celda pre-cavada o con el inicio; `excavador-levels.ts` compila sin errores de tipos.
3. **Grilla y render estático.** Crear `app/components/games/excavador-game.tsx` que dibuja la grilla (cielo, tierra, túneles cavados) y el excavador inmóvil en la celda de inicio del nivel 1, sin movimiento aún. Loop `requestAnimationFrame` con `dt` capado a 50ms montado pero solo redibujando. Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página; render local muestra la tierra completa con las cámaras pre-cavadas y las rocas del nivel 1 visibles.
4. **Movimiento y excavado.** Implementar el paso de grilla del excavador vía `pendingDir` (teclado `e.code`, flechas, `preventDefault`): mover a `empty`/`sky` tarda `TUNNEL_STEP_MS`, mover a `dirt` la cava y tarda `DIG_STEP_MS`, rocas y bordes bloquean el paso. Prueba local: el excavador cava tierra al moverse contra ella, se desplaza más rápido por túneles ya abiertos, y no puede atravesar rocas ni salir de la grilla.
5. **Pooka con persecución por túneles.** Agregar los enemigos del nivel actual, que se mueven cada `ENEMY_STEP_MS` solo por celdas `empty`/`sky`, eligiendo el vecino transitable que reduce la distancia Manhattan hacia el excavador. Colisión por contacto resta una vida y respawnea al excavador en la celda de inicio con `RESPAWN_INVULN_MS` de invulnerabilidad; a 0 vidas dispara `onGameOver(score, false)`. Prueba local: los Pooka persiguen al excavador únicamente por los túneles ya cavados, tocar uno resta una vida (HUD lo refleja), y quedarse sin vidas abre el modal de fin de partida.
6. **Bomba de aire e inflado.** Implementar la manguera (`Space` mantenido) que se extiende por celdas cavadas en la dirección `dir` del excavador hasta `PUMP_MAX_RANGE` o hasta conectar con un Pooka; mientras se mantenga presionado, el Pooka conectado sube de etapa cada `INFLATE_STAGE_MS` hasta reventar (+250 puntos) tras la etapa 3; soltar antes retrae la manguera y desinfla al Pooka sin daño. Prueba local: mantener `Space` apuntando a un Pooka lo hincha visiblemente en 3 etapas y lo revienta a la cuarta; soltar antes lo deja intacto.
7. **Rocas que caen.** Cada roca vigila la celda debajo suyo; al quedar `empty`, pasa a caer un paso cada `ROCK_FALL_STEP_MS` hasta aterrizar sobre tierra, otra roca, o el fondo de la grilla, aplastando (+500 puntos) a cualquier Pooka en su camino, o restando una vida al excavador si lo aplasta a él. Al aterrizar queda fija el resto del nivel. Prueba local: cavar la tierra debajo de una roca la hace caer y aplastar lo que encuentre en su camino; una roca aterrizada bloquea el paso de forma permanente.
8. **Progresión de niveles y ref imperativa.** Al eliminar a todos los Pooka del nivel: +1000 de bonus, avanza al siguiente layout de `LEVELS` (o vuelve al primero con `enemyStepMs` reducido, `onLevelChange` con el nivel acumulado), reconstruye la grilla y respawnea al excavador. Implementar `forwardRef` + `useImperativeHandle` con `reset()` (nivel 1, excavador en inicio, score 0, 3 vidas) y `forceGameOver()` (game over inmediato). Prueba local: limpiar todos los Pooka de un nivel carga el siguiente layout sin perder score ni vidas; FIN corta la partida con el score acumulado; JUGAR DE NUEVO reinicia completo.
9. **Registro.** Agregar `"excavador": { Component: ExcavadorGame }` a `GAME_REGISTRY` en `app/components/games/registry.ts` (sin `extraStatLabel`). Prueba: `/games/excavador/jugar` carga el juego real en canvas — requiere que la fila `excavador` ya exista en `games` (paso ejecutado por `/add-game`, no por este spec).
10. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/excavador/jugar`: cavar tierra en las 4 direcciones, perseguir/ser perseguido por Pooka únicamente a través de túneles, inflar y reventar un Pooka con la bomba de aire, dejar caer una roca sobre un Pooka y sobre el propio excavador, perder vidas con respawn e invulnerabilidad temporal, limpiar un nivel y ver el siguiente layout con más Pooka, PAUSA congela el loop, FIN cierra con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia sin recargar. Confirmar que los demás juegos siguen sin cambios.
11. **Cierre.** Verificar los criterios de aceptación uno por uno; el spec queda en Borrador para que Tito lo apruebe e implemente vía `/add-game`.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/excavador/jugar` carga sin errores en consola, con el juego real en canvas.
- [ ] La grilla se dibuja completa (cielo, tierra, túneles cavados, rocas) a resolución fija 800×600 escalada dentro de `.crt-screen`.
- [ ] El excavador se mueve con las 4 flechas, cavando tierra sólida (más lento) y recorriendo túneles ya abiertos (más rápido); no puede atravesar rocas ni salir de la grilla.
- [ ] Cada Pooka se mueve solo por celdas ya cavadas, acercándose al excavador por la ruta transitable más corta en Manhattan.
- [ ] Mantener `Space` con la manguera apuntando a un Pooka lo infla en 3 etapas visibles y lo revienta (+250 puntos) en la cuarta; soltar `Space` antes lo desinfla sin daño.
- [ ] Cavar la tierra bajo una roca la hace caer; aplasta (+500 puntos) a cualquier Pooka en su trayectoria, o resta una vida al excavador si lo aplasta a él; al aterrizar queda como obstáculo fijo el resto del nivel.
- [ ] Tocar a un Pooka resta una vida; el excavador respawnea en la celda de inicio del nivel con un período breve de invulnerabilidad.
- [ ] El HUD "Vidas" arranca en 3 ♥ y baja al perder cada vida; a 0 vidas se abre el modal de fin de partida.
- [ ] Eliminar a todos los Pooka de un nivel suma 1000 puntos de bonus y carga el siguiente layout con más monstruos; al superar el último layout, el juego vuelve al primero con los Pooka más rápidos, sin terminar la partida.
- [ ] El HUD "Nivel" refleja el nivel acumulado real (no reinicia a 1 al hacer loop de layouts).
- [ ] No se muestra ningún stat extra en el HUD (el slot de stat extra no se usa en este spec).
- [ ] El botón PAUSA congela el loop por completo (excavador, Pooka y rocas dejan de moverse); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada y abre el modal de fin de partida.
- [ ] "GUARDAR PUNTUACIÓN" añade una fila real a `scores` en Supabase con `game_id = 'excavador'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego desde cero (nivel 1, excavador en la celda de inicio, score 0, 3 vidas) sin recargar la página.
- [ ] "SALIR" navega a `/games/excavador` sin errores.
- [ ] Las flechas y la barra espaciadora no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`rocas`, `caida`, `bloque-buster`, `serpentina`, `gloton` y los decorativos restantes) siguen sin cambios.
- [ ] La fila `excavador` en la tabla `games` de Supabase queda sembrada con los valores de metadata propuestos en este spec.

## Decisiones

- **Sí:** juego sin fin, sin condición de victoria final (al superar el último layout de `LEVELS` se vuelve al primero con los Pooka más rápidos), en vez de terminar la partida tras un número fijo de niveles. Fiel al Dig Dug arcade original, que es un juego de supervivencia con dificultad creciente, no una campaña finita como Arkanoid.
- **Sí:** un único tipo de enemigo (Pooka) en la base, dejando a Fygar (el dragón de fuego) explícitamente para `excavador-02-modo-fygar.md`. Mantiene la base acotada y revisable por separado.
- **No:** portar el "modo fantasma" del original (Pooka atravesando tierra sólida sin cavar de forma ocasional). Simplifica la IA a "solo se mueve por túneles ya cavados"; se puede reconsiderar en un spec futuro si Tito lo pide.
- **Sí:** movimiento en grilla (una celda por paso, con `moveAccum`), en vez de movimiento continuo en píxeles como Glotón. Dig Dug es naturalmente una grilla (cavar es una operación por celda); el patrón de acumulador ya se usó en Serpentina/Ranaria.
- **Sí:** cavar tierra es más lento que recorrer un túnel ya abierto (`DIG_STEP_MS` > `TUNNEL_STEP_MS`). Es la tensión central del original: abrir camino cuesta tiempo, y los Pooka pueden alcanzar al excavador mientras cava.
- **Sí:** puntaje fijo por Pooka reventado (+250) sin importar la profundidad, a diferencia del original que da más puntos cuanto más abajo. Simplifica el modelo de puntaje sin perder la mecánica central; se puede agregar puntaje por profundidad en un spec futuro si se quiere más fidelidad.
- **Sí:** las rocas aterrizadas quedan como obstáculo permanente el resto del nivel (no se pueden volver a cavar ni caen de nuevo). Evita loops de caída infinita y mantiene el modelo de datos simple.
- **No:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel`) en la base. Se reserva para el aviso de "Fygar a punto de escupir fuego" en `excavador-02-modo-fygar.md`.
- **No:** tocar `game-player.tsx` — ya resuelve el componente a mostrar genéricamente vía `GAME_REGISTRY[game.id]`, sin condicionales por juego.
- **Sí:** insertar una fila nueva en `games` (no hay placeholder previo para `excavador`), con clase `cover-excavador` nueva en `app/globals.css`. A diferencia de `gloton`/`ranaria`/`invasores`/`duelo-pixel`, este juego no estaba sembrado como decorativo; la inserción y la clase CSS las ejecuta `/add-game`, no este spec.

## Riesgos

| Riesgo                                                                                                                                                                             | Mitigación                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La IA de persecución de los Pooka, restringida a túneles ya cavados, puede dejarlos "atrapados" lejos del excavador si este nunca cava en su dirección, haciendo el nivel trivial. | Cada layout de `LEVELS` pre-cava cámaras y pasillos que conectan las posiciones iniciales de los Pooka con el punto de partida, garantizando que siempre exista una ruta alcanzable a medida que el excavador cava; se ajusta en el playtest del paso 10.       |
| Una roca cayendo sobre una celda que a su vez tiene otra roca debajo podría generar una cadena de caídas simultáneas difícil de secuenciar en un solo frame.                       | Cada roca evalúa su propia celda-debajo de forma independiente en cada frame; una roca que aterriza sobre otra roca estable simplemente quedó fija, sin desencadenar la caída de la roca de abajo (que sigue estable salvo que su propia celda-debajo se cave). |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame` o los listeners de teclado.                               | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `asteroids-game.tsx`/`gloton-game.tsx`; se verifica manualmente en dev.                                |
| Sin una fila previa en `games`, el spec no puede probarse en `/games/excavador/jugar` hasta que `/add-game` inserte la fila y cree la clase `cover-excavador`.                     | Aceptado como parte del flujo normal de un juego nuevo (a diferencia de los "wins baratos" que reusan placeholder); documentado explícitamente en el plan de implementación (paso 1 y 9).                                                                       |

## Qué **no** está en este spec

- Fygar y cualquier segundo tipo de enemigo (va en `excavador-02-modo-fygar.md`).
- "Modo fantasma" de los Pooka a través de tierra sólida.
- Verduras/frutas bonus, puntaje variable por profundidad.
- Controles táctiles/móviles.
- Sonido/música, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
