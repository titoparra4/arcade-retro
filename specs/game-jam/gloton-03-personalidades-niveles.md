# SPEC — Extensión de Glotón: Personalidades de fantasmas, scatter/chase y niveles

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `gloton` ya sembrada), `gloton-01-comecocos.md` (componente base `GlotonGame`, laberinto, fantasmas con persecución directa, vidas, victoria), `gloton-02-power-pellets.md` (píldoras de poder, modo asustado, estado `frightened`/`eyes`, stat extra)
> **Fecha:** 2026-07-23
> **Objetivo:** Reemplazar la persecución directa idéntica de `gloton-01` por cuatro personalidades de fantasma distintas (objetivos de persecución al estilo Blinky/Pinky/Inky/Clyde) con alternancia global scatter/chase, agregar frutas bonus y encadenar niveles con dificultad creciente que reinician el laberinto y aumentan la velocidad y la agresividad de los fantasmas.

## Alcance

**Dentro:**

- Cuatro personalidades de persecución, cada una calculando su propia **celda objetivo** en modo `chase` (el resto de estados —`frightened`, `eyes`— no cambia respecto de `gloton-02`):
  - **Blinky (rojo):** apunta a la celda actual del glotón (persecución directa, como en `gloton-01`).
  - **Pinky (rosa):** apunta 4 celdas por delante del glotón en la dirección a la que mira.
  - **Inky (cyan):** apunta a la celda reflejada usando la posición de Blinky como pivote sobre un punto 2 celdas por delante del glotón (regla clásica del vector duplicado).
  - **Clyde (naranja):** apunta al glotón cuando está a más de 8 celdas de distancia, y a su esquina de "scatter" cuando está más cerca.
- Alternancia global **scatter/chase**: un temporizador de fase alterna entre `scatter` (cada fantasma apunta a su esquina asignada del laberinto) y `chase` (cada uno usa su objetivo de personalidad), con duraciones por fase que se acortan en niveles más altos. La entrada en una fase nueva invierte la dirección de los fantasmas (regla clásica), salvo los que estén en `frightened`/`eyes`.
- El modo asustado de `gloton-02` tiene prioridad sobre scatter/chase: mientras `frightTimer > 0` los fantasmas afectados huyen; al terminar retoman la fase scatter/chase vigente.
- **Frutas bonus:** tras comer cierta cantidad de puntos (p. ej. a los 70 y a los 170 puntos comidos) aparece una fruta en el centro del laberinto durante un tiempo limitado; comerla suma un bono (p. ej. 100 en niveles bajos, escalando por nivel). Desaparece si no se come a tiempo.
- **Progresión de niveles:** al vaciar el laberinto (todos los puntos y píldoras), en vez de terminar como victoria, sube el nivel (`onLevelChange`), reconstruye el laberinto lleno, reposiciona a los actores, aumenta la velocidad base de glotón y fantasmas, acorta el modo asustado y ajusta las duraciones scatter/chase. Se conservan score y vidas.
- **Condición de victoria final:** completar el último nivel definido (p. ej. nivel 5) dispara `onGameOver(score, true)`; agotar las vidas en cualquier nivel dispara `onGameOver(score, false)`.
- El tipo de fruta cambia por nivel (cereza, fresa, naranja, …) solo como variación visual y de puntaje bonus, sin nuevos assets externos (dibujadas en canvas).
- `forwardRef` `reset()` extendido para volver al nivel 1 con las duraciones/velocidades iniciales, sin frutas activas y con la fase scatter/chase reiniciada.

**Fuera de alcance (para specs futuros si llegan):**

- Cinemáticas/intermedios entre niveles.
- Velocidades diferenciadas por fantasma dentro de un mismo nivel (túnel más lento, "elroy" de Blinky, etc.).
- Assets de sprites externos para frutas o fantasmas.
- Sonido/música.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests.

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`gloton` ya existe en `games`). Extiende el estado de `gloton-01`/`gloton-02`:

```ts
// app/components/games/gloton-game.tsx — extensiones sobre gloton-02
type Phase = "scatter" | "chase";

interface Ghost extends Actor {
  id: "blinky" | "pinky" | "inky" | "clyde";
  color: string;
  mode: GhostMode; // chase | frightened | eyes (de gloton-02)
  houseTimer: number; // de gloton-02
  scatterCorner: Cell; // esquina objetivo en fase scatter (una por fantasma)
}

interface Fruit {
  cell: Cell; // centro del laberinto
  kind: string; // "cereza" | "fresa" | "naranja" | ... (visual + tabla de bono)
  points: number; // bono al comerla
  timer: number; // ms restantes antes de desaparecer
}

interface GameData {
  // ...campos de gloton-01 y gloton-02
  phase: Phase; // fase global scatter/chase
  phaseIndex: number; // índice dentro de la secuencia de fases del nivel
  phaseTimer: number; // ms restantes de la fase actual
  level: number; // 1..MAX_LEVEL
  fruit: Fruit | null; // fruta bonus activa (o null)
  dotsEaten: number; // acumulado en el nivel, dispara la aparición de fruta
}

// Tablas por nivel (índice = level-1); el último elemento se usa como tope
const MAX_LEVEL = 5;
const PAC_SPEED = [90, 95, 100, 105, 110]; // px/s por nivel
const GHOST_SPEED = [80, 86, 92, 98, 104]; // px/s por nivel
const FRIGHT_MS_BY_LEVEL = [7000, 6000, 5000, 4000, 3000]; // acorta gloton-02
const SCATTER_CHASE_MS = [
  // [scatter, chase, scatter, chase, ...] en ms, por nivel
  [7000, 20000, 7000, 20000, 5000, 20000],
  // ...resto de niveles, fases de scatter cada vez más cortas
];
const FRUIT_TABLE = [
  { kind: "cereza", points: 100 },
  { kind: "fresa", points: 300 },
  { kind: "naranja", points: 500 },
  { kind: "manzana", points: 700 },
  { kind: "melon", points: 1000 },
];
```

Convenciones:

- Objetivo de persecución por fantasma calculado en celdas; el fantasma elige en cada intersección la dirección legal que minimiza la distancia Manhattan a su celda objetivo (misma mecánica de elección de `gloton-01`, distinto objetivo).
- En `frightened` sigue vigente la huida de `gloton-02` (maximiza distancia); en `eyes`, el objetivo es la casa central.
- La fruta aparece cuando `dotsEaten` alcanza los umbrales del nivel y se guarda `fruit` no nulo con su `timer`.
- Estado mutable en el mismo `useRef<GameData>` de los specs anteriores.

## Plan de implementación

1. **Esquinas y objetivos de personalidad.** Asignar `scatterCorner` a cada fantasma y calcular el objetivo `chase` por personalidad (Blinky directo, Pinky +4 al frente, Inky con el vector duplicado sobre Blinky, Clyde condicionado por distancia). Prueba local: con la fase forzada a `chase`, cada fantasma toma rutas distintas hacia su objetivo (verificable dibujando temporalmente cada objetivo en modo debug).
2. **Alternancia scatter/chase.** Agregar `phase`/`phaseIndex`/`phaseTimer` guiados por `SCATTER_CHASE_MS[level-1]`; al cambiar de fase, invertir la dirección de los fantasmas en `chase`/`scatter` (no los `frightened`/`eyes`). Prueba local: los fantasmas alternan entre replegarse a sus esquinas (scatter) y perseguir (chase) según el temporizador, e invierten al cambiar de fase.
3. **Prioridad del modo asustado.** Asegurar que `frightTimer > 0` (de `gloton-02`) domina scatter/chase: los fantasmas afectados huyen y, al terminar, retoman la fase vigente. Usar `FRIGHT_MS_BY_LEVEL[level-1]` en vez de la constante fija de `gloton-02`. Prueba local: comer una píldora sigue invirtiendo los papeles; al agotarse, los fantasmas retoman la fase scatter/chase correcta.
4. **Frutas bonus.** Al alcanzar los umbrales de `dotsEaten`, spawnear una fruta en el centro con `kind`/`points` de `FRUIT_TABLE[min(level-1, last)]` y un `timer`; comerla suma el bono y la elimina; si el `timer` llega a 0 desaparece. Prueba local: la fruta aparece al comer suficientes puntos, comerla suma el bono correcto, y desaparece sola si no se come a tiempo.
5. **Progresión de niveles.** Al vaciar el laberinto: si `level < MAX_LEVEL`, subir nivel (`onLevelChange`), reconstruir laberinto lleno, reposicionar actores, aplicar `PAC_SPEED`/`GHOST_SPEED`/`FRIGHT_MS_BY_LEVEL`/`SCATTER_CHASE_MS` del nuevo nivel, conservar score y vidas; si `level === MAX_LEVEL`, disparar `onGameOver(score, true)`. Prueba local: completar un nivel reinicia el laberinto y sube la dificultad; completar el último gana la partida.
6. **Reset extendido.** `reset()` vuelve al nivel 1 con velocidades/duraciones iniciales, sin fruta activa, fase scatter/chase reiniciada, además de lo que ya restauraban `gloton-01`/`gloton-02`. Prueba local: JUGAR DE NUEVO reinicia al nivel 1 con la dificultad base.
7. **Build + playtest.** `npm run build` sin errores. Playtest en `/games/gloton/jugar`: las personalidades hacen rutas distintas, scatter/chase alterna, las frutas bonus aparecen y puntúan, los niveles suben con más velocidad, y las mecánicas de `gloton-01`/`gloton-02` siguen intactas.
8. **Cierre.** Verificar los criterios de aceptación; el spec queda en Borrador para que Tito lo apruebe e implemente vía `/spec-impl`.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Cada fantasma persigue con un objetivo distinto en `chase`: Blinky directo, Pinky por delante, Inky con el vector duplicado sobre Blinky, Clyde condicionado por distancia (con repliegue a su esquina cuando está cerca).
- [ ] Existe una alternancia global scatter/chase por temporizador; en scatter cada fantasma se repliega a su esquina asignada.
- [ ] Al cambiar de fase scatter/chase, los fantasmas no asustados invierten su dirección.
- [ ] El modo asustado de `gloton-02` tiene prioridad: comer una píldora hace huir a los fantasmas y, al terminar, retoman la fase scatter/chase vigente.
- [ ] La duración del modo asustado se acorta en niveles más altos según `FRIGHT_MS_BY_LEVEL`.
- [ ] Aparece una fruta bonus en el centro tras comer suficientes puntos; comerla suma el bono del nivel y desaparece; si no se come a tiempo, desaparece sola.
- [ ] Vaciar el laberinto sube de nivel (HUD "Nivel" avanza), reconstruye el laberinto lleno y aumenta la velocidad de glotón y fantasmas, conservando score y vidas.
- [ ] Completar el último nivel dispara la victoria (`won = true`); agotar las vidas dispara el game over (`won = false`).
- [ ] El tipo y el puntaje de la fruta cambian por nivel según `FRUIT_TABLE`.
- [ ] "JUGAR DE NUEVO" reinicia al nivel 1 con la dificultad base, sin fruta activa y con la fase scatter/chase reiniciada.
- [ ] Las mecánicas de `gloton-01` (movimiento, puntos, vidas/respawn, túnel) y de `gloton-02` (píldoras, cadena de puntaje, stat extra) siguen funcionando.
- [ ] Los demás juegos y la fila `gloton` en Supabase siguen sin cambios.

