# SPEC — Juego real: Glotón (Pac-Man)

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `gloton` ya sembrada), SPEC 07 (convención sin sonido, estado mutable en `useRef`, loop con `dt` capado a 50ms)
> **Fecha:** 2026-07-23
> **Objetivo:** Crear desde cero un componente cliente en canvas (`GlotonGame`) que implemente un comecocos clásico —laberinto fijo de 28×31 celdas, glotón controlable que come todos los puntos, cuatro fantasmas con IA de persecución directa, 3 vidas con respawn, victoria al vaciar el laberinto— e integrarlo en `/games/gloton/jugar`, reemplazando la simulación decorativa ya sembrada en Supabase.

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/gloton-game.tsx` que implementa el comecocos desde cero, sin fuente de port previa (no existe en `references/started-games/`).
- Laberinto fijo definido como una matriz de caracteres embebida en el módulo (`app/components/games/gloton-maze.ts`): 28 columnas × 31 filas, celda de 20px, canvas de resolución fija 560×620 escalado dentro de `.crt-screen` (mismo mecanismo de escalado que Asteroids/Arkanoid/Snake, aunque la resolución no sea 800×600).
- Tipos de celda del laberinto: pared (`#`), punto/pastilla (`.`), celda vacía (` `), casilla de aparición del glotón (`P`), casilla de la casa de fantasmas (`G`), y celda de túnel lateral (`T`) que conecta el borde izquierdo con el derecho en la fila central.
- Glotón dibujado como círculo amarillo con boca animada (ángulo de apertura que oscila según el avance), movimiento continuo en píxeles a velocidad constante a lo largo de los corredores, con giro permitido solo cuando está alineado al centro de una celda y la celda destino no es pared.
- Dirección deseada (`desiredDir`) buffereada desde el teclado y aplicada en cuanto el glotón queda alineado a una celda y el giro es legal; si no hay giro legal disponible sigue en su dirección actual hasta chocar con una pared (y ahí se detiene).
- Puntos comibles: cada celda `.` vale +10 puntos y se marca como comida al pasar el glotón por su centro; el contador de puntos restantes se mantiene en el estado.
- Cuatro fantasmas que arrancan desde/alrededor de la casa central y persiguen al glotón con IA de persecución directa (básica): en cada intersección eligen, entre las direcciones legales (sin invertir de golpe hacia la que vienen), la que minimiza la distancia Manhattan en celdas hacia la celda actual del glotón. Todos usan el mismo objetivo (la celda del glotón) en este spec.
- Colisión glotón-fantasma: si el glotón y cualquier fantasma ocupan la misma celda (o se cruzan en el mismo paso), el glotón pierde una vida.
- Vidas: arranca en 3 (`onLivesChange(3)`). Al perder una vida, el glotón y los cuatro fantasmas vuelven a sus posiciones de inicio tras una breve pausa (`respawnDelay`), conservando los puntos ya comidos y el score. Al llegar a 0 vidas: game over (`onGameOver(score, false)`).
- Victoria: al comer el último punto del laberinto, la partida termina como ganada (`onGameOver(score, true)`), igual que el flag `won` que usó Arkanoid al completar sus niveles.
- Túnel lateral: al salir por el borde izquierdo o derecho en la fila del túnel, el glotón (y los fantasmas) reaparecen por el borde opuesto.
- Controles por teclado vía `e.code` (flechas `ArrowUp/Down/Left/Right` y WASD `KeyW/A/S/D`), con `preventDefault` en las teclas de control para evitar el scroll de la página.
- Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa) y movimiento integrado por `dt` (píxeles = velocidad × dt).
- `onScoreChange`/`onLivesChange` disparados solo cuando el valor cambia. `onLevelChange(1)` una sola vez al iniciar/reiniciar (nivel único en este spec). El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye el laberinto lleno de puntos, glotón y fantasmas en sus posiciones de inicio, score 0, 3 vidas; `forceGameOver()` fuerza el game over inmediato con el score acumulado (`won = false`).
- Reusar el juego decorativo existente `gloton` (ya sembrado en la tabla `games` por SPEC 06: título GLOTÓN, `cat` ARCADE, `cover` cover-glot, `color` yellow) — no se inserta ni se actualiza ninguna fila en Supabase, solo se registra el componente en `GAME_REGISTRY` con la clave `"gloton"`.

