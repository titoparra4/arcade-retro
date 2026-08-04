# SPEC — Extensión de Excavador: Fygar y el aliento de fuego

> **Estado:** Borrador
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `excavador` ya sembrada por `excavador-01-clasico.md`), `excavador-01-clasico.md` (componente base `ExcavadorGame`: grilla cavable, Pooka con persecución por túneles, bomba de aire, rocas que caen, niveles hardcodeados)
> **Fecha:** 2026-08-03
> **Objetivo:** Extender `ExcavadorGame` con Fygar, un dragón verde que respira fuego a través de los túneles cavados y exige una bomba de aire más resistente para reventarlo, agregando el stat extra "Peligro Fygar" al HUD para avisar cuándo un dragón está por escupir fuego.

## Alcance

**Dentro:**

- Nuevo tipo de enemigo Fygar, mezclado con Pooka desde el nivel 2 en adelante: los layouts de `LEVELS` (definidos en `excavador-01-clasico.md`) se extienden con un campo `kind` por cada entrada de enemigo; el nivel 1 sigue siendo solo Pooka.
- Fygar se mueve igual que Pooka —persecución por túneles ya cavados, minimizando distancia Manhattan— pero un poco más lento (`FYGAR_STEP_MS` mayor que `ENEMY_STEP_MS`).
- Cuando Fygar queda alineado con el excavador en la misma fila o columna, y existe una cadena continua de celdas cavadas entre ambos dentro de `FIRE_RANGE` celdas, entra en fase `charging` durante `FIRE_CHARGE_MS`. Al completarse, pasa a `breathing`: una llamarada ocupa esas celdas durante `FIRE_DURATION_MS`. Tras escupir, entra en `cooldown` por `FIRE_COOLDOWN_MS` antes de poder volver a `idle` y, eventualmente, a cargar de nuevo.
- Tocar una celda en llamas mientras `breathing` está activo resta exactamente una vida al excavador, con el mismo respawn en la celda de inicio y la misma ventana de invulnerabilidad (`RESPAWN_INVULN_MS`) que define `excavador-01-clasico.md`.
- Fygar es más resistente a la bomba de aire: su etapa máxima de inflado es `FYGAR_MAX_STAGE = 4` (una más que Pooka, cuyo máximo es 3). Solo puede conectarse con la manguera mientras está en `idle`; si está `charging` o `breathing`, la manguera no lo conecta (y se retrae si ya estaba conectado justo cuando empieza a cargar). Al reventar da `+400` puntos.
- Fygar también puede ser aplastado por una roca que cae, igual que Pooka pero con `+600` puntos en vez de `+500`.
- Stat extra en el HUD: mientras al menos un Fygar esté en fase `charging`, `onExtraStatChange` reporta el segundo entero restante (redondeo hacia arriba) hasta que el más próximo a escupir complete su carga; `0` cuando ningún Fygar está cargando. Se registra `extraStatLabel: "Peligro Fygar"` en `GAME_REGISTRY`.
- `reset()` (heredado de `excavador-01-clasico.md`) se extiende para reconstruir los Fygar del nivel correspondiente en fase `idle`, sin cooldown ni carga pendiente.

**Fuera de alcance (para specs futuros si llegan):**

- Un tercer tipo de enemigo o cualquier otro monstruo del Dig Dug original — Fygar es el único agregado en este spec.
- Fygar volando o atravesando tierra sólida sin cavar (existe rara vez en el original clásico) — se mantiene restringido a túneles ya cavados, igual que los Pooka de la base.
- Daño parcial por fuego — el contacto con una celda en llamas siempre resta exactamente una vida completa, nunca una fracción.
- Sonido/música (incluido el rugido de Fygar al escupir fuego).
- Controles táctiles/móviles.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`excavador` ya existe en `games`, sembrado por `excavador-01-clasico.md`). Extiende el estado interno definido en esa spec base:

```ts
// app/components/games/excavador-game.tsx — extensiones sobre excavador-01
type EnemyKind = "pooka" | "fygar";
type FygarPhase = "idle" | "charging" | "breathing" | "cooldown";

interface Enemy extends GridPos {
  kind: EnemyKind;
  alive: boolean;
  stepAccum: number;
  pumpStage: number; // 0..3 para pooka, 0..4 para fygar
  // Campos solo relevantes si kind === "fygar":
  phase: FygarPhase;
  phaseAccum: number; // ms acumulados en la fase actual
  fireDir: Direction | null; // dirección de la llamarada mientras phase === "breathing"
}

interface GameData {
  // ...campos de excavador-01 (grid, player, pendingDir, rocks, pump, score, lives, level, enemyStepMs, invulnMs, state)
  enemies: Enemy[]; // ahora puede incluir "pooka" y "fygar"
  fireCells: GridPos[]; // celdas actualmente en llamas, recalculadas cada frame desde los fygar en "breathing"
}

// Constantes nuevas
const FYGAR_STEP_MS = 380;
const FYGAR_MAX_STAGE = 4;
const FIRE_RANGE = 4;
const FIRE_CHARGE_MS = 900;
const FIRE_DURATION_MS = 500;
const FIRE_COOLDOWN_MS = 4000;
const FYGAR_POP_SCORE = 400;
const FYGAR_ROCK_SCORE = 600;
```

