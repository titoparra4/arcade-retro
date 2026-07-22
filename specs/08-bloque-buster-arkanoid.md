# SPEC 08 — Juego real: Bloque Buster (Arkanoid)

> **Estado:** Aprobado
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `bloque-buster` ya sembrada), SPEC 07 (convención sin sonido, estado mutable en `useRef`)
> **Fecha:** 2026-07-22
> **Objetivo:** Portar `references/started-games/04-arkanoid/game.js` a un componente cliente en canvas (`BloqueBusterGame`) e integrarlo en `/games/bloque-buster/jugar` con mouse y teclado, reemplazando la simulación decorativa del breakout ya sembrado en Supabase, y extender el contrato compartido (`onGameOver`) con un flag `won` opcional para distinguir la victoria (completar los 5 niveles) del game over por pérdida de vidas.

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/bloque-buster-game.tsx` que porta la lógica completa de `game.js`: paleta, pelota, colisiones AABB con bloques, rebotes en paredes y paleta, 5 niveles (`levels.js`, patrones de bloques y multiplicador de velocidad `1.00`→`1.46`), 3 vidas, score (+10 por bloque), animación de explosión (4 frames del spritesheet al romper un bloque), y estado de victoria al limpiar el nivel 5.
- Canvas de resolución fija 800×600 (igual que Asteroids), dentro del `.crt-screen` existente, sin deformación.
- Controles híbridos: la paleta se mueve con el mouse (arrastre, escalando coordenadas vía `canvas.getBoundingClientRect()`, igual que el original) **y** con las flechas ← →; ambos métodos conviven y pueden alternarse en la misma partida.
- Assets estáticos (`spritesheet-breakout.png`, `spritesheet.js`) copiados a `public/` y cargados de forma async antes de arrancar el loop (gate de carga), igual que documenta `template.md`. Los archivos de sonido (`ball-bounce.mp3`, `break-sound.mp3`) **no** se copian — sin sonido, según convención ya establecida en SPEC 05/07.
- Se elimina el HUD interno del original (score/vidas/nivel dibujados en canvas, overlay de "GAME OVER"/"¡Completaste el juego!", overlay de pausa con selector de nivel 1–5) — el HUD/modal compartido de `GamePlayer` es la única fuente visual de esos datos.
- Reusar el juego decorativo existente `bloque-buster` (ya sembrado en la tabla `games`: título BLOQUE BUSTER, `cat` ARCADE, `cover` cover-bricks, `color` cyan) — no se inserta una fila nueva en Supabase, solo se registra el componente en `GAME_REGISTRY` con la clave `"bloque-buster"`.
- **Extensión del contrato compartido:** `GameComponentProps.onGameOver` pasa de `(finalScore: number) => void` a `(finalScore: number, won?: boolean) => void` en `app/components/games/registry.ts`. Asteroids y Tetris no pasan el segundo argumento (siguen mostrando "FIN DEL JUEGO" sin cambios). `GamePlayer` guarda un nuevo estado `won` y muestra el título "¡VICTORIA!" en el modal en vez de "FIN DEL JUEGO" cuando `won` es `true`; el resto del modal (score, guardar puntuación, jugar de nuevo, volver al arcade) queda idéntico.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye paleta centrada, pelota en nivel 1, 3 vidas, score 0 y `won=false`; `forceGameOver()` fuerza el fin inmediato con el score acumulado (`won=false`, es un abandono, no una victoria).
- El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa.
- Teclado vía `e.code` con `preventDefault` en flechas (sin espacio, que el original no usa para nada en Arkanoid). Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa).
- Solo se porta la lógica de `game.js`/`levels.js`/`spritesheet.js`; no se copian `index.html`, `README.md`, `CLAUDE.md` ni los archivos de audio del original.

**Fuera de alcance (para specs futuros si llegan):**

- Sonido/música (`ball-bounce.mp3`, `break-sound.mp3`) — convención ya establecida en SPEC 05/07.
- El selector de nivel 1–5 por click durante la pausa — se elimina, redundante con el overlay de pausa compartido.
- Controles táctiles/móviles.
- Power-ups o mecánicas nuevas no presentes en el original (multi-bola, paleta láser, etc.).
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`bloque-buster` ya existe en `games`, sembrado por SPEC 06). Lo nuevo es el contrato compartido extendido y el estado interno del componente:

```ts
// app/components/games/registry.ts — cambio de firma (retrocompatible)
export interface GameComponentProps {
  paused: boolean;
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number, won?: boolean) => void; // won: true solo al completar el último nivel
  onExtraStatChange: (value: number) => void;
}
```

```ts
// app/components/games/bloque-buster-game.tsx
interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string; // 'red' | 'yellow' | 'cyan' | 'magenta' | 'hotpink' | 'green' | 'gray'
  alive: boolean;
}

