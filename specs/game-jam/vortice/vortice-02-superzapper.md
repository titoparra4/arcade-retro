# SPEC — Extensión de Vórtice: Púas y Superzapper

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `vortice` ya sembrada por `vortice-01-clasico.md`), `vortice-01-clasico.md` (componente base `VorticeGame`: tubo circular de 16 carriles, nave-garra, disparo radial, enemigo "Trepador", oleadas por nivel)
> **Fecha:** 2026-08-04
> **Objetivo:** Extender `VorticeGame` con dos mecánicas icónicas de Tempest —"Púas" (Spikers) que bloquean un carril con una espina creciente, y el Superzapper, una bomba de pantalla de usos limitados por vida— agregando el stat extra "Superzapper" al HUD para mostrar las cargas restantes.

## Alcance

**Dentro:**

- Nuevo tipo de enemigo "Púa", mezclado con Trepador desde el nivel 2 en adelante: las oleadas de `vortice-01-clasico.md` se extienden con un campo `kind` por cada trepador generado; el nivel 1 sigue generando solo Trepadores.
- Una Púa nace en el centro de un carril elegido al azar (nunca el mismo carril que un Trepador recién nacido) y, en vez de escalar de forma continua como el Trepador, hace crecer una espina sólida desde `R_INNER` hacia `R_OUTER` a `SPIKE_GROW_SPEED` px/s.
- La espina bloquea disparos: un disparo que llega al radio de la punta de la espina no sigue de largo hacia el centro, se detiene ahí y cuenta como un impacto contra la Púa.
- Si la espina alcanza `R_OUTER` mientras el jugador está en ese carril, resta una vida (mismo respawn e invulnerabilidad de `vortice-01-clasico.md`); a diferencia de un Trepador, la espina **no desaparece** al restar la vida — sigue bloqueando el carril hasta ser destruida.
- Cada disparo que impacta la punta de una espina la retrae `SPIKE_SHRINK_PER_HIT` px de inmediato y resta un golpe a la resistencia de la Púa (`SPIKE_HITS_TO_KILL` golpes en total): +50 puntos por golpe; al llegar a 0 golpes de resistencia, la Púa se destruye, la espina se retrae del todo y libera el carril, sumando +200 puntos adicionales.
- Superzapper: nueva tecla `ShiftLeft`. Cada vida arranca con `SUPERZAPPER_CHARGES_PER_LIFE = 2` cargas. Al presionar `ShiftLeft` con al menos una carga disponible, destruye de inmediato a todos los Trepadores, Púas y espinas activas en el tubo (cada uno suma la mitad de sus puntos normales: 75 por Trepador, 100 por Púa completa) y consume una carga; presionarlo sin cargas disponibles no tiene efecto. Las cargas se reinician a 2 en cada respawn (nueva vida), nunca se acumulan entre vidas ni se recuperan al limpiar una oleada.
- Stat extra en el HUD: `onExtraStatChange` reporta las cargas de Superzapper restantes de la vida actual (`0`, `1` o `2`); se registra `extraStatLabel: "Superzapper"` en `GAME_REGISTRY`.
- `reset()` (heredado de `vortice-01-clasico.md`) se extiende para arrancar sin Púas activas, sin espinas en el tubo y con las 2 cargas de Superzapper completas.

**Fuera de alcance (para specs futuros si llegan):**

- Otros tipos de enemigo del original (Tanker, Fuseball, Pulsar) — Púa es el único agregado en este spec.
- Formas de tubo alternativas (estrella, tubo abierto, "U", etc.) — sigue fuera de alcance, igual que en la base.
- Cargas de Superzapper acumulables entre vidas, comprables con puntaje, o limitadas por nivel en vez de por vida (el original clásico las limita por nivel; se simplifica a "por vida" en este spec).
- Sonido/música (incluido el efecto de barrido del Superzapper).
- Controles táctiles/móviles.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`vortice` ya existe en `games`, sembrado por `vortice-01-clasico.md`). Extiende el estado interno definido en esa spec base:

```ts
// app/components/games/vortice-game.tsx — extensiones sobre vortice-01
type EnemyKind = "trepador" | "pua";

interface Enemy {
  kind: EnemyKind;
  lane: number;
  radius: number; // para "trepador": posición de escalada; para "pua": longitud actual de la espina
  state: "climbing" | "rim"; // solo relevante si kind === "trepador"
  rimAccum: number; // solo relevante si kind === "trepador"
  hitsLeft: number; // solo relevante si kind === "pua": golpes de resistencia restantes
  alive: boolean;
}

interface GameData {
  // ...campos de vortice-01 (playerLane, moveAccum, fireCooldownAccum, shots,
  // spawnedCount, waveSize, spawnAccum, score, lives, level, enemySpeed,
  // invulnMs, state)
  enemies: Enemy[]; // ahora puede incluir "trepador" y "pua"
  superzapperCharges: number; // 0..2, recargado en cada respawn
}

// Constantes nuevas
const SPIKE_GROW_SPEED = 45; // px/s
const SPIKE_SHRINK_PER_HIT = 30; // px retraídos por golpe
const SPIKE_HITS_TO_KILL = 4;
const SPIKE_HIT_SCORE = 50;
const SPIKE_KILL_BONUS = 200;
const SUPERZAPPER_CHARGES_PER_LIFE = 2;
const SUPERZAPPER_TREPADOR_SCORE = 75; // mitad de KILL_SCORE (150)
const SUPERZAPPER_PUA_SCORE = 100; // mitad de SPIKE_HIT_SCORE*hits + SPIKE_KILL_BONUS, redondeado
```