**Fuera de alcance (para specs futuros si llegan):**

- Píldoras de poder / modo asustado con fantasmas huyendo y comestibles (va en `gloton-02-power-pellets.md`).
- Frutas bonus y progresión de niveles con dificultad creciente (va en `gloton-03-personalidades-niveles.md`).
- Personalidades distintas por fantasma y alternancia scatter/chase (va en `gloton-03-personalidades-niveles.md`).
- Sprites/animación propios más allá del círculo con boca y los cuerpos de fantasma dibujados con canvas.
- Controles táctiles/móviles.
- Sonido/música.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`gloton` ya existe en `games`, sembrado por SPEC 06). Lo nuevo es el estado interno del componente y el módulo del laberinto:

```ts
// app/components/games/gloton-game.tsx
import type { GameComponentProps, GameComponentHandle } from "./registry";

type Direction = "up" | "down" | "left" | "right";

interface Actor {
  x: number; // posición en píxeles (centro), no en celdas
  y: number;
  dir: Direction;
  speed: number; // px/s
}

interface Ghost extends Actor {
  id: "blinky" | "pinky" | "inky" | "clyde"; // solo identidad visual/color en este spec
  color: string;
}

type Pac = Actor & { mouthPhase: number }; // mouthPhase alimenta el ángulo de la boca

interface GameData {
  pac: Pac;
  ghosts: Ghost[];
  dots: boolean[]; // indexado por row*COLS+col; true = punto sin comer
  dotsLeft: number; // decrece hasta 0 (victoria)
  desiredDir: Direction | null; // último input de teclado pendiente de aplicar
  score: number;
  lives: number; // 3 → 0
  respawnTimer: number; // ms restantes de pausa tras perder una vida (0 = jugando)
  state: "playing" | "respawning" | "gameover" | "won";
}

export type GlotonGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type GlotonGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

```ts
// app/components/games/gloton-maze.ts
// Cada string es una fila de 28 caracteres; 31 filas en total.
// '#' pared · '.' punto · ' ' vacío · 'P' inicio glotón · 'G' casa fantasmas · 'T' túnel
export const MAZE: string[] = [
  "############################",
  "#............##............#",
  // ...resto de las 31 filas, laberinto simétrico con 4 esquinas y casa central
];

