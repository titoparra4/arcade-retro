# SPEC — Juego real: Tuberías (Pipe Mania)

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase), SPEC 07 (convención sin sonido, estado mutable en `useRef`, loop con `dt` capado)
> **Fecha:** 2026-07-27
> **Objetivo:** Crear desde cero un componente cliente en canvas (`TuberiasGame`) que implemente Pipe Mania clásico —grilla con cola de piezas, cuenta regresiva y flujo continuo que hay que encauzar antes de que reviente, con dificultad creciente por niveles— e integrarlo en `/games/tuberias/jugar`, sembrando una fila nueva en `games` (no hay placeholder previo de este juego).

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/tuberias-game.tsx` que implementa Pipe Mania desde cero: grilla de juego de 16 columnas × 11 filas (celda 50px), con una franja superior de 50px reservada para la vista previa de la cola de piezas (canvas total 800×600, sin deformación).
- 6 tipos de pieza de tubería, cada una con dos aperturas cardinales fijas: `NS` (recta vertical), `EW` (recta horizontal), `NE`, `NW`, `SE`, `SW` (las 4 curvas). Cada pieza nueva de la cola se sortea al azar de forma uniforme entre estos 6 tipos.
- Cola visible de 5 piezas próximas (`QUEUE_SIZE = 5`), dibujada en la franja superior del canvas de izquierda a derecha; la pieza más a la izquierda es la próxima en colocarse. Al colocar una pieza, la cola se desplaza y se agrega una nueva al final.
- Punto de partida fijo (`startCell`) en columna 0, fila 5 (fila central de las 11), con una pieza de "entrada" ya colocada que apunta siempre hacia el Este — el flujo arranca desde ahí y avanza hacia la derecha en su primer paso.
- Al iniciar cada nivel se generan al azar celdas bloqueadas (`kind: "blocked"`, ~10% de las 176 celdas jugables) donde no se puede colocar ninguna pieza; la celda inmediatamente al Este de `startCell` nunca se genera bloqueada, para garantizar un primer movimiento posible.
- Cuenta regresiva visible antes de que arranque el flujo en cada nivel: `countdownMs(nivel) = max(5000, 15000 - (nivel-1)*1000)`, dibujada como número grande superpuesto cerca del punto de partida mientras cuenta. Al llegar a 0, el flujo se activa y empieza a avanzar una celda por paso.
- Colocación de piezas por dos vías equivalentes (ambas conviven en la misma partida, igual que el mouse+teclado de Bloque Buster): (a) teclado — las flechas mueven un cursor resaltado por la grilla (una celda por pulsación, con `e.code`) y `Space`/`Enter` coloca la pieza al frente de la cola en la celda del cursor; (b) mouse — un click sobre una celda del canvas (coordenadas vía `canvas.getBoundingClientRect()`) coloca directamente ahí la pieza al frente de la cola y mueve el cursor a esa celda. Colocar sobre una celda bloqueada u ocupada no hace nada (no consume la cola).
- Avance del flujo: cada `flowInterval(nivel) = max(150, 700 - (nivel-1)*60)` ms, el flujo avanza una celda en la dirección de salida de la pieza actual. Cada pieza tiene dos aperturas cardinales fijas; el flujo entra por una y sale por la opuesta a la que corresponda según la geometría de la pieza (una recta continúa derecho, una curva gira 90°).
- Condición de reventón (game over inmediato): el flujo intenta avanzar a una celda vacía, bloqueada, fuera del tablero, o a una pieza colocada cuya apertura no coincide con el lado por el que el flujo se aproxima.
- Puntuación: +5 puntos al colocar una pieza válida (no bloqueada, no ocupada); +15 puntos por cada celda que el flujo recorre exitosamente.
- Progresión de nivel: cada nivel tiene una meta de longitud de flujo `levelTarget(nivel) = 15 + nivel*5`. Al alcanzarla, sube el nivel (`onLevelChange`), se regenera el tablero completo (nuevas celdas bloqueadas, `startCell` reubicado en la misma fila 5 pero con la columna de partida siempre 0, cola reiniciada), se recalculan `countdownMs`/`flowInterval` para el nuevo nivel, y arranca una nueva cuenta regresiva. El puntaje acumulado no se reinicia entre niveles.
- Vida única: `onLivesChange` se reporta fijo en `1` al iniciar/reiniciar y nunca vuelve a cambiar — un solo reventón termina la partida, sin vidas múltiples (mismo patrón que Tetris/Snake).
- El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa en esta spec base.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye nivel 1 desde cero (tablero nuevo, cola nueva, score 0, cuenta regresiva reiniciada); `forceGameOver()` fuerza el game over inmediato con el score acumulado hasta ese momento, sin importar si el flujo estaba activo o en cuenta regresiva.
- Teclado vía `e.code` con `preventDefault` en las 4 flechas, `Space` y `Enter`. Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa).
- Sin HUD ni overlays internos de score/vidas/nivel — el HUD/modal compartido de `GamePlayer` es la única fuente visual de esos datos; el cursor, la cuenta regresiva y la cola de piezas sí se dibujan dentro del canvas porque son parte del campo de juego, no un HUD duplicado.
- Sembrar una fila nueva en la tabla `games` de Supabase: `id = 'tuberias'`, `title = 'TUBERÍAS'`, `cat = 'PUZZLE'`, `color = 'cyan'`, `cover = 'cover-tuberias'`. No existe placeholder previo de este juego en la base, a diferencia de `caida`/`serpentina`/`bloque-buster`.
- Nueva clase CSS `.cover-tuberias` en `app/globals.css`, siguiendo el mismo patrón visual que las coberturas existentes (gradiente de fondo + pseudo-elemento `::after` con formas geométricas), en tonos cian acorde al `color: cyan` de la fila.

**Fuera de alcance (para specs futuros si llegan):**

- Pieza de cruce ("cross-over"), válvulas, o cualquier pieza especial más allá de las 6 básicas — se cubre en `tuberias-02-modo-presion.md`.
- Medidor de presión / segunda condición de game over independiente del reventón por trayecto — se cubre en `tuberias-02-modo-presion.md`.
- Controles táctiles/móviles.
- Sonido/música.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).
- Selector de modo de juego dentro del propio jugador.

## Modelo de datos

No reutiliza ninguna fila existente de `games` (se inserta `tuberias` de cero, sembrado por esta misma spec en el paso 1 de implementación, no por SPEC 06). El resto es estado interno del componente, siguiendo el mismo patrón que `serpentina-game.tsx`:

```ts
// app/components/games/tuberias-game.tsx
type Direction = "N" | "E" | "S" | "W";
type PieceType = "NS" | "EW" | "NE" | "NW" | "SE" | "SW";

