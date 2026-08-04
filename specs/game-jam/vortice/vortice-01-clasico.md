# SPEC — Juego real: Vórtice (Tempest)

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (esquema de `games`/`scores` en Supabase — la fila `vortice` **no** existe todavía y debe insertarse), SPEC 07 (convención sin sonido, estado mutable en `useRef`, loop con `dt` capado a 50ms)
> **Fecha:** 2026-08-04
> **Objetivo:** Crear desde cero un componente cliente en canvas (`VorticeGame`) que implemente un tube shooter estilo Tempest —tubo circular de 16 carriles renderizado con perspectiva vectorial, nave-garra que patrulla el borde exterior, disparo radial hacia el centro y oleadas de enemigos "Trepador" que escalan desde el vórtice y atacan por el borde— e integrarlo en `/games/vortice/jugar`, sembrando por primera vez la fila `vortice` en Supabase (no existe placeholder previo).

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/vortice-game.tsx` que implementa el tubo desde cero, sin fuente de port previa (no existe en `references/started-games/` ni en `references/source-assets/`).
- Tubo circular fijo de `LANES = 16` carriles, dibujado en perspectiva vectorial sobre canvas de resolución fija 800×600 (mismo tamaño que Asteroids/Arkanoid/Snake, centro del tubo en `(400, 300)`, escalado dentro de `.crt-screen`): un polígono exterior en `R_OUTER` (borde, cerca del jugador), un polígono interior en `R_INNER` (vórtice, punto de fuga), 16 líneas radiales que dividen los carriles, y 2–3 arcos concéntricos intermedios solo como referencia visual de profundidad (sin función de juego).
- Nave-garra controlable por carril: ocupa un `playerLane` entero (0–15), se desplaza un carril por paso cada `PLAYER_STEP_MS` mientras se mantiene presionada ← o →, con wrap circular (carril 15 → 0 y viceversa). El desplazamiento se sondea cada frame vía `keys[code]` (igual que el empuje de Asteroids), no por evento discreto.
- Disparo con `Space`: nace en `R_OUTER` del carril actual del jugador y viaja hacia `R_INNER` a `SHOT_SPEED` px/s; hasta `MAX_SHOTS` proyectiles simultáneos en vuelo; `FIRE_COOLDOWN_MS` entre disparos consecutivos aunque se mantenga la tecla presionada. Un disparo que llega a `R_INNER` sin impactar nada desaparece sin efecto.
- Enemigo único, "Trepador": nace en `R_INNER` de un carril elegido al azar entre los que no tengan ya un trepador recién generado, y escala hacia `R_OUTER` a `enemySpeed` px/s (constante por nivel, creciente entre niveles). Al llegar a `R_OUTER`: si su carril coincide con `playerLane`, resta una vida y el trepador desaparece; si no coincide, queda "pegado" al borde y se desliza un carril por paso cada `RIM_STEP_MS` en la dirección más corta hacia `playerLane` hasta alcanzarlo (momento en que resta la vida y desaparece).
- Colisión disparo-trepador: en cada frame, si el radio de un disparo (bajando) y el radio de un trepador (subiendo o ya pegado al borde) están en el mismo carril y sus intervalos de movimiento del frame se solapan, ambos se destruyen; suma `KILL_SCORE` (150 puntos) fijos, sin importar en qué punto del carril ocurrió el impacto.
- Oleadas por nivel: `waveSize` trepadores (arranca en `WAVE_SIZE_START = 8`, `+2` por nivel, techo `WAVE_SIZE_MAX = 24`), generados de a uno cada `SPAWN_INTERVAL_MS` hasta agotar `waveSize`. La oleada del nivel termina cuando ya se generaron los `waveSize` trepadores **y** no queda ninguno vivo (ni escalando ni pegado al borde); en ese momento sube el nivel, se recalcula `enemySpeed` (`+ENEMY_SPEED_STEP` por nivel) y `waveSize` para la siguiente oleada, y se dispara `onLevelChange`. El juego no tiene fin: al no haber techo de niveles, la dificultad crece indefinidamente (igual convención que Asteroids/Snake).
- Vidas: arranca en 3 (`onLivesChange(3)`). Perder una vida (contacto de un trepador en `playerLane` al llegar o al deslizarse hasta él) no reinicia el tubo: el score, el nivel y los trepadores vivos restantes se conservan; el jugador respawnea en `playerLane = 0` con `RESPAWN_INVULN_MS` de invulnerabilidad antes de poder volver a perder una vida. A 0 vidas: `onGameOver(score, false)`.
- El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa en esta base.
- Controles por teclado vía `e.code` (← →, `Space`), con `preventDefault` en las teclas de control.
- Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa) y acumuladores de paso independientes para el movimiento del jugador, el cooldown de disparo, el deslizamiento por el borde de cada trepador y la generación de la oleada.
- `onScoreChange`/`onLevelChange` disparados solo al cambiar; `onLivesChange` disparado solo al cambiar.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye el tubo vacío, `playerLane = 0`, score 0, 3 vidas, nivel 1, `waveSize`/`enemySpeed` iniciales y una oleada nueva desde cero; `forceGameOver()` fuerza el game over inmediato con el score acumulado.
- Metadata nueva a sembrar en Supabase (tabla `games`, sin fila previa): `id='vortice'`, `title='VÓRTICE'`, `cat='SHOOTER'`, `color='magenta'`, `cover='cover-vortice'` (clase CSS nueva, no existe hoy en `app/globals.css`); `short`/`long` propuestos en este spec. Se registra el componente en `GAME_REGISTRY` con la clave `"vortice"`.

**Fuera de alcance (para specs futuros si llegan):**

- Formas de tubo alternativas (estrella, tubo abierto, en forma de "U", etc. del original) — un único tubo circular en este spec.
- El Superzapper (bomba de pantalla de usos limitados) y las Púas/Spikers (espinas bloqueadoras de carril) — van en `vortice-02-superzapper.md`.
- Otros tipos de enemigo del original (Tanker, Fuseball, Pulsar) — ninguno en esta base.
- Puntaje variable según en qué punto del carril se destruye al trepador (siempre 150 puntos fijos).
- Controles táctiles/móviles.
- Sonido/música.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

Introduce una fila nueva en `games` (esquema ya definido por SPEC 06, sin cambios de esquema) y el estado interno del componente:

```ts
// app/components/games/vortice-game.tsx
type EnemyState = "climbing" | "rim";