export const COLS = 28;
export const ROWS = 31;
export const TILE = 20; // canvas 560×620
```

Convenciones:

- `COLS = 28`, `ROWS = 31`, `TILE = 20` (canvas 560×620, resolución fija escalada dentro de `.crt-screen`).
- +10 puntos por punto comido; victoria cuando `dotsLeft === 0`.
- Velocidad base del glotón ligeramente mayor que la de los fantasmas (p. ej. `pac.speed = 90`, `ghost.speed = 80` px/s) para que la persecución sea tensa pero escapable.
- `respawnDelay` de ~1000ms tras perder una vida antes de reposicionar y reanudar.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo.

## Plan de implementación

1. **Metadata confirmada (sin cambios en Supabase).** Confirmar que la fila `gloton` ya sembrada (`title` GLOTÓN, `short`, `long`, `cat` ARCADE, `cover` cover-glot, `color` yellow) sirve para el comecocos real; no se ejecuta ningún `INSERT`/`UPDATE`. Prueba: `select * from games where id = 'gloton'` devuelve la fila esperada sin cambios.
2. **Módulo del laberinto.** Crear `app/components/games/gloton-maze.ts` con la matriz `MAZE` de 28×31 (paredes, puntos, casa de fantasmas, celdas de inicio, túnel) y las constantes `COLS`/`ROWS`/`TILE`. Prueba: un helper de parseo cuenta filas=31, columnas=28 y una cantidad par y simétrica de puntos; `gloton-maze.ts` compila sin errores de tipos.
3. **Render estático del laberinto.** Crear `app/components/games/gloton-game.tsx` que dibuja el laberinto (paredes de neón, puntos como círculos pequeños) y el glotón inmóvil en su celda de inicio, sin movimiento aún. Loop `requestAnimationFrame` con `dt` capado a 50ms montado pero solo redibujando. Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página; render local muestra el laberinto completo con todos los puntos.
4. **Movimiento del glotón.** Implementar movimiento continuo en píxeles con giro solo al estar alineado a celda, buffer `desiredDir` desde teclado (`e.code`, flechas + WASD, `preventDefault`), colisión contra paredes, túnel lateral, y consumo de puntos (+10, decrementa `dotsLeft`) al cruzar el centro de una celda con punto. Boca animada. Prueba local: el glotón recorre los corredores, no atraviesa paredes, cruza el túnel de un lado al otro, y cada punto comido suma 10 al score reportado por `onScoreChange`.
5. **Fantasmas con persecución directa.** Agregar los 4 fantasmas que salen de la casa y en cada intersección eligen la dirección legal (sin invertir de golpe) que minimiza la distancia Manhattan a la celda del glotón. Colisión glotón-fantasma resta una vida, entra en `respawning` ~1000ms y reposiciona a todos; a 0 vidas dispara `onGameOver(score, false)`. Prueba local: los fantasmas persiguen al glotón por el laberinto, tocar uno resta una vida (HUD lo refleja), tras el respawn todos vuelven a su inicio, y quedarse sin vidas abre el modal de fin de partida.
6. **Victoria y ref imperativa.** Al comer el último punto dispara `onGameOver(score, true)`. Implementar `forwardRef` + `useImperativeHandle` con `reset()` (laberinto lleno, glotón/fantasmas en inicio, score 0, 3 vidas, nivel 1) y `forceGameOver()` (game over inmediato con `won = false`). `onLevelChange(1)` una vez al iniciar. Prueba local: comer todos los puntos abre el modal como victoria; FIN corta con `won = false`; JUGAR DE NUEVO reinicia completo.
7. **Registro.** Agregar `"gloton": { Component: GlotonGame }` a `GAME_REGISTRY` en `app/components/games/registry.ts` (sin `extraStatLabel`). Prueba: `/games/gloton/jugar` carga el comecocos real en canvas en vez de la simulación decorativa — `game-player.tsx` no necesita cambios.
8. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/gloton/jugar`: mover el glotón con flechas y WASD, comer puntos (+10 cada uno), esquivar los 4 fantasmas, perder vidas con respawn, vaciar el laberinto para ganar, PAUSA congela el loop, FIN cierra con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia sin recargar. Confirmar que los demás juegos (`rocas`, `caida`, `bloque-buster`, `serpentina` y los decorativos) siguen sin cambios.
9. **Cierre.** Verificar los criterios de aceptación uno por uno; el spec queda en Borrador para que Tito lo apruebe y lo implemente vía `/add-game`.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/gloton/jugar` carga sin errores en consola, con el comecocos real en canvas en vez de la simulación decorativa.
- [ ] El laberinto se dibuja completo (paredes de neón + todos los puntos) a resolución fija escalada dentro de `.crt-screen`.
- [ ] El glotón se mueve con las flechas y con WASD, gira solo en corredores legales, no atraviesa paredes y aparece por el borde opuesto al cruzar el túnel lateral.
- [ ] Comer un punto suma exactamente 10 puntos y lo elimina del laberinto; el HUD refleja el score en vivo.
- [ ] Los cuatro fantasmas persiguen al glotón eligiendo en cada intersección la dirección legal que acorta la distancia hacia él, sin invertir de golpe.
- [ ] Tocar un fantasma resta una vida; tras una breve pausa el glotón y los fantasmas vuelven a sus posiciones de inicio conservando los puntos ya comidos.
- [ ] El HUD "Vidas" arranca en 3 ♥ y baja al perder cada vida; a 0 vidas se abre el modal de fin de partida (`won = false`).
- [ ] Comer el último punto del laberinto termina la partida como victoria (`won = true`).
- [ ] El HUD "Nivel" muestra 1 durante toda la partida y no se muestra ningún stat extra.
- [ ] El botón PAUSA congela el loop por completo (glotón y fantasmas se detienen); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada y abre el modal (`won = false`).
- [ ] "GUARDAR PUNTUACIÓN" añade una fila real a `scores` en Supabase con `game_id = 'gloton'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego desde cero (laberinto lleno, glotón y fantasmas en inicio, score 0, 3 vidas) sin recargar la página.
- [ ] "SALIR" navega a `/games/gloton` sin errores.
- [ ] Las flechas y WASD no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`rocas`, `caida`, `bloque-buster`, `serpentina` y los decorativos) siguen sin cambios.
- [ ] La fila `gloton` en la tabla `games` de Supabase no cambia (metadata ya sembrada por SPEC 06).