interface GridCell {
  kind: "empty" | "blocked" | "start" | "pipe";
  piece?: PieceType; // solo si kind es "start" o "pipe"
  flowed: boolean; // true una vez que el flujo ya pasó por esta celda
}

interface FlowState {
  active: boolean; // true una vez que countdownMs llega a 0
  col: number;
  row: number;
  length: number; // celdas recorridas en el nivel actual
  stepAccum: number; // ms acumulados desde el último paso de celda
}

interface GameData {
  grid: GridCell[][]; // ROWS × COLS = 11 × 16
  queue: PieceType[]; // longitud fija QUEUE_SIZE = 5
  cursor: { col: number; row: number };
  startCell: { col: number; row: number }; // siempre columna 0, fila 5
  countdownMs: number; // cuenta regresiva del nivel actual; 0 = flujo activo
  flow: FlowState;
  score: number;
  level: number;
  levelTarget: number; // longitud de flujo necesaria para subir de nivel
  state: "playing" | "gameover";
}

export type TuberiasGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type TuberiasGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

Convenciones:

- `COLS = 16`, `ROWS = 11`, `CELL = 50` (tablero jugable 800×550) + franja de cola de 800×50 arriba (canvas total 800×600).
- `startCell = { col: 0, row: 5 }` en todos los niveles; siempre orientado hacia el Este.
- `countdownMs(nivel) = max(5000, 15000 - (nivel-1)*1000)`.
- `flowInterval(nivel) = max(150, 700 - (nivel-1)*60)` ms por celda.
- `levelTarget(nivel) = 15 + nivel*5`.
- +5 puntos por pieza colocada válida; +15 puntos por celda de flujo recorrida.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo.

## Plan de implementación