interface Enemy {
  lane: number; // 0..15
  radius: number; // R_INNER..R_OUTER
  state: EnemyState;
  rimAccum: number; // ms acumulados desde el último paso de deslizamiento por el borde
  alive: boolean;
}

interface Shot {
  lane: number;
  radius: number; // R_OUTER..R_INNER, decreciente
  alive: boolean;
}

interface GameData {
  playerLane: number; // 0..15
  moveAccum: number; // ms acumulados desde el último paso de carril del jugador
  fireCooldownAccum: number;
  shots: Shot[];
  enemies: Enemy[];
  spawnedCount: number; // trepadores generados en la oleada actual
  waveSize: number; // total de trepadores de la oleada actual
  spawnAccum: number;
  score: number;
  lives: number;
  level: number;
  enemySpeed: number; // px/s, recalculado en cada nivel
  invulnMs: number; // ms restantes de invulnerabilidad tras respawn
  state: "playing" | "gameover";
}

export type VorticeGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type VorticeGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

Convenciones:

- Canvas 800×600, centro del tubo en `(400, 300)`. `LANES = 16`, `R_OUTER = 250`, `R_INNER = 40`.
- `PLAYER_STEP_MS = 90` mientras se mantiene ← o → presionada.
- `SHOT_SPEED = 700` px/s, `MAX_SHOTS = 3`, `FIRE_COOLDOWN_MS = 150`.
- `ENEMY_SPEED_START = 90` px/s, `ENEMY_SPEED_STEP = 12` por nivel.
- `WAVE_SIZE_START = 8`, `WAVE_SIZE_STEP = 2` por nivel, `WAVE_SIZE_MAX = 24`.
- `SPAWN_INTERVAL_MS = 900`, `RIM_STEP_MS = 220`.
- `KILL_SCORE = 150`, `RESPAWN_INVULN_MS = 1200`, `LIVES_START = 3`.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo.