## Decisiones

- **Sí:** reusar el id/juego decorativo existente `gloton` (ya sembrado en Supabase por SPEC 06 con título GLOTÓN, `cat` ARCADE, `cover` cover-glot, `color` yellow) en vez de crear un id nuevo. Mismo patrón que `caida`, `bloque-buster` y `serpentina`; evita un `INSERT` innecesario y reusa el cover ya existente.
- **Sí:** construir desde cero (no hay fuente en `references/started-games/` para un comecocos). El laberinto se define como una matriz de caracteres embebida, fácil de leer y ajustar.
- **Sí:** canvas 560×620 (28×31 celdas de 20px) en vez de 800×600, escalado dentro de `.crt-screen`. Prioriza la proporción correcta del laberinto clásico sobre igualar la resolución de los otros juegos; el mecanismo de escalado ya es genérico.
- **Sí:** 3 vidas con respawn (posiciones de inicio, score conservado), a diferencia de la vida única de Snake/Tetris. Fiel al comecocos clásico y da uso real a `onLivesChange` con valores mayores a 1.
- **Sí:** movimiento continuo en píxeles con giro solo al estar alineado a celda (buffer `desiredDir`), en vez de saltos de celda a celda tipo Snake. Da la sensación de deslizamiento clásica y permite "adelantar" el giro en las esquinas.
- **Sí:** persecución directa idéntica para los 4 fantasmas en la base (todos apuntan a la celda del glotón). Las personalidades distintas y el scatter/chase se dejan explícitamente para `gloton-03`.
- **Sí:** victoria con `onGameOver(score, true)` al vaciar el laberinto, reusando el flag `won` que introdujo Arkanoid (SPEC 08). Coherente con el contrato compartido, sin ampliarlo.
- **No:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel`) en la base. Se reserva para los segundos de "modo asustado" en `gloton-02`.
- **No:** tocar `game-player.tsx` — ya resuelve el componente a mostrar genéricamente vía `GAME_REGISTRY[game.id]`, sin condicionales por juego.

## Riesgos

| Riesgo                                                                                                                                               | Mitigación                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El movimiento continuo en píxeles puede desalinearse del centro de las celdas y hacer que el glotón atraviese paredes o "se pegue" en las esquinas.  | Detectar la alineación con una tolerancia (`snap`) al centro de celda antes de permitir un giro, y forzar la posición al centro exacto cuando se produce el giro; las paredes se chequean contra la celda destino, no contra el píxel actual. |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame` o los listeners de teclado. | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `asteroids-game.tsx`/`serpentina-game.tsx`; se verifica manualmente en dev.          |
| La IA de persecución directa puede hacer que los fantasmas se amontonen todos en la misma ruta y resulten triviales o imposibles de esquivar.        | La regla anti-inversión y las salidas escalonadas desde la casa reparten a los fantasmas por rutas distintas; el balance fino (velocidades) se ajusta en el playtest del paso 8.                                                              |
| El `dt` alto tras una pestaña en segundo plano podría teletransportar actores varias celdas y saltarse colisiones.                                   | El `dt` capado a 50ms (convención de la casa) limita el desplazamiento por frame a menos de una celda a las velocidades elegidas, evitando saltos de colisión.                                                                                |

## Qué **no** está en este spec

- Píldoras de poder / modo asustado con fantasmas comestibles (va en `gloton-02-power-pellets.md`).
- Frutas bonus y progresión de niveles con dificultad creciente (va en `gloton-03-personalidades-niveles.md`).
- Personalidades distintas por fantasma y alternancia scatter/chase (va en `gloton-03-personalidades-niveles.md`).
- Sprites/animación propios más allá del dibujo en canvas.
- Controles táctiles/móviles.
- Sonido/música, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
