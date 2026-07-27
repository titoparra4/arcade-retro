# SPEC — Tuberías: Modo Presión (válvulas + medidor de sobrepresión)

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `tuberias` ya sembrada por `tuberias-01-clasico.md`), `tuberias-01-clasico.md` (motor base: grilla, cola de piezas, cuenta regresiva, avance de flujo, niveles)
> **Fecha:** 2026-07-27
> **Objetivo:** Añadir sobre el motor base de Tuberías una segunda condición de fin de partida —un medidor de presión que sube con cada celda que fluye y solo baja al pasar el flujo por una nueva pieza especial, la Válvula— reportado en vivo con el slot de stat extra del HUD (`onExtraStatChange`/`extraStatLabel = "Presión"`).

## Alcance

**Dentro:**

- Séptimo tipo de pieza, `"VALVE"`, que se suma a los 6 tipos básicos (`NS`, `EW`, `NE`, `NW`, `SE`, `SW`) ya definidos en `tuberias-01-clasico.md`. A diferencia de las demás, la Válvula no tiene dos aperturas cardinales fijas: siempre deja pasar el flujo en línea recta desde el lado por el que entra hacia el lado opuesto, sin importar cómo se coloque, así que nunca provoca un reventón por geometría.
- Generación de la cola: cada pieza nueva que se agrega al final de la cola tiene un 12% de probabilidad (`VALVE_QUEUE_CHANCE = 0.12`) de ser una Válvula en vez de sortearse uniformemente entre los 6 tipos básicos.
- Ícono distintivo para la Válvula en la vista previa de la cola y en el tablero una vez colocada (p. ej. una rueda/manija), distinguible a simple vista de las piezas rectas y curvas.
- Nuevo medidor de "Presión" (0–100), que empieza en 0 al arrancar cada nivel (se reinicia junto con la regeneración de tablero del motor base) y sube `PRESSURE_PER_STEP = 2` puntos cada vez que el flujo avanza una celda exitosamente, con o sin Válvulas en el camino.
- Al pasar el flujo por una celda con una Válvula colocada, el medidor de presión baja `VALVE_RELIEF = 30` puntos (piso en 0, nunca negativo) y se suman `VALVE_SCORE_BONUS = 50` puntos al score, además de los +15 puntos normales por celda fluida ya definidos en la spec base.
- Nueva condición de game over, independiente del reventón por trayecto ya existente: si el medidor de presión llega a 100, la partida termina de inmediato ("sobrepresión"), aunque el camino de tuberías siga siendo válido y el flujo no haya chocado contra ningún dead-end.
- El medidor de presión se reporta en vivo vía `onExtraStatChange(pressure)` (valor 0–100) cada vez que cambia; `extraStatLabel = "Presión"` se agrega a la entrada `tuberias` en `GAME_REGISTRY`.
- `reset()` reinicia el medidor de presión a 0 junto con el resto del estado del nivel 1; `forceGameOver()` no altera el medidor de presión (el score acumulado hasta ese momento se conserva igual que en la spec base).
- El resto del motor (grilla, cuenta regresiva, avance de flujo, puntuación por pieza/celda, niveles, controles híbridos teclado+mouse, vida única) se hereda sin cambios de `tuberias-01-clasico.md`.

**Fuera de alcance (para specs futuros si llegan):**

- Pieza de cruce ("cross-over", que permitiría dos tramos de tubería cruzándose en la misma celda sin conectarse entre sí).
- Selector de modo de juego (clásico vs. presión) dentro del jugador — esta spec reemplaza el comportamiento base con presión activa siempre que se implemente, no como opción alternable.
- Ajustar `PRESSURE_PER_STEP`/`VALVE_RELIEF`/`VALVE_QUEUE_CHANCE` por nivel (en esta spec son constantes fijas, iguales en todos los niveles).
- Controles táctiles/móviles.
- Sonido/música.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`tuberias` ya existe en `games`, sembrado por `tuberias-01-clasico.md`). Extiende el estado interno ya definido en la spec base:

```ts
// app/components/games/tuberias-game.tsx — extensión de PieceType y GameData
type PieceType = "NS" | "EW" | "NE" | "NW" | "SE" | "SW" | "VALVE";

interface GameData {
  // ...todos los campos de tuberias-01-clasico.md, sin cambios...
  pressure: number; // 0..100, reiniciado a 0 al regenerar tablero por nivel
}
```