```ts
// app/components/games/registry.ts — entrada actualizada
vortice: { Component: VorticeGame, extraStatLabel: "Superzapper" },
```

Convenciones:

- El nivel 1 sigue sin Púas (solo Trepadores, fiel a `vortice-01-clasico.md`); desde el nivel 2, cada oleada incorpora 1–2 Púas mezcladas con los Trepadores.
- `onExtraStatChange` reporta `superzapperCharges` sin transformación (valor entero 0–2), a diferencia del redondeo hacia arriba usado para conteos de tiempo en otros juegos.
- Estado mutable en el mismo `useRef<GameData>` de `vortice-01-clasico.md`, sin variables sueltas a nivel de módulo.

## Plan de implementación

1. **Tipo de enemigo en las oleadas.** Extender la generación de oleada para incluir un campo `kind` por enemigo; el nivel 1 mantiene todos `kind: "trepador"`, los niveles 2 en adelante agregan 1–2 `kind: "pua"` por oleada, elegidos en carriles distintos a los Trepadores recién nacidos. Prueba: el nivel 1 sigue generando solo Trepadores igual que en `vortice-01-clasico.md`; los niveles 2+ generan al menos una Púa por oleada.
2. **Crecimiento de la espina y bloqueo de disparos.** Dibujar la Púa (espina roja/magenta creciendo desde el centro) a `SPIKE_GROW_SPEED`; un disparo que llega al radio de la punta se detiene ahí en vez de seguir hacia el centro. Prueba local: dejar crecer una espina sin dispararla llega al borde y bloquea visualmente el carril; un disparo lanzado hacia ese carril se frena en la punta de la espina en vez de atravesarla.
3. **Daño por espina y resistencia de la Púa.** Estar en el carril de una espina que alcanza `R_OUTER` resta una vida (mismo respawn/invulnerabilidad de la base) sin eliminar la espina. Cada disparo que toca la punta retrae `SPIKE_SHRINK_PER_HIT` y resta un golpe de `hitsLeft` (+50); al llegar a 0, la Púa se destruye, la espina se retrae del todo y libera el carril (+200 adicionales). Prueba local: dejar que una espina alcance el borde con el jugador en ese carril resta una vida sin quitar la espina; disparar repetidamente contra la punta la retrae hasta destruir la Púa y liberar el carril.
4. **Superzapper.** Tecla `ShiftLeft`; con carga disponible, destruye de inmediato todos los Trepadores, Púas y espinas activas del tubo (75 puntos por Trepador, 100 por Púa) y consume una carga; sin cargas, no tiene efecto. Las cargas se recargan a 2 solo en cada respawn de vida. Prueba local: usar el Superzapper limpia el tubo completo de una vez; usarlo dos veces seguidas agota las cargas de la vida y una tercera pulsación no hace nada hasta la siguiente vida.
5. **Stat extra y registro.** Reportar `onExtraStatChange` con `superzapperCharges` en cada cambio; actualizar `GAME_REGISTRY["vortice"]` con `extraStatLabel: "Superzapper"`. Prueba: el HUD muestra "Superzapper" con el conteo 2 → 1 → 0 a medida que se usa, y vuelve a 2 tras perder una vida.
6. **Reset y build + playtest.** Extender `reset()` (heredado de la base) para arrancar sin Púas ni espinas activas y con 2 cargas de Superzapper. `npm run build` sin errores. Playtest en `/games/vortice/jugar`: las Púas aparecen desde el nivel 2, sus espinas bloquean disparos y dañan si llegan al borde, se destruyen con varios impactos en la punta, el Superzapper limpia el tubo con cargas limitadas por vida que se recargan al respawnear, el HUD muestra el conteo de cargas, y el resto del juego base (movimiento, disparo, Trepadores, niveles, vidas) sigue intacto.
7. **Cierre.** Verificar los criterios de aceptación uno por uno; el spec queda en Borrador para que Tito lo apruebe e implemente vía `/spec-impl` (o `/spec-impl-game` si más adelante se decide sumar skins/táctil).

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Desde el nivel 2 en adelante aparecen 1–2 Púas mezcladas con los Trepadores en cada oleada; el nivel 1 sigue sin Púas.
- [ ] La espina de una Púa crece visiblemente desde el centro hacia el borde a `SPIKE_GROW_SPEED`.
- [ ] Un disparo que llega a la punta de una espina se detiene ahí (no atraviesa hacia el centro) y cuenta como un impacto contra la Púa.
- [ ] Una espina que alcanza el borde mientras el jugador está en ese carril resta exactamente una vida, con el mismo respawn e invulnerabilidad que el resto del juego, sin eliminar la espina.
- [ ] Golpear repetidamente la punta de una espina la retrae hasta destruir la Púa por completo, liberando el carril.
- [ ] Destruir una Púa por completo suma los puntos de sus golpes (+50 cada uno) más el bono de destrucción (+200).
- [ ] `ShiftLeft` con al menos una carga disponible destruye de inmediato todos los Trepadores, Púas y espinas activas del tubo, sumando la mitad de sus puntos normales por cada uno, y consume una carga.
- [ ] `ShiftLeft` sin cargas disponibles no tiene ningún efecto.
- [ ] Las cargas de Superzapper se reinician a 2 únicamente al respawnear tras perder una vida, nunca al limpiar una oleada ni por ningún otro evento.
- [ ] El HUD muestra el stat extra "Superzapper" con el conteo de cargas restantes (0, 1 o 2), actualizado en vivo.
- [ ] "JUGAR DE NUEVO" reconstruye el nivel 1 sin Púas ni espinas activas y con 2 cargas de Superzapper.
- [ ] La entrada de `GAME_REGISTRY` para `vortice` incluye `extraStatLabel: "Superzapper"`.
- [ ] El resto del juego base (movimiento por carril, disparo, Trepadores, oleadas, niveles, vidas, puntaje) sigue funcionando como en `vortice-01-clasico.md`.
- [ ] La fila `vortice` en la tabla `games` de Supabase sigue sin cambios (ya sembrada por `vortice-01-clasico.md`).

