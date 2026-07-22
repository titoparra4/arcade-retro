# SPEC 07 — Juego real: Caída (Tetris)

> **Estado:** Implementado
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `caida` ya sembrada)
> **Fecha:** 2026-07-22
> **Objetivo:** Portar `references/started-games/03-tetris/game.js` a un componente cliente en canvas (`CaidaGame`) e integrarlo en `/games/caida/jugar`, reemplazando la simulación decorativa del juego "CAÍDA" (ya sembrado en Supabase como Tetris) por el Tetris real, conectado al HUD, pausa, botón FIN y modal de guardado de puntuación ya existentes.

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/caida-game.tsx` que porta toda la lógica de `game.js`: tablero 10×20, los 8 tipos de pieza (I, O, T, S, Z, J, L y "N"/tuerca) con sus colores, generación aleatoria, rotación (`rotateCW`) con wall kicks (`tryRotate`, kicks `[0,-1,1,-2,2]`), colisión (`collide`), fijado de pieza (`merge`/`lockPiece`), limpieza de líneas (`clearLines`, tabla `LINE_SCORES = [0,100,300,500,800]` × nivel), pieza fantasma (`ghostY`, dibujada con alpha 0.2), soft drop (+1 punto/fila) y hard drop (+2 puntos/celda), niveles cada 10 líneas con `dropInterval = max(100, 1000 − (nivel−1) × 90)`.
- Canvas único de resolución fija 300×600 (`BLOCK = 30`, 10×20), escalado por CSS para llenar el marco `.crt-screen` (4:3) existente — se acepta la deformación visual resultante (ver Decisiones).
- Vista previa de "siguiente pieza" dibujada como un recuadro semitransparente superpuesto en la esquina superior derecha del mismo canvas (no un canvas separado, a diferencia del original).
- Se elimina todo el HUD interno del original (panel lateral SCORE/LINES/LEVEL/CONTROLS, overlay de PAUSA/GAME OVER con botón de reinicio, toggle de tema claro/oscuro) — el HUD/modal compartido de `GamePlayer` es la única fuente visual de esos datos.
- Reusar el juego decorativo existente `caida` (ya sembrado en la tabla `games`: título CAÍDA, `cat` PUZZLE, `cover` cover-tetro, `color` magenta) — no se inserta una fila nueva en Supabase, solo se registra el componente en `GAME_REGISTRY` con la clave `"caida"`.
- `onLivesChange` se reporta fijo en `1` al iniciar/reiniciar y nunca vuelve a cambiar (Tetris no tiene vidas; el HUD exterior siempre muestra al menos un ♥ hasta el game over).
- El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa — las líneas totales no se reportan al HUD exterior; el nivel (que sí se reporta) refleja el progreso indirectamente.
- Teclado vía `e.code` con `preventDefault` en las teclas de control (flechas + espacio), igual que Asteroids. Se elimina la tecla `P` de pausa interna del original — la pausa la controla el botón compartido PAUSA/REANUDAR vía la prop `paused`.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye tablero vacío, score 0, líneas 0, nivel 1 y nueva pieza; `forceGameOver()` fuerza el game over inmediato con el score acumulado hasta ese momento.
- Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa), aunque el original no lo capea.
- Solo se porta la lógica de `game.js`; no se copian `index.html`, `style.css`, `README.md` ni `CLAUDE.md` del original.

**Fuera de alcance (para specs futuros si llegan):**

- Controles táctiles/móviles.
- "Hold piece" (guardar pieza para después) — no existe en el original, no se agrega.
- Multiplayer / versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`) — se reutiliza tal cual.
- Sonido/música.
- Tests (no hay setup de tests en el proyecto).
- Modificar el HUD compartido (`game-player.tsx`) para soportar un stat extra sin sufijo "s" — decisión explícita de no tocar el contrato compartido en este spec.
- Cambiar la resolución del canvas para eliminar la deformación visual dentro del marco 4:3 — aceptado como riesgo de este spec.

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`caida` ya existe en `games`, sembrado por SPEC 06). Lo nuevo es el estado interno del componente y su contrato, siguiendo el mismo patrón que `asteroids-game.tsx`:

```ts
// app/components/games/caida-game.tsx
type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 0 = vacía; 1–8 = índice de color por tipo de pieza

interface Piece {
  type: Cell;
  shape: Cell[][]; // matriz cuadrada, ver PIECES del original
  x: number;
  y: number;
}

interface GameData {
  board: Cell[][]; // ROWS × COLS (20 × 10)
  current: Piece;
  next: Piece;
  score: number;
  lines: number;
  level: number;
  dropInterval: number; // ms, recalculado al subir de nivel
  dropAccum: number;
  state: "playing" | "gameover";
}

export type CaidaGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type CaidaGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

Convenciones (heredadas de `references/started-games/03-tetris/game.js`, sin cambios de valores):

- `COLS = 10`, `ROWS = 20`, `BLOCK = 30` (canvas 300×600).
- `COLORS` y `PIECES` (8 tipos: I, O, T, S, Z, J, L, N/tuerca) se portan con los mismos valores del original.
- `LINE_SCORES = [0, 100, 300, 500, 800]`, multiplicado por `level`.
- `level = Math.floor(lines / 10) + 1`; `dropInterval = Math.max(100, 1000 - (level - 1) * 90)`.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo (a diferencia del original).

## Plan de implementación

1. **Metadata confirmada (sin cambios en Supabase).** Confirmar que la fila `caida` ya sembrada (`title`, `short`, `long`, `cat`, `cover`, `color`) sigue siendo correcta para el Tetris real; no se ejecuta ningún `INSERT`/`UPDATE`. Prueba: `select * from games where id = 'caida'` devuelve la fila esperada sin cambios.
2. **Puerto del juego a componente canvas.** Crear `app/components/games/caida-game.tsx`: portar tablero, las 8 piezas, colisión, rotación con wall kicks, fijado de pieza, limpieza de líneas, pieza fantasma, vista previa de "siguiente pieza" (recuadro superpuesto), puntuación y niveles — mismos valores que el original. Canvas 300×600. Captura de teclado vía `e.code` con `preventDefault` en flechas + espacio (sin tecla `P`). Loop `requestAnimationFrame` con `dt` capado a 50ms. `forwardRef` + `useImperativeHandle` exponiendo `reset()`/`forceGameOver()`. `onScoreChange`/`onLevelChange` disparados solo al cambiar; `onLivesChange(1)` una sola vez al iniciar/reiniciar; `onExtraStatChange` no se llama (el HUD lo ignora en 0). Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página.
3. **Registro.** Agregar `"caida": { Component: CaidaGame }` a `GAME_REGISTRY` en `app/components/games/registry.ts` (sin `extraStatLabel`). Prueba: `/games/caida/jugar` carga el Tetris real en canvas en vez de la simulación decorativa — `game-player.tsx` no necesita cambios porque ya resuelve el componente genéricamente desde el registro.
4. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/caida/jugar`: mover piezas con ←/→, rotar con ↑/X (con wall kicks), soft drop con ↓, hard drop con espacio, pieza fantasma visible, vista previa de siguiente pieza visible en la esquina, líneas completas se limpian y suman puntos según `LINE_SCORES × nivel`, el nivel sube cada 10 líneas y la caída se acelera, PAUSA congela el loop, FIN cierra la partida con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia completo sin recargar la página. Confirmar que los demás juegos (`rocas` y los decorativos) siguen sin cambios.
5. **Cierre.** Verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/caida/jugar` carga sin errores en consola, con el Tetris real en canvas en vez de la simulación decorativa.
- [ ] Las piezas se mueven con ←/→, rotan con ↑ o `X` (con wall kicks: si la rotación choca, se intenta desplazar ±1/±2 columnas antes de descartarla), bajan más rápido con ↓ (soft drop, +1 punto/fila) y caen instantáneamente con espacio (hard drop, +2 puntos/celda).
- [ ] La pieza fantasma se ve en la posición donde aterrizará la pieza actual.
- [ ] La vista previa de la "siguiente pieza" es visible, superpuesta en una esquina del canvas.
- [ ] Al completar una fila (todas las celdas ocupadas), se elimina y se inserta una fila vacía arriba; se suman los puntos según `LINE_SCORES` (`[0,100,300,500,800]`) multiplicado por el nivel actual.
- [ ] Cada 10 líneas eliminadas el nivel sube y la velocidad de caída aumenta (`dropInterval = max(100, 1000 − (nivel−1) × 90)`).
- [ ] El HUD exterior (Jugador/Puntuación/Vidas/Nivel) refleja en vivo el score y el nivel reales; "Vidas" muestra un único ♥ fijo desde el inicio hasta el game over.
- [ ] No se muestra ningún stat extra en el HUD (el slot de stat extra no se usa para este juego).
- [ ] Cuando una pieza nueva no puede aparecer (colisiona al generarse), el juego pasa a game over.
- [ ] El botón PAUSA congela el loop del juego por completo (la pieza deja de caer); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada hasta ese momento y abre el modal de fin de partida.
- [ ] "GUARDAR PUNTUACIÓN" en el modal añade una fila real a `scores` en Supabase con `game_id = 'caida'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego real desde cero (tablero vacío, score 0, líneas 0, nivel 1) sin recargar la página.
- [ ] "SALIR" navega a `/games/caida` sin errores.
- [ ] Las flechas y la barra espaciadora no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`rocas` con el juego real, y los decorativos como `bloque-buster`) siguen sin cambios.
- [ ] La fila `caida` en la tabla `games` de Supabase no cambia (metadata ya sembrada por SPEC 06).