```ts
// app/components/games/registry.ts — nueva entrada de extraStatLabel para "tuberias"
export const GAME_REGISTRY: Partial<Record<string, GameRegistryEntry>> = {
  // ...entradas existentes sin cambios...
  tuberias: {
    Component: TuberiasGame,
    extraStatLabel: "Presión",
  },
};
```

Convenciones nuevas:

- `VALVE_QUEUE_CHANCE = 0.12` (probabilidad de que una pieza nueva de la cola sea Válvula en vez de uno de los 6 tipos básicos).
- `PRESSURE_PER_STEP = 2` (puntos de presión por cada celda que el flujo recorre).
- `VALVE_RELIEF = 30` (puntos de presión que se restan al pasar el flujo por una Válvula colocada, piso en 0).
- `VALVE_SCORE_BONUS = 50` (puntos de score adicionales al pasar el flujo por una Válvula, sumados a los +15 normales por celda).
- `pressure` se reinicia a 0 en cada regeneración de tablero (mismo momento en que `tuberias-01-clasico.md` regenera celdas bloqueadas y `startCell`).

## Plan de implementación

1. **Pieza Válvula.** En `app/components/games/tuberias-game.tsx`, agregar `"VALVE"` a `PieceType`, su ícono en la cola y en el tablero, y la regla de sorteo `VALVE_QUEUE_CHANCE = 0.12` al generar cada pieza nueva de la cola. La lógica de avance de flujo trata `VALVE` como recta en la dirección de entrada (nunca provoca reventón por geometría). Prueba: `npm run build` pasa; jugando la spec base con este cambio, las Válvulas aparecen ocasionalmente en la cola y, colocadas, siempre dejan pasar el flujo en línea recta.
2. **Medidor de presión.** Agregar `pressure: number` a `GameData`, inicializado en 0 y reiniciado en cada regeneración de tablero por nivel. Sumar `PRESSURE_PER_STEP` cada vez que el flujo avanza una celda; restar `VALVE_RELIEF` (piso en 0) y sumar `VALVE_SCORE_BONUS` al score cuando la celda recorrida contiene una Válvula. Prueba: jugando manualmente, el valor interno de presión sube de a 2 por celda fluida y baja de a 30 (sin bajar de 0) al pasar por una Válvula.
3. **Condición de sobrepresión.** Si `pressure` llega a 100, disparar game over inmediato (mismo camino que el reventón por trayecto ya existente en la spec base, con el score acumulado hasta ese momento). Prueba: forzando (en dev) `PRESSURE_PER_STEP` más alto temporalmente o jugando sin usar Válvulas, la partida termina al llegar a 100 de presión aunque el camino de tuberías siga siendo válido.
4. **HUD del stat extra.** Agregar `extraStatLabel: "Presión"` a la entrada `tuberias` en `GAME_REGISTRY`. Llamar `onExtraStatChange(pressure)` cada vez que el valor cambia (mismo patrón de diffing que usa Asteroids para su triple disparo). Prueba: `/games/tuberias/jugar` muestra en el HUD exterior un stat "Presión" que sube y baja en vivo según el juego.
5. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/tuberias/jugar`: las Válvulas aparecen en la cola con frecuencia visiblemente menor que los 6 tipos básicos, se colocan y dejan pasar el flujo en cualquier orientación, el medidor de "Presión" del HUD sube con cada celda fluida y baja al pasar por una Válvula colocada, la partida termina por sobrepresión al llegar a 100 aunque el camino siga siendo válido, la partida sigue terminando también por el reventón por trayecto ya existente en la spec base, JUGAR DE NUEVO reinicia la presión a 0 junto con el resto del estado. Confirmar que el resto del catálogo (`rocas`, `caida`, `bloque-buster`, `serpentina` y los decorativos) sigue sin cambios.
6. **Cierre.** Verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Aprobado" → luego "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Las piezas de tipo Válvula aparecen en la cola con una frecuencia visiblemente menor a los 6 tipos básicos combinados, con un ícono distinguible.
- [ ] Una Válvula colocada siempre deja pasar el flujo en línea recta desde el lado por el que entra, sin importar su orientación de colocación, y nunca provoca un reventón por geometría.
- [ ] El HUD exterior muestra un stat extra llamado "Presión" que refleja en vivo el valor interno (0–100).
- [ ] Cada celda que el flujo recorre exitosamente sube la Presión en 2 puntos.
- [ ] Pasar el flujo por una Válvula colocada baja la Presión en 30 puntos (sin bajar de 0) y suma 50 puntos de score adicionales a los +15 normales por celda fluida.
- [ ] Si la Presión llega a 100, la partida termina de inmediato con el score acumulado, aunque el camino de tuberías construido siga siendo geométricamente válido.
- [ ] El reventón por trayecto ya existente en la spec base (celda vacía/bloqueada/fuera de tablero/apertura no coincidente) sigue terminando la partida igual que antes, de forma independiente a la Presión.
- [ ] La Presión se reinicia a 0 en cada regeneración de tablero al subir de nivel, y también al usar JUGAR DE NUEVO.
- [ ] "GUARDAR PUNTUACIÓN" en el modal sigue insertando una fila real en `scores` con `game_id = 'tuberias'`, incluyendo el score bonificado por Válvulas.
- [ ] El resto del comportamiento de `tuberias-01-clasico.md` (cursor de teclado, colocación por mouse, cola de 5 piezas, cuenta regresiva, niveles, vida única) sigue funcionando sin cambios.
- [ ] Los demás juegos (`rocas`, `caida`, `bloque-buster`, `serpentina` y los decorativos) siguen sin cambios.

## Decisiones

- **Sí:** dar a la Válvula un comportamiento de "recta universal" (nunca provoca reventón por geometría) en vez de aperturas cardinales fijas como las demás piezas. Simplifica su implementación y la vuelve una herramienta de alivio de riesgo pura, sin agregar una nueva forma de perder por mala colocación.
- **Sí:** que la Presión sea una segunda condición de game over independiente del reventón por trayecto, en vez de solo un modificador de puntaje. Es lo que le da identidad de "twist" a esta spec frente a la base: incluso con un camino perfecto, ignorar las Válvulas también termina la partida.
- **Sí:** `VALVE_QUEUE_CHANCE = 0.12` fijo en todos los niveles, sin escalar con la dificultad. Mantiene la mecánica legible; ajustar la probabilidad por nivel puede evaluarse en una spec futura si el playtest lo pide.
- **No:** agregar un selector de modo clásico/presión dentro del jugador. Esta spec extiende el motor de `tuberias-01-clasico.md` con la mecánica siempre activa, siguiendo el patrón de extensión de este game-jam (una spec por mecánica, no un menú de modos).
- **No:** escalar `PRESSURE_PER_STEP`/`VALVE_RELIEF` por nivel en esta spec. Son constantes fijas; si hace falta una curva de dificultad de presión, es una extensión propia.
- **Sí:** reiniciar la Presión a 0 en cada regeneración de tablero (cada subida de nivel), igual que se reinician las celdas bloqueadas y la cola. Evita que un jugador entre a un nivel nuevo ya cerca de la sobrepresión por acumulación del nivel anterior.
- **No:** incluir la pieza de cruce ("cross-over"). Es una mecánica distinta (multiplexar dos flujos en la misma celda) que amerita su propia spec si se decide agregarla.

## Riesgos

| Riesgo                                                                                                                                                  | Mitigación                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Con `VALVE_QUEUE_CHANCE = 0.12` la Válvula podría tardar en aparecer en partidas cortas, dejando al jugador sin forma de aliviar la Presión a tiempo    | Con `QUEUE_SIZE = 5` visibles y reposición constante, la probabilidad de no ver ninguna Válvula en una ventana razonable de piezas es baja; se ajusta en playtest si resulta punitivo. |
| Confundir la nueva condición de sobrepresión con el reventón por trayecto ya existente podría no quedar claro para el jugador en el HUD compartido      | El stat extra "Presión" es visible en todo momento en el HUD exterior antes de llegar a 100, dando aviso anticipado; no requiere un mensaje de game over diferenciado en esta spec.    |
| Agregar `pressure` a `GameData` sin resetearlo correctamente en todos los caminos de reinicio (nivel nuevo vs. `reset()`) podría dejarlo desincronizado | Ambos caminos de reinicio (regeneración de tablero por nivel y `reset()` completo) pasan por la misma rutina de reinicio de nivel ya existente en la spec base; se cubre en el paso 2. |

## Qué **no** está en este spec

- Pieza de cruce ("cross-over").
- Selector de modo clásico/presión dentro del jugador.
- Escalado de `PRESSURE_PER_STEP`/`VALVE_RELIEF`/`VALVE_QUEUE_CHANCE` por nivel.
- Controles táctiles/móviles.
- Sonido/música, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
