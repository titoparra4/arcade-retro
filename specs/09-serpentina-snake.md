# SPEC 09 — Juego real: Serpentina (Snake)

> **Estado:** Aprobado
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`/`scores` en Supabase, fila `serpentina` ya sembrada), SPEC 07 (convención sin sonido, estado mutable en `useRef`, loop con `dt` capado)
> **Fecha:** 2026-07-23
> **Objetivo:** Crear desde cero un componente cliente en canvas (`SerpentinaGame`) que implemente Snake clásico —movimiento en grilla 40×30, frutas dibujadas con sprites reales elegidas al azar entre 21 variedades, velocidad progresiva por nivel— e integrarlo en `/games/serpentina/jugar`, reemplazando la simulación decorativa ya sembrada en Supabase.

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/serpentina-game.tsx` que implementa Snake desde cero: movimiento en grilla 40×30 (celda 20px, canvas 800×600), serpiente inicial de 3 segmentos centrada moviéndose a la derecha, crecimiento de un segmento por fruta comida, +10 puntos por fruta, nivel sube cada 5 frutas comidas (`onLevelChange`), velocidad de paso `moveInterval = max(60, 150 - (nivel-1)*10)` ms.
- Fruta dibujada con sprites reales del atlas provisto (`references/source-assets/snake-assets/fruits.png` + `sprites.js`): en cada spawn se elige al azar una de las 21 variedades (mismo puntaje para todas), reposicionada en una celda libre (no ocupada por el cuerpo) al ser comida.
- Cuerpo de la serpiente dibujado como bloques sólidos de color (retro/neón), sin sprite propio.
- Colisión fatal (game over inmediato, 1 vida, sin respawn): chocar contra cualquier borde del tablero, o contra cualquier segmento del propio cuerpo.
- Controles por teclado vía `e.code` (flechas), con `preventDefault` para evitar scroll de página. Regla clásica anti-reversa: no se puede invertir de golpe hacia la dirección opuesta a la actual en el mismo paso de grilla (si se mueve a la derecha, presionar izquierda no tiene efecto hasta que cambie de eje).
- Loop `requestAnimationFrame` con `dt` capado a 50ms (convención de la casa) y acumulador de tiempo que dispara un paso de grilla cada `moveInterval`.
- `onLivesChange` fijo en `1` al iniciar/reiniciar y nunca vuelve a cambiar (mismo patrón que Tetris: 1 vida, sin concepto de vidas múltiples).
- El slot de stat extra (`onExtraStatChange`/`extraStatLabel`) no se usa.
- `forwardRef` + `useImperativeHandle` exponiendo `{ reset(), forceGameOver() }`: `reset()` reconstruye serpiente inicial (3 segmentos, centrada, dirección derecha), score 0, nivel 1, nueva fruta aleatoria; `forceGameOver()` fuerza el game over inmediato con el score acumulado.
- Assets: copiar `fruits.png` a `public/`; transformar las coordenadas de `sprites.js` (hoy un script que asigna `window.SPRITE_ATLAS`) en una constante TypeScript (`FRUIT_SPRITES` o similar) dentro del componente o un módulo hermano — no se carga como script global. Carga async de la imagen con gate antes de arrancar el loop (misma convención que Arkanoid con su spritesheet).
- Reusar el juego decorativo existente `serpentina` (ya sembrado en la tabla `games` por SPEC 06: título SERPENTINA, `cat` ARCADE, `cover` cover-snake, `color` green) — no se inserta una fila nueva en Supabase, solo se registra el componente en `GAME_REGISTRY` con la clave `"serpentina"`.

**Fuera de alcance (para specs futuros si llegan):**