interface Explosion {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  elapsed: number; // ms, hasta EXPLOSION_DURATION
}

interface GameData {
  paddle: { x: number; y: number; w: number; h: number };
  ball: { x: number; y: number; w: number; h: number; vx: number; vy: number };
  blocks: Block[];
  explosions: Explosion[];
  lives: number;
  score: number;
  currentLevel: number; // 1..5
  state: "playing" | "gameover" | "win";
}

export type BloqueBusterGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type BloqueBusterGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

Convenciones (heredadas de `references/started-games/04-arkanoid/game.js` y `levels.js`, sin cambios de valores):

- Canvas 800×600. `BLOCK_COLS=10`, `BLOCK_ROWS=6`, `BLOCK_W=64`, `BLOCK_H=24`.
- `BASE_BALL_VX=200`, `BASE_BALL_VY=-300`, multiplicados por el `speed` del nivel actual (`1.00, 1.10, 1.21, 1.33, 1.46`).
- `LEVELS` (5 patrones: parrilla completa, pirámide, tablero de ajedrez, filas con huecos, marco+cruz) se porta tal cual desde `levels.js`.
- 10 pts por bloque roto; 3 vidas iniciales.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo (a diferencia del original).

En `app/components/game-player.tsx`, nuevo estado local `won` (boolean, `useState(false)`), seteado por `handleGameOver(finalScore, won = false)`; el modal usa `won ? "¡VICTORIA!" : "FIN DEL JUEGO"` como título.

## Plan de implementación