1. **Alta en Supabase + cobertura visual.** Proponer y ejecutar (con confirmación explícita) el `insert` de la fila `tuberias` en `games` (`title`, `short`, `long`, `cat = 'PUZZLE'`, `color = 'cyan'`, `cover = 'cover-tuberias'`). Agregar la clase `.cover-tuberias` (+ pseudo-elemento `::after`) a `app/globals.css`, siguiendo el patrón de gradiente + formas geométricas de `.cover-snake`/`.cover-tetro`. Prueba: `select * from games where id = 'tuberias'` devuelve la fila esperada; `/games` muestra la tarjeta TUBERÍAS con la nueva portada en vez de un placeholder roto.
2. **Puerto del juego a componente canvas.** Crear `app/components/games/tuberias-game.tsx`: grilla 16×11, generación de celdas bloqueadas y `startCell` por nivel, cola de 5 piezas con sorteo uniforme entre los 6 tipos, cursor de teclado + colocación por click de mouse, cuenta regresiva, avance de flujo por `flowInterval`, detección de reventón (celda vacía/bloqueada/fuera de tablero/apertura no coincidente), puntuación (+5 por pieza, +15 por celda fluida), progresión de nivel con regeneración completa del tablero al alcanzar `levelTarget`. Canvas 800×600. Loop `requestAnimationFrame` con `dt` capado a 50ms. `forwardRef` + `useImperativeHandle` exponiendo `reset()`/`forceGameOver()`. `onScoreChange`/`onLevelChange` disparados solo al cambiar; `onLivesChange(1)` una sola vez al iniciar/reiniciar; `onExtraStatChange` no se llama. Sin HUD externo duplicado (cursor/cola/cuenta regresiva son campo de juego, no HUD). Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página.
3. **Registro.** Agregar `"tuberias": { Component: TuberiasGame }` a `GAME_REGISTRY` en `app/components/games/registry.ts` (sin `extraStatLabel`). Prueba: `/games/tuberias/jugar` carga el Pipe Mania real en canvas en vez del placeholder decorativo — `game-player.tsx` no necesita cambios.
4. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/tuberias/jugar`: mover el cursor con las 4 flechas, colocar piezas con `Space`/`Enter` y con click de mouse (alternando ambos métodos), ver la cola desplazarse y reponerse tras cada colocación, la cuenta regresiva llega a 0 y el flujo arranca desde `startCell` hacia el Este, el flujo avanza celda a celda por el camino construido sumando puntos, colocar sobre celda bloqueada u ocupada no hace nada, el flujo llega a una celda vacía o a una pieza sin apertura coincidente y la partida termina de inmediato, alcanzar `levelTarget` sube el nivel y regenera el tablero con flujo más rápido y cuenta regresiva más corta, PAUSA congela el loop (cursor, cola, cuenta regresiva y flujo dejan de avanzar), FIN cierra la partida con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia completo sin recargar la página. Confirmar que los demás juegos siguen sin cambios.
5. **Cierre.** Verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Aprobado" → luego "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] La fila `tuberias` existe en `games` con `cat = 'PUZZLE'`, `color = 'cyan'`, `cover = 'cover-tuberias'`, y `/games` la muestra con su propia portada (no el placeholder decorativo).
- [ ] `/games/tuberias/jugar` carga sin errores en consola, con el Pipe Mania real en canvas.
- [ ] El cursor se mueve por la grilla con las 4 flechas; `Space` o `Enter` coloca la pieza al frente de la cola en la celda del cursor.
- [ ] Un click sobre una celda del canvas coloca directamente ahí la pieza al frente de la cola, sin necesidad de mover el cursor primero.
- [ ] Colocar sobre una celda bloqueada o ya ocupada no tiene efecto y no consume la cola.
- [ ] La cola muestra siempre 5 piezas próximas; al colocar una, la cola se desplaza y se agrega una nueva pieza al final.
- [ ] La cuenta regresiva se muestra visiblemente antes de cada nivel y, al llegar a 0, el flujo arranca desde el punto de partida hacia el Este.
- [ ] El flujo avanza una celda por paso según `flowInterval`, siguiendo las aperturas de las piezas colocadas (rectas siguen derecho, curvas giran 90°).
- [ ] Colocar una pieza válida suma 5 puntos; cada celda que el flujo recorre exitosamente suma 15 puntos.
- [ ] El flujo llegando a una celda vacía, bloqueada, fuera del tablero, o a una pieza sin apertura coincidente con el lado de entrada, termina la partida de inmediato.
- [ ] Alcanzar la meta de longitud de flujo del nivel actual (`levelTarget`) sube el nivel, regenera el tablero completo (nuevas celdas bloqueadas, cola reiniciada) y reinicia la cuenta regresiva con los valores del nuevo nivel.
- [ ] El HUD exterior (Jugador/Puntuación/Vidas/Nivel) refleja en vivo el score y el nivel reales; "Vidas" muestra un único ♥ fijo desde el inicio hasta el game over.
- [ ] No se muestra ningún stat extra en el HUD (el slot de stat extra no se usa para este juego).
- [ ] El botón PAUSA congela el loop del juego por completo (cursor, cola, cuenta regresiva y flujo dejan de avanzar); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada hasta ese momento y abre el modal de fin de partida.
- [ ] "GUARDAR PUNTUACIÓN" en el modal añade una fila real a `scores` en Supabase con `game_id = 'tuberias'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego real desde cero (nivel 1, tablero nuevo, score 0, cuenta regresiva reiniciada) sin recargar la página.
- [ ] "SALIR" navega a `/games/tuberias` sin errores.
- [ ] Las flechas, `Space` y `Enter` no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`rocas`, `caida`, `bloque-buster`, `serpentina` y los decorativos) siguen sin cambios.