## Plan de implementación

1. **Metadata propuesta (sin insertar todavía).** Confirmar `id='vortice'`, `title='VÓRTICE'`, `cat='SHOOTER'`, `color='magenta'`, `cover='cover-vortice'`, `short`/`long` de este spec como la fila a insertar en `games`. La inserción real y la creación de la clase CSS `cover-vortice` en `app/globals.css` (patrón de gradiente + pseudo-elementos de las demás `cover-*`, con estética de túnel neón magenta/cian coherente con el fondo `perspective-grid` de la app) las ejecuta `/add-game`, no este spec. Prueba: `select * from games where id = 'vortice'` no devuelve filas antes de la implementación.
2. **Geometría del tubo y render estático.** Crear `app/components/games/vortice-game.tsx` que dibuja el tubo (polígono exterior en `R_OUTER`, polígono interior en `R_INNER`, 16 líneas radiales, 2–3 arcos concéntricos de referencia) y la nave-garra inmóvil en `playerLane = 0`, sin movimiento ni enemigos aún. Loop `requestAnimationFrame` con `dt` capado a 50ms montado pero solo redibujando. Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página; render local muestra el tubo completo con la nave en el borde.
3. **Movimiento del jugador.** Sondear `keys[code]` cada frame (← →, `preventDefault`); un paso de carril cada `PLAYER_STEP_MS` mientras se mantiene la tecla, con wrap circular entre el carril 15 y el 0. Prueba local: la nave recorre los 16 carriles alrededor del borde sin salirse de rango, en ambas direcciones.
4. **Disparo.** `Space` genera un disparo en `R_OUTER` del carril actual que viaja hacia `R_INNER` a `SHOT_SPEED`, hasta `MAX_SHOTS` simultáneos, con `FIRE_COOLDOWN_MS` de cooldown. Prueba local: los disparos se ven viajando hacia el centro y desaparecen al llegar a `R_INNER` sin impactar nada.
5. **Trepadores y colisión.** Generar la oleada del nivel actual (`waveSize` trepadores escalonados cada `SPAWN_INTERVAL_MS` desde carriles aleatorios); cada trepador escala desde `R_INNER` a `enemySpeed`; colisión disparo-trepador por solapamiento de intervalos de radio en el mismo carril (+150, ambos desaparecen); un trepador que llega a `R_OUTER` resta una vida si coincide con `playerLane`, o se desliza por el borde cada `RIM_STEP_MS` hacia el jugador hasta alcanzarlo. Prueba local: un trepador interceptado por un disparo en su carril muere antes de llegar al borde; uno no interceptado llega al borde y, si no coincide con el jugador, se desliza hasta alcanzarlo y resta una vida.
6. **Vidas, respawn y progresión de niveles.** Vidas iniciales 3 (`onLivesChange`); perder una vida respawnea al jugador en `playerLane = 0` con `RESPAWN_INVULN_MS` de invulnerabilidad, sin resetear el tubo ni el score; a 0 vidas dispara `onGameOver(score, false)`. Al completar la oleada (todos generados y ninguno vivo) sube de nivel, recalcula `enemySpeed` y `waveSize`, dispara `onLevelChange`, y arranca la siguiente oleada. Prueba local: perder una vida no borra los trepadores restantes de la oleada; limpiar una oleada completa carga la siguiente con más trepadores y más rápidos.
7. **Ref imperativa y registro.** Implementar `forwardRef` + `useImperativeHandle` con `reset()` (tubo vacío, `playerLane = 0`, score 0, 3 vidas, nivel 1, oleada nueva) y `forceGameOver()` (game over inmediato con el score acumulado). Agregar `"vortice": { Component: VorticeGame }` a `GAME_REGISTRY` en `app/components/games/registry.ts` (sin `extraStatLabel`). Prueba: `/games/vortice/jugar` carga el juego real en canvas — requiere que la fila `vortice` ya exista en `games` (paso ejecutado por `/add-game`, no por este spec).
8. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/vortice/jugar`: moverse alrededor del tubo con ← →, disparar hacia el centro con `Space`, interceptar trepadores a media escalada y en el borde, perder una vida por contacto y respawnear con invulnerabilidad temporal, limpiar una oleada y ver la siguiente con más trepadores y más rápidos, PAUSA congela el loop, FIN cierra con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia sin recargar. Confirmar que los demás juegos siguen sin cambios.
9. **Cierre.** Verificar los criterios de aceptación uno por uno; el spec queda en Borrador para que Tito lo apruebe e implemente vía `/add-game`.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/vortice/jugar` carga sin errores en consola, con el juego real en canvas.
- [ ] El tubo se dibuja completo (16 carriles, borde exterior, vórtice interior, arcos de referencia) a resolución fija 800×600 escalada dentro de `.crt-screen`.
- [ ] La nave-garra se mueve carril por carril con ← y →, con wrap circular entre el carril 15 y el 0.
- [ ] `Space` dispara un proyectil que viaja desde el borde hacia el centro del carril actual, con un máximo de disparos simultáneos y un cooldown entre disparos.
- [ ] Los trepadores nacen en el centro de un carril aleatorio y escalan hacia el borde a velocidad creciente por nivel.
- [ ] Un disparo que cruza el radio de un trepador en el mismo carril destruye a ambos y suma 150 puntos.
- [ ] Un trepador que llega al borde en el carril del jugador resta una vida de inmediato y desaparece.
- [ ] Un trepador que llega al borde en otro carril se desliza hacia el carril del jugador hasta alcanzarlo, restando una vida en ese momento.
- [ ] El HUD "Vidas" arranca en 3 ♥ y baja al perder cada vida; a 0 vidas se abre el modal de fin de partida.
- [ ] Perder una vida respawnea al jugador con un período breve de invulnerabilidad sin borrar los trepadores restantes de la oleada ni el score.
- [ ] Completar una oleada (todos los trepadores generados y ninguno vivo) suma el siguiente nivel, aumenta la velocidad de los trepadores y agranda la oleada (hasta el techo definido), sin terminar la partida.
- [ ] El HUD "Nivel" refleja el nivel real alcanzado.
- [ ] No se muestra ningún stat extra en el HUD (el slot de stat extra no se usa en este spec).
- [ ] El botón PAUSA congela el loop por completo (nave, disparos y trepadores dejan de moverse); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada y abre el modal de fin de partida.
- [ ] "GUARDAR PUNTUACIÓN" añade una fila real a `scores` en Supabase con `game_id = 'vortice'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego desde cero (tubo vacío, nave en el carril 0, score 0, 3 vidas, nivel 1) sin recargar la página.
- [ ] "SALIR" navega a `/games/vortice` sin errores.
- [ ] Las flechas y la barra espaciadora no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`rocas`, `caida`, `bloque-buster`, `serpentina`, `ranaria` y los decorativos restantes) siguen sin cambios.
- [ ] La fila `vortice` en la tabla `games` de Supabase queda sembrada con los valores de metadata propuestos en este spec.

## Decisiones

- **Sí:** un único tubo circular en esta base, dejando explícitamente las formas alternativas del original (estrella, tubo abierto, "U") fuera de alcance. Reduce la superficie de la base y evita acoplar la geometría del render a una lista de formas antes de validar el juego mínimo.
- **Sí:** movimiento del jugador discreto por carril (`playerLane` entero, paso cada `PLAYER_STEP_MS`), en vez de movimiento angular continuo en píxeles. Más simple de implementar en canvas 2D y consistente con el patrón de "paso con acumulador" ya usado en Serpentina/Excavador, adaptado a coordenadas polares.
- **Sí:** un único tipo de enemigo (Trepador) en la base, dejando Púas/Spikers y el Superzapper explícitamente para `vortice-02-superzapper.md`. Mismo patrón que Pooka/Fygar en `excavador-01-clasico.md`/`excavador-02-modo-fygar.md`.
- **Sí:** colisión disparo-trepador por solapamiento del intervalo de radio recorrido en el frame (barrido), no por igualdad exacta de radios. Evita que un `dt` grande "salte" el impacto cuando ambos radios se cruzan entre dos frames, igual criterio que la detección de colisión discreta ya usada en Asteroids.
- **Sí:** perder una vida no resetea el tubo (score, nivel y trepadores vivos se conservan); solo respawnea al jugador con invulnerabilidad breve. Mantiene el ritmo de la oleada en curso y evita que un solo golpe borre todo el progreso de la oleada, más justo para un tubo que puede tener varios trepadores activos a la vez.
- **No:** portar el Superzapper del original a esta base. Es un mecanismo icónico pero secundario; introducirlo junto con las Púas en `vortice-02-superzapper.md` mantiene la base acotada y revisable por separado.
- **No:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel`) en la base. Se reserva para el contador de cargas de Superzapper en `vortice-02-superzapper.md`.
- **Sí:** insertar una fila nueva en `games` (no hay placeholder previo para `vortice`), con clase `cover-vortice` nueva en `app/globals.css`. A diferencia de `gloton`/`ranaria`/`invasores`/`duelo-pixel`, este juego no estaba sembrado como decorativo; la inserción y la clase CSS las ejecuta `/add-game`, no este spec.
- **No:** tocar `game-player.tsx` — ya resuelve el componente a mostrar genéricamente vía `GAME_REGISTRY[game.id]`, sin condicionales por juego.