- Puntaje variable por tipo de fruta (todas valen lo mismo en este spec).
- Sprite/animación propia para la cabeza o el cuerpo de la serpiente.
- Wrap-around en los bordes (se descartó explícitamente a favor de muerte clásica por pared).
- Vidas múltiples / respawn tras colisión (se descartó explícitamente a favor de 1 vida).
- Reportar la longitud de la serpiente como stat extra en el HUD (se descartó explícitamente).
- Controles táctiles/móviles.
- Sonido/música.
- Multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase (`serpentina` ya existe en `games`, sembrado por SPEC 06). Lo nuevo es el estado interno del componente y el módulo de sprites de frutas:

```ts
// app/components/games/serpentina-game.tsx
type Direction = "up" | "down" | "left" | "right";

interface Cell {
  col: number; // 0..39
  row: number; // 0..29
}

type FruitKind =
  | "banana"
  | "orange"
  | "grape"
  | "garlic"
  | "eggplant"
  | "strawberry"
  | "cherry"
  | "carrot"
  | "mushroom"
  | "broccoli"
  | "watermelon"
  | "pepper"
  | "kiwi"
  | "lemon"
  | "peach"
  | "peanut"
  | "apple"
  | "tomato"
  | "berries"
  | "grapes2"
  | "pineapple"
  | "melon";

interface Fruit {
  cell: Cell;
  kind: FruitKind;
}

interface GameData {
  snake: Cell[]; // snake[0] = cabeza
  direction: Direction;
  pendingDirection: Direction | null; // último input válido, aplicado en el siguiente paso de grilla
  fruit: Fruit;
  score: number;
  level: number;
  fruitsEaten: number; // acumulado, dispara subida de nivel cada 5
  moveInterval: number; // ms, recalculado al subir de nivel
  moveAccum: number; // ms acumulados desde el último paso de grilla
  state: "playing" | "gameover";
}

export type SerpentinaGameProps = GameComponentProps; // de ./registry, sin campos nuevos
export type SerpentinaGameHandle = GameComponentHandle; // { reset(), forceGameOver() }
```

```ts
// app/components/games/serpentina-sprites.ts — traducido de references/source-assets/snake-assets/sprites.js
export const FRUIT_SPRITE_SOURCE = "/fruits.png";

export const FRUIT_SPRITES: Record<
  FruitKind,
  { x: number; y: number; w: number; h: number }
> = {
  banana: { x: 34, y: 136, w: 110, h: 160 },
  orange: { x: 186, y: 136, w: 150, h: 160 },
  // ...resto de las 21 entradas, coordenadas idénticas a sprites.js
};
```

Convenciones:

- `COLS = 40`, `ROWS = 30`, `CELL = 20` (canvas 800×600).
- `moveInterval = Math.max(60, 150 - (level - 1) * 10)`; `level = Math.floor(fruitsEaten / 5) + 1`.
- +10 puntos por fruta comida.
- Estado mutable en un único `useRef<GameData>`, nunca en variables sueltas a nivel de módulo.

## Plan de implementación