## Decisiones

- **Sí:** Púas mezcladas desde el nivel 2, igual patrón que Fygar en `excavador-02-modo-fygar.md`. Mantiene el nivel 1 como introducción simple al juego, coherente con la base.
- **Sí:** la espina bloquea disparos en vez de dejarlos pasar de largo. Obliga a decidir entre despejar la Púa o esquivar temporalmente ese carril, variando la estrategia frente a solo esquivar Trepadores.
- **Sí:** la espina persiste bloqueando el carril tras restar una vida (a diferencia de un Trepador, que desaparece al golpear). Refuerza que una Púa sin atender es una amenaza continua, no un golpe único.
- **Sí:** cargas de Superzapper limitadas por vida (2, no acumulables), en vez de por nivel como en el original clásico. Simplifica el balance y el modelo de datos; documentado explícitamente como simplificación deliberada frente al arcade original.
- **No:** dar puntaje completo por enemigos eliminados con Superzapper. Solo la mitad de los puntos normales, para no convertirlo en la estrategia principal de farmeo de puntos.
- **Sí:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel: "Superzapper"`) para las cargas restantes. Da uso real al slot del contrato compartido, mismo patrón que "Peligro Fygar" en `excavador-02-modo-fygar.md` y "Triple disparo" en Asteroids.
- **No:** introducir un tercer tipo de enemigo o formas de tubo alternativas en este spec. Púa y Superzapper son los únicos agregados; cualquier otra mecánica del original queda para un spec futuro si se pide.

## Riesgos

| Riesgo                                                                                                                                                               | Mitigación                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El Superzapper podría trivializar oleadas completas si se usa apenas empieza cada vida, dejando el resto de la vida sin amenazas reales                              | Solo 2 cargas por vida, recargadas únicamente al respawnear (no al limpiar oleada), obligan a reservarlas para momentos de mayor riesgo en vez de gastarlas apenas empieza la vida; se ajusta en el playtest.     |
| Mezclar Trepador y Púa en el mismo arreglo `enemies` con campos exclusivos de cada tipo (`state`/`rimAccum` vs. `hitsLeft`) podría inducir a leer campos incorrectos | Los campos específicos de cada tipo solo se leen/escriben cuando `kind` coincide, siguiendo el mismo patrón "campo solo relevante si..." ya documentado en `excavador-02-modo-fygar.md`.                          |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame` o los listeners de teclado                  | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `vortice-01-clasico.md`; se verifica manualmente en dev. |

## Qué **no** está en este spec

- Otros tipos de enemigo del original (Tanker, Fuseball, Pulsar).
- Formas de tubo alternativas.
- Cargas de Superzapper acumulables entre vidas o limitadas por nivel en vez de por vida.
- Sonido/música.
- Controles táctiles/móviles, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