## Riesgos

| Riesgo                                                                                                                                                                                   | Mitigación                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Con un `dt` grande (pestaña recuperando foco), el radio de un disparo o de un trepador puede avanzar varios píxeles en un solo frame, saltándose una colisión que debería haber ocurrido | La colisión se evalúa comparando el intervalo `[radioAntes, radioDespués]` de cada disparo contra el radio de cada trepador vivo en el mismo carril (barrido), no una igualdad puntual; el `dt` capado a 50ms limita además cuánto puede saltar cada radio por frame. |
| Varios trepadores llegando al borde en carriles lejanos del jugador y deslizándose simultáneamente podrían converger casi al mismo tiempo sobre `playerLane`, sintiéndose injusto        | `RIM_STEP_MS` y `SPAWN_INTERVAL_MS` se ajustan en el playtest del paso 8 para dejar margen real de reacción; aceptado como parte del ajuste de dificultad normal de un juego nuevo, no un bug de diseño.                                                              |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame` o los listeners de teclado                                      | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `asteroids-game.tsx`/`excavador-game.tsx`; se verifica manualmente en dev.                                   |
| Sin una fila previa en `games`, el spec no puede probarse en `/games/vortice/jugar` hasta que `/add-game` inserte la fila y cree la clase `cover-vortice`                                | Aceptado como parte del flujo normal de un juego nuevo (a diferencia de los "wins baratos" que reusan placeholder); documentado explícitamente en el plan de implementación (pasos 1 y 7).                                                                            |

## Qué **no** está en este spec

- Formas de tubo alternativas (estrella, tubo abierto, "U", etc.).
- El Superzapper y las Púas/Spikers (van en `vortice-02-superzapper.md`).
- Otros tipos de enemigo del original (Tanker, Fuseball, Pulsar).
- Puntaje variable según el punto del carril donde se destruye al trepador.
- Controles táctiles/móviles.
- Sonido/música, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