## Decisiones

- **Sí:** crear una fila e id nuevos (`tuberias`) en vez de reusar un placeholder existente. No hay ningún placeholder de Pipe Mania ya sembrado en `games` (a diferencia de `duelo-pixel`/`gloton`/`invasores`/`ranaria`); es la única opción disponible para este juego.
- **Sí:** `startCell` fijo en columna 0, fila 5, siempre orientado al Este, en vez de un punto de partida aleatorio con dirección variable. Simplifica la generación de niveles y evita bugs de geometría en los bordes, sin perder la esencia del juego.
- **Sí:** cada nivel regenera el tablero completo (nuevas celdas bloqueadas, cola reiniciada) al alcanzar `levelTarget`, en vez de continuar indefinidamente sobre el mismo tablero fijo. Evita quedarse sin espacio jugable en una grilla finita y da un ritmo de "stage clear" coherente con la progresión de niveles de Bloque Buster.
- **Sí:** las piezas se colocan tal cual llegan de la cola, sin poder rotarlas in situ. Fiel al Pipe Mania original y más simple que agregar un sistema de rotación previo a la colocación.
- **Sí:** controles híbridos, teclado (cursor + `Space`/`Enter`) y mouse (click directo), que conviven en la misma partida — mismo patrón que Bloque Buster (paleta por mouse y por flechas).
- **Sí:** 1 vida fija (`onLivesChange` en 1) — un solo reventón termina la partida. Fiel al género: Pipe Mania no tiene concepto de vidas múltiples, igual que Tetris/Snake en este catálogo.
- **No:** incluir la pieza de cruce ("cross-over"), válvulas, o el medidor de presión en esta spec base. Se agregan en `tuberias-02-modo-presion.md` como mecánica adicional que depende de este motor base.
- **No:** portar sonido/música — convención ya establecida en el resto del catálogo.
- **Sí:** nueva clase `.cover-tuberias` con gradiente cian + pseudo-elemento geométrico, siguiendo el mismo patrón que `.cover-snake`/`.cover-tetro`, en vez de reusar una portada existente que no representa tuberías.
- **No:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel`) en esta spec base. Se reserva para el medidor de presión de la extensión.

## Riesgos

| Riesgo                                                                                                                                                    | Mitigación                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La generación aleatoria de celdas bloqueadas podría, por mala suerte, dejar sin espacio jugable inmediato alrededor de `startCell`                        | La celda inmediatamente al Este de `startCell` nunca se genera bloqueada; se garantiza al menos un primer movimiento posible en cada nivel.                                                                 |
| Convivencia de dos métodos de entrada (cursor de teclado + click de mouse) podría generar colocaciones accidentales si el jugador alterna rápido          | Ambos métodos actúan sobre el mismo estado (`queue[0]` + celda destino) sin prioridad exclusiva entre sí, igual que ya conviven mouse y teclado en `bloque-buster-game.tsx` sin conflicto.                  |
| Regenerar el tablero completo al subir de nivel podría sentirse abrupto si el jugador tenía piezas construidas de más en el tablero anterior              | Aceptado por decisión explícita (ver Decisiones); coherente con el "stage clear" ya usado en Bloque Buster, donde el tablero también se reemplaza por completo al pasar de nivel.                           |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame` o los listeners de teclado/mouse | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en el resto de los componentes de juego del catálogo. |

## Qué **no** está en este spec

- Pieza de cruce, válvulas, medidor de presión o cualquier mecánica más allá de las 6 piezas básicas.
- Controles táctiles/móviles.
- Sonido/música, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