1. **Metadata confirmada (sin cambios en Supabase).** Confirmar que la fila `serpentina` ya sembrada (`title`, `short`, `long`, `cat`, `cover`, `color`) sigue siendo correcta para el Snake real; no se ejecuta ningún `INSERT`/`UPDATE`. Prueba: `select * from games where id = 'serpentina'` devuelve la fila esperada sin cambios.
2. **Assets estáticos.** Copiar `references/source-assets/snake-assets/fruits.png` a `public/fruits.png`. Crear `app/components/games/serpentina-sprites.ts` traduciendo las 21 coordenadas de `sprites.js` (hoy `window.SPRITE_ATLAS.fruits`) a la constante TypeScript `FRUIT_SPRITES` definida en el modelo de datos. Prueba: `/fruits.png` es accesible en el servidor de dev; `serpentina-sprites.ts` compila sin errores de tipos.
3. **Puerto del juego a componente canvas.** Crear `app/components/games/serpentina-game.tsx`: grilla 40×30 (celda 20px, canvas 800×600), serpiente inicial de 3 segmentos centrada moviéndose a la derecha, spawn de fruta aleatoria entre las 21 variedades en celda libre, crecimiento al comer, +10 puntos por fruta, nivel cada 5 frutas con `moveInterval` recalculado, colisión fatal contra pared o contra el propio cuerpo, regla anti-reversa de dirección, carga async de `fruits.png` con gate antes de arrancar el loop. Loop `requestAnimationFrame` con `dt` capado a 50ms y acumulador de paso de grilla. `forwardRef` + `useImperativeHandle` exponiendo `reset()`/`forceGameOver()`. `onScoreChange`/`onLevelChange` disparados solo al cambiar; `onLivesChange(1)` una sola vez al iniciar/reiniciar; `onExtraStatChange` no se llama. Sin HUD ni overlays internos. Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página.
4. **Registro.** Agregar `"serpentina": { Component: SerpentinaGame }` a `GAME_REGISTRY` en `app/components/games/registry.ts` (sin `extraStatLabel`). Prueba: `/games/serpentina/jugar` carga el Snake real en canvas en vez de la simulación decorativa — `game-player.tsx` no necesita cambios.
5. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest manual en `/games/serpentina/jugar`: mover la serpiente con las 4 flechas, la regla anti-reversa impide invertir de golpe hacia el propio cuerpo, la fruta se dibuja con un sprite real y cambia de variedad al ser comida, cada fruta suma 10 puntos y crece un segmento, el nivel sube cada 5 frutas y la velocidad aumenta según la fórmula, chocar contra pared o contra el propio cuerpo termina la partida de inmediato (1 vida), PAUSA congela el loop, FIN cierra la partida con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real en `scores`, JUGAR DE NUEVO reinicia completo sin recargar la página. Confirmar que los demás juegos (`rocas`, `caida`, `bloque-buster` y los decorativos) siguen sin cambios.
6. **Cierre.** Verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/serpentina/jugar` carga sin errores en consola, con el Snake real en canvas en vez de la simulación decorativa.
- [ ] La serpiente se mueve con las 4 flechas; no es posible invertir de golpe hacia la dirección opuesta a la actual (p. ej. moviéndose a la derecha, presionar izquierda no tiene efecto hasta cambiar de eje).
- [ ] La fruta se dibuja con un sprite real del atlas (no un rectángulo de color) y, al ser comida, la siguiente fruta aparece con una variedad elegida al azar entre las 21 disponibles, en una celda libre.
- [ ] Comer una fruta suma exactamente 10 puntos y agrega un segmento al final de la serpiente.
- [ ] El nivel sube cada 5 frutas comidas y la velocidad de movimiento aumenta según `moveInterval = max(60, 150 - (nivel-1)*10)`.
- [ ] Chocar contra cualquier borde del tablero termina la partida de inmediato.
- [ ] Chocar contra cualquier segmento del propio cuerpo termina la partida de inmediato.
- [ ] El HUD exterior (Jugador/Puntuación/Vidas/Nivel) refleja en vivo el score y el nivel reales; "Vidas" muestra un único ♥ fijo desde el inicio hasta el game over.
- [ ] No se muestra ningún stat extra en el HUD (el slot de stat extra no se usa para este juego).
- [ ] El botón PAUSA congela el loop del juego por completo (la serpiente deja de moverse); REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada hasta ese momento y abre el modal de fin de partida.
- [ ] "GUARDAR PUNTUACIÓN" en el modal añade una fila real a `scores` en Supabase con `game_id = 'serpentina'`.
- [ ] "JUGAR DE NUEVO" reinicia el juego real desde cero (serpiente de 3 segmentos centrada, score 0, nivel 1, nueva fruta aleatoria) sin recargar la página.
- [ ] "SALIR" navega a `/games/serpentina` sin errores.
- [ ] Las flechas no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`rocas`, `caida`, `bloque-buster` y los decorativos) siguen sin cambios.
- [ ] La fila `serpentina` en la tabla `games` de Supabase no cambia (metadata ya sembrada por SPEC 06).

## Decisiones

- **Sí:** reusar el id/juego decorativo existente `serpentina` (ya sembrado en Supabase por SPEC 06 con título SERPENTINA, `cat` ARCADE, `cover` cover-snake, `color` green) en vez de crear un id `snake` nuevo. Mismo patrón que `caida` y `bloque-buster`; evita un `INSERT` innecesario.
- **Sí:** muerte clásica al chocar contra pared (sin wrap-around). Decisión explícita del usuario, más simple de implementar y fiel al Snake más conocido.
- **Sí:** canvas 800×600 sin deformar (grilla 40×30, celda 20px), a diferencia de Tetris que aceptó deformación. Decisión explícita del usuario, prioriza consistencia visual con Asteroids/Arkanoid sobre una grilla cuadrada clásica.
- **Sí:** 1 vida sin respawn, con `onLivesChange` fijo en 1 (mismo patrón que Tetris). Fiel al género — Snake tradicionalmente termina de una sola colisión fatal.
- **Sí:** velocidad progresiva por nivel (`moveInterval` decreciente cada 5 frutas), en vez de velocidad constante. Da uso real a `onLevelChange` del contrato compartido y mantiene coherencia con la progresión de dificultad de Tetris/Arkanoid.
- **Sí:** las 21 frutas del atlas se usan en rotación aleatoria con el mismo puntaje (+10 todas), en vez de una tabla de puntos variable por fruta. Simplicidad de scoring; la variedad es puramente visual.
- **Sí:** cuerpo de la serpiente dibujado como bloques sólidos de color, sin sprite propio. Los assets provistos solo incluyen frutas; generar o conseguir sprites de serpiente queda fuera de alcance.
- **No:** usar el slot de stat extra (`onExtraStatChange`/`extraStatLabel`) para reportar la longitud de la serpiente. El nivel ya refleja el progreso indirectamente, y agregar el stat no aporta información nueva relevante para este spec.
- **Sí:** transformar `sprites.js` (script que asigna `window.SPRITE_ATLAS`) en un módulo TypeScript (`serpentina-sprites.ts`) con una constante tipada, en vez de cargarlo como script global. Mantiene el proyecto 100% TypeScript/módulos ES, sin variables globales de `window`.
- **No:** tocar `game-player.tsx` — ya resuelve el componente a mostrar genéricamente vía `GAME_REGISTRY[game.id]`, sin condicionales por juego.

## Riesgos

| Riesgo                                                                                                                                                                         | Mitigación                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; podría duplicar el `requestAnimationFrame`, los listeners de teclado, o la carga de `fruits.png` | El `useEffect` que arranca el loop y añade los listeners registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente, igual que en `asteroids-game.tsx`/`caida-game.tsx`; se verifica manualmente en dev. |
| Buscar una celda libre para la nueva fruta puede degradarse si la serpiente casi llena el tablero (pocas celdas libres, muchos intentos aleatorios fallidos)                   | Con 40×30=1200 celdas y una serpiente que rara vez supera unas pocas decenas de segmentos en una partida jugable, el costo esperado de un sorteo aleatorio con reintento es despreciable; no requiere un algoritmo especial.    |
| El acumulador de tiempo (`moveAccum`) podría desincronizarse si el frame rate cae mucho (pestaña en segundo plano), generando saltos de varias celdas en un solo frame         | El `dt` capado a 50ms (convención de la casa) limita cuánto puede acumularse por frame; al recuperar foco, el loop retoma con pasos normales sin "teletransportar" la serpiente varias celdas de golpe.                         |

## Qué **no** está en este spec

- Puntaje variable por tipo de fruta.
- Sprite/animación propia para la cabeza o el cuerpo de la serpiente.
- Wrap-around en los bordes.
- Vidas múltiples / respawn tras colisión.
- Longitud de la serpiente como stat extra en el HUD.
- Controles táctiles/móviles.
- Sonido/música, multiplayer/versus.
- Cambios en el mecanismo de guardado de puntuaciones (Supabase `scores`).

Cada uno de estos, si llega a necesitarse, va en su propio spec.
