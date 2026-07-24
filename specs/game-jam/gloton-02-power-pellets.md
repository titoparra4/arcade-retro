# SPEC — Extensión de Glotón: Píldoras de poder y modo asustado

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `gloton` ya sembrada), `gloton-01-comecocos.md` (componente base `GlotonGame`, laberinto, glotón, fantasmas con persecución directa, vidas/respawn, victoria)
> **Fecha:** 2026-07-23
> **Objetivo:** Extender `GlotonGame` con cuatro píldoras de poder que, al ser comidas, invierten los papeles: los fantasmas entran en "modo asustado" (huyen, se vuelven azules y comestibles) durante unos segundos, el glotón puede comerlos con puntaje encadenado, y el HUD muestra los segundos restantes vía el slot de stat extra.

## Alcance

**Dentro:**

- Cuatro píldoras de poder ubicadas en las cuatro esquinas del laberinto (nuevo tipo de celda `o` en `gloton-maze.ts`), dibujadas más grandes que los puntos normales y con parpadeo.
- Comer una píldora de poder suma +50 puntos y activa el modo asustado global durante `FRIGHT_MS` (p. ej. 7000ms).
- Al activarse el modo asustado: los fantasmas que están persiguiendo invierten de inmediato su dirección, cambian a color azul y pasan a huir del glotón — en cada intersección eligen la dirección legal (sin invertir de golpe) que **maximiza** la distancia Manhattan hacia la celda del glotón. Su velocidad baja (p. ej. a `frightSpeed = 60` px/s).
- Fantasmas comestibles: mientras están asustados, si el glotón los toca no pierde vida; en cambio se los come. El fantasma comido pasa a estado `eyes` (solo ojos) y regresa a la casa central, donde revive tras un breve encierro y vuelve a perseguir con su color normal.
- Puntaje encadenado por cadena de píldora: el primer fantasma comido dentro de una misma activación vale 200, el segundo 400, el tercero 800, el cuarto 1600; el contador de la cadena se reinicia al activar una nueva píldora.
- Aviso de fin de modo asustado: durante el último tramo (p. ej. últimos 2000ms) los fantasmas asustados parpadean entre azul y blanco antes de volver a su estado de persecución.
- Reactivación: comer otra píldora mientras el modo asustado sigue activo reinicia el temporizador a `FRIGHT_MS` y reinicia la cadena de puntaje a 200.
- Stat extra en el HUD: `onExtraStatChange(segundos)` reporta los segundos enteros restantes de modo asustado (redondeo hacia arriba); `0` cuando está inactivo. Se registra `extraStatLabel: "Modo asustado"` en `GAME_REGISTRY`.
- Las píldoras de poder cuentan para la condición de victoria igual que los puntos: el laberinto se considera vacío solo cuando no quedan ni puntos ni píldoras.
- `forwardRef` `reset()` extendido para restaurar las cuatro píldoras y limpiar el modo asustado (temporizador a 0, cadena a 0, fantasmas en su estado normal).

**Fuera de alcance (para specs futuros si llegan):**

- Frutas bonus y progresión de niveles (va en `gloton-03-personalidades-niveles.md`).
- Personalidades distintas por fantasma y alternancia scatter/chase (va en `gloton-03-personalidades-niveles.md`).
- Bonus de vida extra por acumular puntaje.
- Sonido/música (incluida la sirena y el sonido de "comer fantasma").
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests.

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`gloton` ya existe en `games`). Extiende el estado interno definido en `gloton-01`:

```ts
// app/components/games/gloton-game.tsx — extensiones sobre gloton-01
type GhostMode = "chase" | "frightened" | "eyes";

interface Ghost extends Actor {
  id: "blinky" | "pinky" | "inky" | "clyde";
  color: string;
  mode: GhostMode; // nuevo: chase (base) | frightened | eyes (comido, volviendo a la casa)
  houseTimer: number; // ms de encierro tras ser comido, antes de revivir a chase
}

interface GameData {
  // ...campos de gloton-01 (pac, ghosts, dots, dotsLeft, desiredDir, score, lives, respawnTimer, state)
  power: boolean[]; // indexado por row*COLS+col; true = píldora de poder sin comer
  powerLeft: number; // píldoras restantes; victoria cuando dotsLeft === 0 && powerLeft === 0
  frightTimer: number; // ms restantes de modo asustado (0 = inactivo)
  frightChain: number; // 0..4, fantasmas comidos en la activación actual (puntaje 200·2^(n-1))
}

// Constantes nuevas
const FRIGHT_MS = 7000; // duración del modo asustado
const FRIGHT_WARN_MS = 2000; // tramo final con parpadeo azul/blanco
const FRIGHT_SPEED = 60; // px/s de los fantasmas asustados
const POWER_POINTS = 50; // puntos por comer una píldora
const GHOST_POINTS = [200, 400, 800, 1600]; // puntaje encadenado
```