```ts
// app/components/games/excavador-levels.ts — LevelLayout extendido
interface LevelLayout {
  startCell: GridPos;
  preCarved: GridPos[];
  rocks: GridPos[];
  enemies: { pos: GridPos; kind: EnemyKind }[]; // antes GridPos[] (implícitamente "pooka")
}
```

```ts
// app/components/games/registry.ts — entrada actualizada
excavador: { Component: ExcavadorGame, extraStatLabel: "Peligro Fygar" },
```

Convenciones:

- El nivel 1 sigue sin Fygar (solo Pooka, fiel a `excavador-01-clasico.md`); desde el nivel 2, cada loop de `LEVELS` incorpora 1–2 Fygar mezclados con los Pooka.
- `onExtraStatChange` reporta `Math.ceil` del tiempo restante hasta completar la carga (en segundos) del Fygar con `phase === "charging"` que esté más cerca de terminar; `0` si ninguno lo está.
- Estado mutable en el mismo `useRef<GameData>` de `excavador-01-clasico.md`, sin variables sueltas a nivel de módulo.

## Plan de implementación

1. **Tipos de enemigo en los layouts.** Extender `LevelLayout.enemies` en `excavador-levels.ts` de `GridPos[]` a `{ pos: GridPos; kind: EnemyKind }[]`; el nivel 1 mantiene todos `kind: "pooka"`, los niveles 2 y 3 agregan 1–2 `kind: "fygar"` en cámaras propias. Prueba: `excavador-levels.ts` compila sin errores de tipos; el nivel 1 sigue generando solo Pooka igual que en `excavador-01-clasico.md`.
2. **Fygar con movimiento y render.** Dibujar a Fygar (dragón verde) reusando el movimiento por túneles cavados de la base (Manhattan, `FYGAR_STEP_MS`). Prueba local: los Fygar del nivel 2 en adelante persiguen al excavador igual que los Pooka, solo que un poco más lento y con otro color.
3. **Carga y aliento de fuego.** Detectar alineación fila/columna con el excavador dentro de `FIRE_RANGE` celdas conectadas por túneles cavados; entrar en `charging` por `FIRE_CHARGE_MS`, luego `breathing` llenando esas celdas de `fireCells` por `FIRE_DURATION_MS`, luego `cooldown` por `FIRE_COOLDOWN_MS` antes de volver a `idle`. Tocar el excavador con una celda en llamas resta una vida (mismo respawn/invulnerabilidad de la base). Prueba local: alinearse con un Fygar en un túnel abierto lo hace cargar y luego escupir fuego; quedarse en la llamarada resta una vida; alejarse antes de que termine de cargar evita el ataque.
4. **Bomba de aire contra Fygar.** La manguera puede conectar con un Fygar solo cuando está `idle`; sube de etapa hasta `FYGAR_MAX_STAGE` (4) y revienta en el siguiente tick (+400 puntos); intentar conectar mientras está `charging`/`breathing` no tiene efecto. Una roca que aplasta a un Fygar da +600 puntos. Prueba local: inflar un Fygar en reposo lo revienta tras una etapa más que un Pooka; intentar apuntar a un Fygar que está cargando no lo conecta.
5. **Stat extra en el HUD y registro.** Reportar `onExtraStatChange` con el segundo entero restante del Fygar más próximo a completar su carga, `0` si ninguno está `charging`. Actualizar `GAME_REGISTRY["excavador"]` con `extraStatLabel: "Peligro Fygar"`. Prueba: el HUD muestra "Peligro Fygar" con la cuenta regresiva mientras algún dragón carga, y no muestra nada (valor 0) el resto del tiempo.
6. **Reset y build + playtest.** Extender `reset()` (heredado de la base) para reconstruir los Fygar en `idle` sin fases activas, junto con los Pooka del nivel 1. `npm run build` sin errores. Playtest en `/games/excavador/jugar`: los Fygar aparecen desde el nivel 2, alinearse con uno lo hace cargar y escupir, el fuego mata si toca al excavador, la bomba de aire los revienta en una etapa más que a los Pooka, las rocas también los aplastan, el HUD muestra el aviso de peligro, y el resto del juego base (excavado, Pooka, rocas, niveles) sigue intacto.
7. **Cierre.** Verificar los criterios de aceptación uno por uno; el spec queda en Borrador para que Tito lo apruebe e implemente vía `/spec-impl` (o `/spec-impl-game` si más adelante se decide sumar skins/táctil).

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Desde el nivel 2 en adelante aparecen 1–2 Fygar mezclados con los Pooka; el nivel 1 sigue sin Fygar.
- [ ] Los Fygar se mueven por túneles cavados igual que los Pooka, a una velocidad algo menor (`FYGAR_STEP_MS`).
- [ ] Alinearse en fila o columna con un Fygar dentro de `FIRE_RANGE` celdas conectadas por túnel lo hace entrar en carga (`FIRE_CHARGE_MS`) y luego escupir una llamarada que ocupa esas celdas durante `FIRE_DURATION_MS`.
- [ ] Tocar una celda en llamas resta exactamente una vida, con el mismo respawn e invulnerabilidad temporal que el resto del juego.
- [ ] Tras escupir, el Fygar entra en cooldown (`FIRE_COOLDOWN_MS`) antes de poder volver a cargar.
- [ ] La bomba de aire puede conectar con un Fygar solo cuando está en reposo (`idle`); lo revienta tras 4 etapas de inflado (+400 puntos), una más que un Pooka.
- [ ] Intentar apuntar la bomba de aire a un Fygar que está cargando o escupiendo fuego no lo conecta.
- [ ] Una roca que aplasta a un Fygar suma +600 puntos.
- [ ] El HUD muestra el stat extra "Peligro Fygar" con la cuenta regresiva en segundos mientras algún dragón está cargando, y no muestra nada (valor 0) el resto del tiempo.
- [ ] "JUGAR DE NUEVO" reconstruye el nivel 1 sin Fygar y, al avanzar de nivel, los Fygar posteriores aparecen en estado de reposo sin fases activas.
- [ ] La entrada de `GAME_REGISTRY` para `excavador` incluye `extraStatLabel: "Peligro Fygar"`.
- [ ] El resto del juego base (excavado, Pooka, rocas, niveles, vidas, puntaje) sigue funcionando como en `excavador-01-clasico.md`.
- [ ] La fila `excavador` en la tabla `games` de Supabase sigue sin cambios (ya sembrada por `excavador-01-clasico.md`).