1. **Extender el contrato compartido.** En `app/components/games/registry.ts`, cambiar la firma de `onGameOver` a `(finalScore: number, won?: boolean) => void`. En `app/components/game-player.tsx`, agregar `const [won, setWon] = useState(false)`; `handleGameOver` pasa a `(finalScore, won = false) => { setScore(finalScore); setWon(won); setOver(true); }`; `restart` resetea `won` a `false`; el modal usa `<h2>{won ? "¡VICTORIA!" : "FIN DEL JUEGO"}</h2>`. Prueba: `npm run build` pasa; Asteroids y Tetris siguen mostrando "FIN DEL JUEGO" sin cambios (no pasan el segundo argumento).
2. **Assets estáticos.** Copiar `references/started-games/04-arkanoid/assets/spritesheet-breakout.png` y `assets/spritesheet.js` a `public/` (sin los archivos de sonido). Prueba: los archivos son accesibles vía `/spritesheet-breakout.png` en el servidor de dev.
3. **Puerto del juego a componente canvas.** Crear `app/components/games/bloque-buster-game.tsx`: portar paleta, pelota, bloques, colisiones AABB, rebotes, 5 niveles con velocidades, 3 vidas, score, animación de explosión (4 frames). Canvas 800×600. Controles híbridos: `canvas.getBoundingClientRect()` para arrastre de paleta con mouse, más flechas ← → con `preventDefault`. Loop `requestAnimationFrame` con `dt` capado a 50ms, con gate de carga async del spritesheet antes de arrancar. `forwardRef` + `useImperativeHandle` exponiendo `reset()`/`forceGameOver()`. Al limpiar el nivel 5, dispara `onGameOver(score, true)`; al perder la última vida, dispara `onGameOver(score, false)`. `onScoreChange`/`onLivesChange`/`onLevelChange` disparados solo al cambiar; `onExtraStatChange` no se llama. Sin HUD ni overlays internos (ni selector de nivel, ni pantalla de pausa propia). Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página.
4. **Registro.** Agregar `"bloque-buster": { Component: BloqueBusterGame }` a `GAME_REGISTRY` (sin `extraStatLabel`). Prueba: `/games/bloque-buster/jugar` carga el Arkanoid real en canvas en vez de la simulación decorativa — `game-player.tsx` no necesita más cambios de los ya hechos en el paso 1.
5. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/bloque-buster/jugar`: mover la paleta con mouse y con flechas (alternando entre ambos), rebotes de pelota en paredes/paleta/bloques, explosión visual al romper un bloque, avance automático de nivel al limpiar todos los bloques (1→5, velocidad creciente), pérdida de vida al caer la pelota, game over con `won=false` al llegar a 0 vidas (modal "FIN DEL JUEGO"), victoria con `won=true` al limpiar el nivel 5 (modal "¡VICTORIA!"), PAUSA congela el loop, FIN cierra la partida con el score acumulado (`won=false`), GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia completo sin recargar la página. Confirmar que Asteroids, Tetris y los demás juegos decorativos siguen sin cambios.
6. **Cierre.** Verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Aprobado" → luego "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/bloque-buster/jugar` carga sin errores en consola, con el Arkanoid real en canvas en vez de la simulación decorativa.
- [ ] La paleta se mueve arrastrándola con el mouse **y** con las flechas ← →, pudiendo alternar entre ambos métodos en la misma partida.
- [ ] La pelota rebota correctamente en paredes, techo y paleta; al romper un bloque se suman 10 puntos y se ve la animación de explosión (4 frames).
- [ ] Al limpiar todos los bloques del nivel actual, el juego avanza automáticamente al siguiente nivel (nuevo patrón de bloques, velocidad de pelota aumentada según la tabla del original) sin perder la partida.
- [ ] Al caer la pelota se pierde una vida y la pelota se reposiciona en la paleta; al llegar a 0 vidas el juego pasa a game over con `won=false` y el modal muestra "FIN DEL JUEGO".
- [ ] Al limpiar el nivel 5 (el último), el juego pasa a estado de victoria con `won=true` y el modal muestra "¡VICTORIA!" en vez de "FIN DEL JUEGO", con el resto del modal (score, guardar, jugar de nuevo, volver al arcade) igual que en game over.
- [ ] El HUD exterior (Jugador/Puntuación/Vidas/Nivel) refleja en vivo el score, las vidas y el nivel reales, sin HUD duplicado dentro del canvas.
- [ ] No se muestra ningún stat extra en el HUD (el slot de stat extra no se usa para este juego).
- [ ] No hay ningún sonido reproduciéndose durante el juego.
- [ ] No existe ningún selector de nivel clicable dentro del canvas durante la pausa.
- [ ] El botón PAUSA congela el loop del juego por completo (paleta y pelota dejan de moverse); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada hasta ese momento, abre el modal con `won=false` ("FIN DEL JUEGO").
- [ ] "GUARDAR PUNTUACIÓN" en el modal (tanto en game over como en victoria) añade una fila real a `scores` en Supabase con `game_id = 'bloque-buster'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego real desde cero (paleta centrada, nivel 1, 3 vidas, score 0, `won=false`) sin recargar la página.
- [ ] "SALIR" navega a `/games/bloque-buster` sin errores.
- [ ] Las flechas no hacen scroll de la página mientras se juega.
- [ ] Asteroids (`rocas`) y Tetris (`caida`) siguen mostrando "FIN DEL JUEGO" sin cambios al terminar una partida (no se ven afectados por el nuevo parámetro `won` de `onGameOver`).
- [ ] Los demás juegos decorativos siguen sin cambios visuales ni de comportamiento.
- [ ] La fila `bloque-buster` en la tabla `games` de Supabase no cambia (metadata ya sembrada por SPEC 06).

## Decisiones

- **Sí:** reusar el id/juego decorativo existente `bloque-buster` (ya sembrado en Supabase por SPEC 06 con título BLOQUE BUSTER, `cat` ARCADE, `cover` cover-bricks, `color` cyan) en vez de crear un id nuevo. Mismo patrón que `rocas` (Asteroids) y `caida` (Tetris); evita un `INSERT` innecesario.
- **Sí:** portar controles híbridos (mouse + teclado), a diferencia de Asteroids y Tetris que son solo teclado. Decisión explícita del usuario para mantener fidelidad con el original, que depende del mouse como control principal de la paleta.
- **No:** portar los efectos de sonido (`ball-bounce.mp3`, `break-sound.mp3`). Mantiene la convención ya establecida en SPEC 05 y SPEC 07 de dejar sonido/música fuera de alcance.
- **Sí:** portar la animación de explosión (4 frames del spritesheet al romper un bloque). Es feedback visual, no sonido — coherente con las partículas de Asteroids.
- **No:** mantener el selector de nivel 1–5 por click durante la pausa. Redundante con el overlay de pausa compartido de `GamePlayer`; mantenerlo requeriría dibujar UI clicable dentro del canvas durante una pausa que ya es responsabilidad exclusiva del HUD compartido.
- **Sí:** extender `GameComponentProps.onGameOver` con un segundo argumento opcional `won?: boolean`, en vez de agregar un callback nuevo (`onGameWin`) o resolver la victoria con lógica especial por juego en `game-player.tsx`. Un parámetro opcional es retrocompatible (Asteroids/Tetris no lo pasan y siguen igual) y evita reintroducir condicionales por `game.id` en `GamePlayer`, que SPEC 06 explícitamente eliminó.
- **Sí:** en el modal de victoria, solo cambia el título ("¡VICTORIA!" en vez de "FIN DEL JUEGO"); el resto del modal (color, score, guardar puntuación, jugar de nuevo, volver al arcade) queda idéntico. Decisión explícita del usuario — evita duplicar estilos/lógica de un modal "de victoria" separado.
- **Sí:** `forceGameOver()` siempre dispara `won=false` (es un abandono de partida, nunca una victoria), incluso si se llama teóricamente después de limpiar el nivel 5 — en la práctica esto no ocurre porque el propio juego dispara `onGameOver(score, true)` automáticamente al limpiar el último nivel.
- **Sí:** canvas con resolución fija 800×600 sin deformación (igual que Asteroids), a diferencia de Tetris que aceptó deformación por fidelidad 1:1. El original de Arkanoid ya usa 800×600, coincidente con el marco 4:3 de `.crt-screen`.
- **No:** tocar la lógica de física/mecánicas del juego original (velocidades, multiplicador de velocidad por nivel, puntaje por bloque). Se porta tal cual, igual que la convención ya establecida en SPEC 05/07.

## Riesgos

| Riesgo                                                                                                                                                                                                  | Mitigación                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modificar la firma de `onGameOver` en el contrato compartido (`registry.ts`) podría romper por error los componentes ya existentes (`AsteroidsGame`, `CaidaGame`) si no se los actualiza con cuidado    | El parámetro `won` es opcional (`won?: boolean`); ambos componentes existentes siguen llamando `onGameOver(finalScore)` sin cambios de código. Se verifica en el playtest que Asteroids y Tetris sigan mostrando "FIN DEL JUEGO" tras el cambio.  |
| Controles híbridos (mouse + teclado) pueden pisarse entre sí si ambos intentan mover la paleta en el mismo frame, generando jitter o una sensación de control "peleado"                                 | Se porta el mismo orden de prioridad que el original: el `mousemove` fija `paddle.x` directamente, y el `update()` de teclado se aplica después sobre ese mismo valor cada frame — igual que en `game.js`, donde ya conviven ambos sin conflicto. |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame`, los listeners de teclado/mouse, o disparar la carga del spritesheet dos veces | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `asteroids-game.tsx`/`caida-game.tsx`; se verifica manualmente en dev.                   |
| Sin los efectos de sonido del original, el feedback de rebote/rotura de bloque puede sentirse incompleto frente al juego de referencia                                                                  | Aceptado por decisión explícita (ver Decisiones), consistente con la convención ya aplicada en SPEC 05/07.                                                                                                                                        |

## Qué **no** está en este spec

- Sonido/música (`ball-bounce.mp3`, `break-sound.mp3`).
- El selector de nivel 1–5 por click durante la pausa.
- Controles táctiles/móviles.
- Power-ups o mecánicas nuevas no presentes en el original.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