```ts
// app/components/games/registry.ts — entrada actualizada
gloton: { Component: GlotonGame, extraStatLabel: "Modo asustado" },
```

Convenciones:

- La cadena de puntaje usa `GHOST_POINTS[min(frightChain, 3)]` y luego incrementa `frightChain`.
- `onExtraStatChange(Math.ceil(frightTimer / 1000))` cuando `frightTimer > 0`, si no `onExtraStatChange(0)`; disparado solo al cambiar el valor entero.
- Estado mutable en el mismo `useRef<GameData>` de `gloton-01`, sin variables sueltas a nivel de módulo.

## Plan de implementación

1. **Píldoras en el laberinto.** Agregar el tipo de celda `o` (píldora de poder) en las cuatro esquinas de `MAZE` en `gloton-maze.ts` y parsearlo a `power`/`powerLeft` en `GlotonGame`. Dibujarlas como círculos grandes con parpadeo. Prueba local: las cuatro esquinas muestran una píldora parpadeante y el resto del laberinto queda igual que en `gloton-01`.
2. **Comer píldora y activar modo asustado.** Al cruzar el centro de una celda con píldora: +50 puntos, decrementa `powerLeft`, fija `frightTimer = FRIGHT_MS`, `frightChain = 0`, e invierte la dirección de todos los fantasmas en `chase`, poniéndolos en `frightened` (azules, `FRIGHT_SPEED`, huyendo). Prueba local: comer una píldora vuelve a los cuatro fantasmas azules y los hace huir del glotón durante ~7s; el temporizador decrece.
3. **Huida y fin del modo asustado.** IA de huida (maximiza distancia Manhattan al glotón, sin invertir de golpe). En los últimos `FRIGHT_WARN_MS` parpadean azul/blanco. Al agotarse `frightTimer`, los fantasmas en `frightened` vuelven a `chase` con su color normal. Prueba local: los fantasmas asustados se alejan del glotón, parpadean en el tramo final y retoman la persecución al terminar el temporizador.
4. **Comer fantasmas con cadena.** Colisión con fantasma `frightened`: no resta vida; suma `GHOST_POINTS[min(frightChain,3)]`, incrementa `frightChain`, y pasa el fantasma a `eyes` con rumbo a la casa central; en la casa cumple `houseTimer` y revive a `chase`. Colisión con fantasma en `chase` sigue restando vida (comportamiento de `gloton-01`); colisión con `eyes` no hace nada. Prueba local: comer fantasmas en serie da 200/400/800/1600, cada uno vuelve como ojos a la casa y revive; tocar un fantasma no asustado sigue restando vida.
5. **Stat extra en el HUD y registro.** Reportar `onExtraStatChange(Math.ceil(frightTimer/1000))` solo al cambiar el entero (y `0` al terminar). Actualizar la entrada de `GAME_REGISTRY` a `gloton: { Component: GlotonGame, extraStatLabel: "Modo asustado" }`. Prueba: durante el modo asustado el HUD muestra "Modo asustado" con la cuenta regresiva en segundos; fuera de él no muestra el stat (valor 0).
6. **Victoria, reactivación y reset.** Ajustar la condición de victoria a `dotsLeft === 0 && powerLeft === 0`. Comer otra píldora durante el modo asustado reinicia `frightTimer` y `frightChain`. Extender `reset()` para restaurar las cuatro píldoras y limpiar `frightTimer`/`frightChain`/modos de fantasma. Prueba local: solo se gana tras comer también las píldoras; reactivar renueva el temporizador y reinicia la cadena; JUGAR DE NUEVO restaura las píldoras y el estado normal.
7. **Build + playtest.** `npm run build` sin errores. Playtest en `/games/gloton/jugar`: comer una píldora invierte los papeles, la cadena de puntaje funciona, el HUD muestra los segundos, la victoria requiere vaciar puntos y píldoras, y el resto del juego base sigue intacto.
8. **Cierre.** Verificar los criterios de aceptación; el spec queda en Borrador para que Tito lo apruebe e implemente vía `/spec-impl`.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] El laberinto muestra cuatro píldoras de poder parpadeantes en las esquinas, más grandes que los puntos normales.
- [ ] Comer una píldora suma +50 puntos y activa el modo asustado durante ~7 segundos.
- [ ] Al activarse el modo asustado los cuatro fantasmas invierten su dirección, se vuelven azules, bajan la velocidad y huyen del glotón.
- [ ] Mientras están asustados, tocar un fantasma no resta vida: se lo come y suma 200, 400, 800, 1600 en cadena según el orden dentro de la activación.
- [ ] Un fantasma comido vuelve como ojos a la casa central y revive a persecución normal tras un breve encierro.
- [ ] En el tramo final del modo asustado los fantasmas parpadean entre azul y blanco antes de volver a perseguir.
- [ ] Comer otra píldora durante el modo asustado reinicia el temporizador y reinicia la cadena de puntaje a 200.
- [ ] El HUD muestra el stat extra "Modo asustado" con los segundos enteros restantes durante la activación, y no lo muestra (valor 0) fuera de ella.
- [ ] La partida solo se gana cuando no quedan ni puntos ni píldoras de poder.
- [ ] Tocar un fantasma en persecución normal (no asustado) sigue restando una vida, como en `gloton-01`.
- [ ] "JUGAR DE NUEVO" restaura las cuatro píldoras y limpia el modo asustado (temporizador y cadena a 0, fantasmas en estado normal).
- [ ] La entrada de `GAME_REGISTRY` para `gloton` incluye `extraStatLabel: "Modo asustado"`.
- [ ] Los demás juegos y la fila `gloton` en Supabase siguen sin cambios.