## Decisiones

- **Sí:** Fygar restringido a túneles ya cavados, igual que los Pooka de la base, sin el "vuelo ocasional a través de tierra" del original. Mantiene consistencia con la decisión ya tomada en `excavador-01-clasico.md` de no portar el "modo fantasma".
- **Sí:** el fuego solo se dispara en línea recta (fila o columna) a través de celdas ya cavadas, nunca a través de tierra sólida. Coherente con que el fuego, como cualquier otro elemento del juego, viaja por los túneles.
- **Sí:** Fygar requiere una etapa más de inflado que Pooka (`FYGAR_MAX_STAGE = 4` vs 3) y da más puntos al reventar (+400 vs +250) o al ser aplastado (+600 vs +500). Diferencia el riesgo/recompensa de enfrentarlo sin introducir un sistema de puntaje nuevo.
- **Sí:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel: "Peligro Fygar"`) para avisar la carga de fuego. Da uso real al slot del contrato compartido, igual que "Modo asustado" en `gloton-02-power-pellets.md` y "Triple disparo" en Asteroids.
- **No:** permitir conectar la manguera a un Fygar mientras carga o escupe fuego. Sería una forma "gratis" de neutralizarlo antes de que ataque; obliga a esperar a que vuelva a `idle` o a esquivar el fuego.
- **No:** introducir un tercer tipo de enemigo en este spec. Fygar es el único agregado; cualquier otro monstruo del original queda para un spec futuro si se pide.

## Riesgos

| Riesgo                                                                                                                                                                         | Mitigación                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detectar la alineación fila/columna con una "cadena continua de celdas cavadas" en cada frame para cada Fygar puede ser costoso si hay muchos dragones a la vez.               | La grilla es de solo 16×12 celdas y `FIRE_RANGE` limita la búsqueda a 4 celdas como máximo en una sola dirección; el costo por Fygar y por frame es marginal a esta escala.                                      |
| Un Fygar podría quedar "cargando" indefinidamente si el excavador sale de la alineación justo antes de completar `FIRE_CHARGE_MS`, dejando el HUD con un aviso desactualizado. | Salir de la alineación (o que se corte la cadena de túnel) cancela la carga de inmediato y vuelve a `idle`; el stat extra se recalcula cada frame contra el conjunto de Fygar realmente en `charging`.           |
| Mezclar Pooka y Fygar en el mismo arreglo `enemies` con campos específicos de Fygar (`phase`, `fireDir`) podría inducir a leer esos campos por error para un Pooka.            | Los campos específicos de Fygar solo se leen/escriben cuando `kind === "fygar"`; los Pooka los ignoran por completo, siguiendo el mismo patrón "campos solo relevantes si..." documentado en el modelo de datos. |

## Qué **no** está en este spec

- Un tercer tipo de enemigo o cualquier otro monstruo del Dig Dug original.
- Fygar volando o atravesando tierra sólida.
- Daño parcial por fuego (siempre resta una vida completa).
- Sonido/música.
- Controles táctiles/móviles, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