## Decisiones

- **Sí:** reusar el id/juego decorativo existente `caida` (ya sembrado en Supabase por SPEC 06 con título CAÍDA, `cat` PUZZLE, `cover` cover-tetro, `color` magenta) en vez de crear un id `tetris` nuevo. Mismo patrón que `rocas` para Asteroids; evita un `INSERT` innecesario y mantiene consistente la biblioteca de 8 juegos ya existente.
- **Sí:** canvas único de 300×600 (resolución idéntica al original: `BLOCK=30`, 10×20), estirado por CSS dentro del marco `.crt-screen` (4:3), aceptando la deformación visual resultante. Decisión explícita del usuario pese a que se ofreció la alternativa de un canvas 800×600 sin deformar (como `rocas`); se prioriza fidelidad 1:1 con el original sobre ajustar el layout.
- **Sí:** la vista previa de "siguiente pieza" se dibuja como un recuadro superpuesto en una esquina del mismo canvas (no un segundo canvas separado como en el original), para respetar el contrato compartido de un solo elemento de juego por componente.
- **Sí:** `onLivesChange` se fija en `1` una sola vez al iniciar/reiniciar y nunca vuelve a cambiar. Tetris no tiene concepto de vidas (termina por "top out"); fijar en 1 es más intuitivo que fijar en 0 (que mostraría "—" en vez de un corazón) para un HUD que siempre asume al menos una vida en juego.
- **Sí:** el slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa — las líneas totales no se muestran en el HUD exterior. El sufijo fijo "s" que dibuja `game-player.tsx` para ese slot (pensado para conteos de tiempo, como el triple disparo de `rocas`) no calza con un conteo de líneas; modificar ese contrato compartido queda fuera de este spec.
- **Sí:** se elimina la tecla `P` de pausa interna del original — la pausa ya la controla el botón compartido PAUSA/REANUDAR de `GamePlayer` vía la prop `paused`, y mantener ambas sería redundante y confuso.
- **No:** portar el toggle de tema claro/oscuro del original — es chrome de la página standalone original; la plataforma ya tiene su propia estética CRT fija.
- **No:** tocar `game-player.tsx` — ya resuelve el componente a mostrar genéricamente vía `GAME_REGISTRY[game.id]`, sin condicionales por juego (a diferencia de cuando se integró Asteroids en SPEC 05).
- **No:** tocar la lógica de física/puntuación del juego original (velocidades de caída, tabla de puntos por líneas, wall kicks). Se porta tal cual, igual que la convención ya establecida en SPEC 05 para Asteroids.

## Riesgos

| Riesgo                                                                                                                                                                 | Mitigación                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El canvas de 300×600 estirado por CSS dentro del marco 4:3 de `.crt-screen` deforma visiblemente el tablero (se ve ensanchado)                                         | Aceptado por decisión explícita del usuario; prioriza fidelidad 1:1 con el original sobre el ajuste de layout. Si resulta molesto en el playtest, ajustar la resolución del canvas es un cambio menor dentro de este mismo spec, no uno nuevo. |
| El recuadro de "siguiente pieza" superpuesto en una esquina del canvas puede tapar parcialmente piezas activas cuando el tablero está casi lleno (cerca del "top out") | Aceptado como riesgo menor y momentáneo — ocurre solo cerca del game over, cuando la partida ya está prácticamente terminada.                                                                                                                  |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; sin cuidado esto podría duplicar el `requestAnimationFrame` o los listeners de teclado   | El `useEffect` que arranca el loop y añade los listeners de teclado registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `asteroids-game.tsx`; se verifica manualmente en dev.                      |

## Qué **no** está en este spec

- Controles táctiles/móviles.
- "Hold piece", multiplayer/versus, sonido/música.
- Cambios al mecanismo de guardado de puntuaciones o al contrato compartido de `game-player.tsx`.
- Ajustes a la resolución del canvas para eliminar la deformación visual.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