## Decisiones

- **Sí:** cuatro píldoras en las esquinas, fiel al comecocos clásico, definidas como un nuevo carácter `o` en la matriz del laberinto de `gloton-01` (cambio mínimo y legible).
- **Sí:** puntaje encadenado 200/400/800/1600 por activación, reiniciado con cada píldora nueva. Es el esquema clásico y recompensa juntar a los fantasmas antes de comer una píldora.
- **Sí:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel: "Modo asustado"`) para la cuenta regresiva. Da uso real al slot del contrato, igual que el "Triple disparo" de Asteroids.
- **Sí:** velocidad reducida de los fantasmas asustados (`FRIGHT_SPEED`), fiel al clásico y necesaria para que sean atrapables.
- **Sí:** las píldoras cuentan para la victoria (hay que comerlas todas). Evita el caso raro de "laberinto sin puntos pero con píldoras intactas" que dejaría la partida sin terminar.
- **No:** dar una vida extra por puntaje acumulado en este spec. Es una mecánica separable; se puede agregar en su propio spec si Tito lo quiere.
- **No:** cambiar la persecución directa base de `gloton-01`. Las personalidades por fantasma y el scatter/chase se dejan para `gloton-03`; esta extensión solo agrega la capa de píldoras/modo asustado.

## Riesgos

| Riesgo                                                                                                                                     | Mitigación                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La inversión inmediata de dirección al activar el modo asustado puede dejar un fantasma "encajado" contra una pared o en una celda ilegal. | La inversión solo cambia el vector de dirección; la elección de ruta real vuelve a decidirse en la próxima intersección con las reglas de celda legal de `gloton-01`, sin teletransportar al fantasma. |
| El estado `eyes` que regresa a la casa podría atascarse si no encuentra ruta hacia el centro.                                              | El retorno a la casa usa la misma búsqueda de menor distancia Manhattan pero con la celda de la casa como objetivo y sin restricción de puertas para los ojos; se valida en el playtest del paso 4.    |
| El `onExtraStatChange` disparado cada frame inundaría de renders al HUD.                                                                   | Se reporta solo cuando cambia el segundo entero (`Math.ceil(frightTimer/1000)`), igual que las llamadas condicionadas de `onScoreChange` en los otros juegos.                                          |

## Qué **no** está en este spec

- Frutas bonus y progresión de niveles (va en `gloton-03-personalidades-niveles.md`).
- Personalidades distintas por fantasma y alternancia scatter/chase (va en `gloton-03-personalidades-niveles.md`).
- Vida extra por puntaje.
- Sonido/música.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