## Decisiones

- **Sí:** replicar las cuatro personalidades clásicas (Blinky/Pinky/Inky/Clyde) por su objetivo de persecución, no por velocidad. Da profundidad táctica reconocible sin complicar el motor de movimiento.
- **Sí:** alternancia scatter/chase por temporizador global con inversión de dirección al cambiar de fase, fiel al comportamiento clásico y clave para que el laberinto sea jugable a niveles altos.
- **Sí:** progresión de niveles reusando `onLevelChange` del contrato compartido, con tablas por nivel para velocidad y tiempos. Reaprovecha el slot de nivel que en `gloton-01` estaba fijo en 1.
- **Sí:** victoria al completar `MAX_LEVEL` (p. ej. 5), reusando `onGameOver(score, true)`. Coherente con Arkanoid (SPEC 08), que también gana al completar su último nivel.
- **Sí:** frutas bonus dibujadas en canvas (sin assets externos), con tipo/puntaje por nivel. Mantiene el spec autocontenido y sin dependencias de archivos nuevos en `public/`.
- **No:** velocidades diferenciadas por fantasma o mecánicas "elroy"/túnel dentro de un nivel. Añaden complejidad de balance que no aporta al objetivo de este spec; quedan para un spec futuro.
- **No:** cinemáticas o intermedios entre niveles. Fuera del alcance del motor de juego; puramente cosmético.

## Riesgos

| Riesgo                                                                                                                                               | Mitigación                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El objetivo de Inky (vector duplicado con la posición de Blinky) es sutil y fácil de implementar mal, dando rutas raras.                             | Calcular el objetivo exactamente como el clásico (punto 2 celdas delante del glotón, duplicar el vector desde Blinky) y validarlo en modo debug dibujando el objetivo de cada fantasma en el playtest del paso 1. |
| Las tablas por nivel (velocidades, tiempos) pueden hacer el juego imposible o trivial a niveles altos.                                               | Los valores son datos ajustables en un solo lugar (`PAC_SPEED`, `GHOST_SPEED`, `SCATTER_CHASE_MS`, `FRIGHT_MS_BY_LEVEL`); se afinan en el playtest sin tocar la lógica.                                           |
| La interacción entre modo asustado (`gloton-02`) y la fase scatter/chase podría dejar a un fantasma en un estado inconsistente al terminar el susto. | El modo asustado se trata como una capa que suspende scatter/chase sin borrar `phase`/`phaseTimer`; al terminar, el fantasma simplemente vuelve a leer la fase global vigente.                                    |

## Qué **no** está en este spec

- Cinemáticas/intermedios entre niveles.
- Velocidades diferenciadas por fantasma dentro de un nivel (túnel, "elroy", etc.).
- Assets de sprites externos para frutas o fantasmas.
- Sonido/música.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
