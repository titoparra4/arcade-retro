# SPEC 12 — Rendimiento de Ranaria (Frogger)

> **Estado:** Implementado
> **Depende de:** SPEC — Frogger: integración core (`specs/game-jam/frogger/01-frogger-core.md`), SPEC 01 (HUD y layout del player `/games/[id]/jugar`)
> **Fecha:** 2026-07-26
> **Objetivo:** Llevar `ranaria` a 60 fps en desktop y ≥50 fps en iPhone con el skin `neon`, tocando únicamente `app/components/games/ranaria-game.tsx`, mediante glow pre-renderizado, fondo estático cacheado y un reloj de ronda que deja de disparar 10 re-renders por segundo.

## Por qué existe este spec

Frogger se nota con tirones en desktop y en iPhone. Una lectura del código señala tres costes que `ranaria` paga y los otros cuatro juegos no, o pagan mucho menos:

1. **10 re-renders de React por segundo.** El reloj de ronda se emite por `onExtraStatChange` redondeado a 1 decimal (`ranaria-game.tsx:1064`), así que baja de 15.0 a 0.0 provocando ~150 `setExtraStat` por ronda. Cada uno re-renderiza `GamePlayer` entero: HUD, CRT, `TouchControls` y modal. Ningún otro juego emite un stat continuo — `rocas` solo lo hace durante el power-up.
2. **`shadowBlur` ~33 veces por frame.** En `neon` y `retro`, `withGlow` hace `save()` + `shadowBlur` + `restore()` por coche, camión, tronco, **tortuga individual** (`drawTurtles` itera por celda) y la rana. `shadowBlur` es de las operaciones más caras de canvas 2D y Frogger tiene muchas más entidades simultáneas que cualquier otro juego del catálogo.
3. **Redibujo completo del fondo estático cada frame.** Río, asfalto, franjas seguras, ondas de corriente y 5 filas × 16 rayas viales discontinuas (`drawZones`), que nunca cambian entre frames.

Existe además un coste compartido por los cinco juegos —el `gridscroll` infinito de `.av-bg::before`, las capas a pantalla completa con `mix-blend-mode` y `.av-noise`— que **queda fuera de este spec** a propósito: no es lo que hace a Frogger peor que el resto, y mezclarlo aquí impediría saber qué arreglo produjo qué mejora.

## Alcance

**Dentro:**

- **Un solo archivo.** Todo el cambio vive en `app/components/games/ranaria-game.tsx`. Ningún otro archivo del repo se modifica.
- **Contador de FPS de desarrollo.** Activable con `?fps=1` en la URL de `/games/ranaria/jugar`, leído una vez al montar desde `window.location.search`. Se dibuja **dentro del canvas** (esquina inferior izquierda): FPS instantáneo, mediana y mínimo de los últimos 120 frames. Sin el query param no se dibuja nada y no hay coste.
- **Glow pre-renderizado.** Se elimina `shadowBlur` del bucle de dibujo. Cada entidad se rasteriza una vez, con su glow, en un canvas offscreen cacheado; el frame solo hace `drawImage`. Se cachean: coche (4 variantes de color), camión (por ancho en columnas), tronco (por ancho), tortuga visible, tortuga sumergida y la rana (rotada en el frame vía `ctx.rotate`).
- **Fondo estático cacheado.** `drawZones` (río, asfalto, franjas seguras, ondas de corriente, rayas viales discontinuas) pasa a pintarse una vez en un canvas offscreen y se estampa con un único `drawImage` por frame.
- **Invalidación de cachés por skin.** El caché guarda con qué `SkinId` se generó; al cambiar de skin se regenera entero en el frame siguiente.
- **Reloj de ronda a segundos enteros.** `onExtraStatChange` pasa de emitir 1 decimal a emitir `Math.ceil(timeLeft)`: de ~10 llamadas por segundo a 1. El HUD del player mostrará `15.0s → 14.0s → 13.0s`.
- **Sin dibujo en pausa.** Con `paused` activo el bucle no llama a `draw()`; el canvas conserva el último frame y el overlay "EN PAUSA" del player va encima. El primer frame tras reanudar vuelve a dibujar.
- **Contexto opaco.** `getContext("2d", { alpha: false })` — el juego ya pinta el 100 % del canvas cada frame, así que no necesita transparencia.
- **Medición antes y después.** Se anotan en este spec los FPS medidos en desktop y en iPhone, con skin `neon` y nivel ≥3, antes de tocar nada y al terminar.

**Fuera de alcance (para specs futuros):**

- Cualquier cambio en `game-player.tsx`: memoizar el HUD, aislar el stat extra en su propio componente o cambiar `{extraStat.toFixed(1)}s`.
- Cualquier cambio en `app/globals.css`: el fondo animado `gridscroll` de `.av-bg::before`, las capas a pantalla completa con `mix-blend-mode` (scanlines, `.crt-screen::after`) y `.av-noise`. Son coste compartido por los 5 juegos y van en su propio spec.
- Los otros 4 juegos (`rocas`, `caida`, `bloque-buster`, `serpentina`), que repiten los patrones de `shadowBlur` por entidad y redibujo del fondo estático.
- `registry.ts`, `touch-controls.tsx` y el mando táctil.
- `prefers-reduced-motion` a nivel de app.
- Rediseñar paletas o skins — dominio del agente `skin-designer`. Este spec debe dejar los tres skins con un aspecto equivalente al actual.
- Cualquier cambio de jugabilidad: velocidades, tiempos de ronda, puntuación, colisiones, ciclo de las tortugas.
- Escalado por `devicePixelRatio` / nitidez del canvas.
- WebGL, `OffscreenCanvas` en worker o cualquier cambio de tecnología de render.
- Degradación automática de efectos según FPS medidos.
- Supabase, modelo de datos y guardado de puntuaciones.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

Este spec **no toca el modelo de dominio**: `GameData`, `Lane`, `Entity`, `Frog` y `Palette` se quedan exactamente como están, igual que Supabase y los tipos de `registry.ts`. Lo único nuevo son dos estructuras de presentación, privadas de `ranaria-game.tsx`.

### Caché de rasterizado

```ts
// Cada entidad se rasteriza una vez con su glow y luego se estampa con
// drawImage. La caché se invalida entera cuando cambia el skin.
interface RenderCache {
  skin: SkinId; // skin con el que se generó; si no coincide, se reconstruye
  bg: HTMLCanvasElement; // fondo estático completo, 640 × 560
  sprites: Map<SpriteKey, HTMLCanvasElement>;
}

// Claves: el tipo más lo que hace variar el bitmap.
type SpriteKey =
  | `car:${number}` // car:0 … car:3 (variante de color)
  | `truck:${number}` // truck:2, truck:3 (ancho en columnas)
  | `log:${number}` // log:2, log:3, log:4 (ancho en columnas)
  | "turtle" // tortuga visible, 1 celda
  | "turtle-sub" // tortuga sumergida, 1 celda
  | "frog" // rana posada (patas recogidas)
  | "frog-jump" // rana en salto (patas extendidas)
  | "goal" // boca destino vacía      ┐ añadidos en el paso 7:
  | "goal-filled"; // boca ya ocupada ┘ ver Decisiones
```

Convenciones de los sprites:

- **Padding para el glow.** El bloom se sale de la caja de la entidad, así que cada sprite se dibuja con `SPRITE_PAD = 12` px de margen por lado (el `glow` máximo de las paletas es 10) y se estampa en `x - SPRITE_PAD`, `y - SPRITE_PAD`.
- **Origen local.** Dentro del sprite, la entidad se dibuja en `(SPRITE_PAD, SPRITE_PAD)`; las funciones `drawCar`/`drawTruck`/`drawLog`/`drawTurtles` actuales se reutilizan pasándoles ese origen, sin cambiar su geometría.
- **La rana se rota en el frame**, no en el sprite: el sprite se genera mirando hacia arriba y el bucle sigue aplicando `ctx.rotate(FACING_ANGLE[facing])` y la escala del `hop`. Cuatro orientaciones × dos poses no justifican 8 entradas.
- **13 sprites en total** (4 coches + 2 camiones + 3 troncos + 2 tortugas + 2 ranas), regenerados solo al montar y al cambiar de skin.

### Medidor de FPS

```ts
// Solo se instancia si la URL trae ?fps=1. Buffer circular de 120 frames.
interface FpsMeter {
  durations: number[]; // ms del frame, longitud fija 120
  index: number;
  count: number; // frames acumulados, tope 120
}
```

Se dibuja dentro del canvas, en la esquina inferior izquierda, con el formato `60 fps · med 59 · mín 48`. La mediana y el mínimo se calculan sobre la ventana de 120 frames (≈2 s).

### Lo que cambia de forma

- `reportedRef.current.time` pasa de guardar décimas a guardar **segundos enteros**; el valor emitido es `Math.ceil(data.timeLeft)`.
- `data.timeLeft` **no cambia**: sigue siendo un `number` con precisión completa, y la barra de tiempo del canvas lo sigue leyendo tal cual.

## Plan de implementación

1. **Medidor de FPS y medición base.** Añadir `FpsMeter` a `ranaria-game.tsx`: buffer circular de 120 frames alimentado con el `dt` del bucle, lectura de `?fps=1` desde `window.location.search` una sola vez al montar, y dibujo del texto `60 fps · med 59 · mín 48` en la esquina inferior izquierda del canvas. Sin el query param no se instancia nada. **Antes de optimizar nada**, medir y anotar en este spec: desktop y iPhone, skin `neon`, nivel ≥3, mediana sobre una ronda completa. Para el iPhone hay que usar build de producción (`npm run build && npm run start`) — el dev server por LAN no hidrata. Prueba: con `?fps=1` aparece el contador; sin él, el juego se ve exactamente igual que hoy.

2. **Reloj de ronda a segundos enteros.** En `reportChanges()`, sustituir el redondeo a 1 decimal por `Math.ceil(data.timeLeft)`. Prueba: el HUD superior baja `15.0s → 14.0s → …` una vez por segundo, la barra de tiempo del canvas sigue bajando suave, y el contador de React DevTools pasa de ~10 renders/s a 1.

3. **Contexto opaco y sin dibujo en pausa.** Cambiar `canvas.getContext("2d")` por `getContext("2d", { alpha: false })` y envolver la llamada a `draw()` para que no se ejecute mientras `pausedRef.current` sea `true`. Prueba: el juego se ve idéntico; al pausar, el canvas se congela con el último frame bajo el overlay "EN PAUSA" y al reanudar vuelve a animarse sin salto.

4. **Fondo estático cacheado.** Crear el `RenderCache` en un `useRef` y la función que pinta `drawZones` completo en un canvas offscreen de 640 × 560. En `draw()`, reemplazar la llamada a `drawZones` por un `ctx.drawImage(cache.bg, 0, 0)`, reconstruyendo la caché cuando `cache.skin !== skinRef.current`. Prueba: los tres skins se ven igual que antes (comparar capturas), y cambiar de skin en caliente repinta el fondo correctamente en el frame siguiente.

5. **Sprites de carretera.** Añadir el generador de sprites (canvas de `w + 2·SPRITE_PAD` × `CELL + 2·SPRITE_PAD`, entidad dibujada en el origen `(SPRITE_PAD, SPRITE_PAD)`) y generar `car:0`…`car:3`, `truck:2` y `truck:3` reutilizando `drawCar` y `drawTruck` tal cual — el `shadowBlur` de `withGlow` queda horneado en el bitmap. En `drawEntities`, los casos `car` y `truck` pasan a un `drawImage` desplazado `-SPRITE_PAD`. Prueba: los 5 carriles de carretera se ven idénticos en los tres skins y el glow no queda recortado en los bordes del sprite.

6. **Sprites de río.** Generar `log:2`, `log:3`, `log:4`, `turtle` y `turtle-sub` con `drawLog` y `drawTurtles`. La tortuga se cachea **por celda**, así que un grupo de ancho 3 hace 3 `drawImage`. En `drawEntities`, los casos `log` y `turtle` pasan a `drawImage`. Prueba: troncos y tortugas se ven igual, la tortuga sumergida sigue leyéndose como un aro sin relleno, y el ciclo de inmersión alterna sin parpadeos.

7. **Sprite de la rana.** Generar `frog` (patas recogidas) y `frog-jump` (patas extendidas) mirando hacia arriba. En `drawFrog`, mantener `translate` + `rotate(FACING_ANGLE)` + `scale(hop)` y sustituir las primitivas por un `drawImage` centrado del sprite que toque. Prueba: la rana gira con la dirección, crece a mitad del salto y las patas se extienden solo mientras salta.

8. **Medición final y comparación visual.** Volver a medir con `?fps=1` en desktop e iPhone (skin `neon`, nivel ≥3) y anotar los números en este spec junto a los de base. Capturar los tres skins antes/después con Playwright en `.playwright-screenshots/` y comparar lado a lado que ninguna entidad cambió de aspecto. Prueba: los objetivos de 60 fps desktop y ≥50 fps iPhone se cumplen y las capturas no muestran diferencias apreciables.

9. **Cierre.** `npm run build` sin errores ni warnings de TypeScript. Verificar los criterios de aceptación uno por uno, comprobar que `git diff` solo toca `app/components/games/ranaria-game.tsx` (más este spec), y pasar el estado a "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `git diff` de la rama solo toca `app/components/games/ranaria-game.tsx` y este spec.
- [ ] Con `?fps=1`, el canvas muestra el contador `N fps · med N · mín N` en la esquina inferior izquierda.
- [ ] Sin `?fps=1`, el canvas no dibuja ningún contador.
- [ ] En desktop, skin `neon`, nivel ≥3: la mediana de FPS sobre una ronda completa es 60.
- [ ] En el iPhone de referencia (build de producción), skin `neon`, nivel ≥3: la mediana de FPS sobre una ronda completa es ≥50.
- [ ] Los FPS medidos después son estrictamente mejores que los de base anotados en el paso 1, en los dos dispositivos.
- [ ] `ctx.shadowBlur` no se ejecuta dentro del bucle de frame: solo aparece en la generación del fondo y de los sprites.
- [ ] En una ronda en la que no se suman puntos, `GamePlayer` re-renderiza como máximo 1 vez por segundo (React DevTools Profiler).
- [ ] El HUD superior muestra el tiempo como `15.0s`, `14.0s`, … cambiando una vez por segundo, y llega a `0.0s` en el mismo instante en que la rana muere por tiempo.
- [ ] La barra de tiempo dentro del canvas sigue bajando de forma continua, sin escalones de un segundo.
- [ ] Comparando capturas antes/después en los tres skins (`clasico`, `neon`, `retro`), ninguna entidad cambia de color, tamaño ni posición.
- [ ] El glow de coches, camiones, troncos, tortugas y rana no aparece recortado en ningún borde.
- [ ] Cambiar de skin durante la partida repinta fondo y entidades con la paleta nueva, sin restos de la anterior.
- [ ] Al pausar, el canvas se congela con el último frame; al reanudar, la partida continúa sin salto de posición.
- [ ] La jugabilidad no cambia: la rana muere atropellada, flota sobre troncos y tortugas visibles, cae al agua sobre tortuga sumergida, muere arrastrada fuera del río y muere al agotarse el tiempo.
- [ ] Ocupar una boca con el mismo tiempo restante que antes del spec otorga la misma puntuación.
- [ ] En móvil, el mando táctil sigue moviendo la rana en las 4 direcciones y el flujo FIN → modal → "GUARDAR PUNTUACIÓN" sigue funcionando.

## Mediciones

Tabla a rellenar durante la implementación (paso 1 y paso 8). Mediana de FPS sobre una ronda completa, skin `neon`, nivel ≥3, tres tomas.

| Dispositivo                    | Antes (paso 1)        | Después (paso 8)      |
| ------------------------------ | --------------------- | --------------------- |
| Desktop (Chrome de Playwright) | med **120** · mín 108 | med **120** · mín 106 |
| Desktop (Chrome de Tito)       | pendiente             | pendiente             |
| iPhone (build producción)      | pendiente             | pendiente             |

Condiciones de las tomas: build de producción (`next start`), skin `neon`, nivel 1,
ventana de 120 frames, una sola pestaña.

**Aviso sobre la toma automatizada.** El Chrome que conduce Playwright corre con GL por
software y con vsync a 120 Hz: la mediana de 120 fps es el techo del refresco, no el
techo del juego. Ya antes del spec ese entorno no perdía ni un frame, así que la fila de
Playwright **no puede validar** ni "la mediana en desktop es 60" (se cumplía sola) ni
"los FPS después son estrictamente mejores" —contra un tope de vsync no hay margen que
ganar— ni reproduce los tirones que motivaron el spec. Las dos filas pendientes las tiene
que tomar Tito en su navegador real y en el iPhone físico.

### Comandos de canvas por frame (A/B en la misma máquina)

Como los FPS quedan topados por el vsync, la mejora se midió contando las operaciones de
canvas por frame: se instrumentó `CanvasRenderingContext2D.prototype` desde la página y se
promedió sobre ~480 frames, con el build de producción **antes** (`git stash`) y **después**,
skin `neon`, sin `?fps=1`.

| Operación por frame | Antes    | Después |
| ------------------- | -------- | ------- |
| `shadowBlur` (> 0)  | 43.3     | **0**   |
| `drawImage`         | 0        | 50      |
| `fillRect`          | 131      | 3       |
| `strokeRect`        | 5        | 0       |
| `fill`              | 41.4     | 6       |
| `stroke`            | 98.8     | 0       |
| **Total**           | **~276** | **59**  |

Los 50 `drawImage` cuadran exactamente con lo diseñado: 1 fondo + 5 bocas + 43 entidades
(las tortugas se estampan por celda) + 1 rana. Los 3 `fillRect` y 6 `fill` restantes son
el HUD interno (franja, barra de tiempo y las vidas), que el spec no cachea.

**Por qué no se midió el tiempo de frame.** Se instrumentó también `requestAnimationFrame`
para cronometrar `update + draw`: dio 0.18 ms de media antes y 0.163 ms después, es decir
nada. La razón es que Canvas2D difiere el trabajo: el callback solo encola comandos y la
rasterización del `shadowBlur` ocurre fuera del hilo principal. Por eso el coste no aparece
como JS lento sino como frames perdidos en GPUs flojas —el iPhone—, y por eso la cuenta de
comandos es aquí mejor instrumento que el cronómetro.

## Decisiones

- **Sí:** alcance de un solo archivo (`ranaria-game.tsx`). Aísla el riesgo, deja un `git diff` revisable de un vistazo, y permite medir después las causas compartidas con Frogger ya sano como referencia.
- **No:** memoizar el HUD o aislar el stat extra en `game-player.tsx`. Es el arreglo estructuralmente correcto del re-render, pero cambiaría el player de los 5 juegos desde un spec de Frogger. Va en su propio spec.
- **No:** tocar `app/globals.css` (el `gridscroll` infinito de `.av-bg::before`, las capas con `mix-blend-mode`, `.av-noise`). Es coste compartido por todos los juegos, no es lo que hace a Frogger peor que el resto, y mezclarlo aquí impediría saber qué arreglo produjo qué mejora.
- **Sí:** medir antes de optimizar. Sin número base, "60 fps" no es un criterio verificable sino una aspiración.
- **Sí:** el contador de FPS se queda en el repo en vez de una medición desechable. Se puede repetir en el iPhone físico —donde no hay DevTools cómodo— y después de cualquier cambio futuro.
- **Sí:** contador dibujado dentro del canvas. Un `<div>` superpuesto actualizándose 60 veces por segundo sería exactamente el problema que este spec ataca.
- **No:** `useSearchParams` para leer `?fps=1`. En Next 16 obliga a envolver en Suspense y provoca re-render; `window.location.search` leído una vez al montar basta para una herramienta de desarrollo.
- **Sí:** glow pre-renderizado en sprites cacheados. `shadowBlur` es la operación más cara del bucle y hoy se paga ~33 veces por frame; horneado en el bitmap se paga 13 veces por partida.
- **No:** bajar o quitar `pal.glow`. Más simple y más rápido de implementar, pero `neon` y `retro` pierden su identidad y pisa el trabajo del agente `skin-designer`.
- **No:** degradación automática de efectos según los FPS medidos. Introduce estado nuevo, hace el render no determinista y ningún criterio booleano puede verificarlo.
- **Sí:** reutilizar `drawCar`, `drawTruck`, `drawLog` y `drawTurtles` sin reescribirlas, cambiando solo su destino. El aspecto queda idéntico por construcción y cada paso se revisa comparando capturas.
- **Sí:** `SPRITE_PAD = 12` constante, no calculado por skin. El `glow` máximo de las tres paletas es 10; un padding fijo evita recalcular el tamaño del bitmap al cambiar de skin y cuesta unos pocos KB de memoria.
- **Sí:** la rana se cachea en 2 poses y se rota en el frame. Cachear 4 orientaciones × 2 poses son 8 bitmaps para ahorrar un `rotate()` que el código ya hacía.
- **Sí:** cachear también la fila de bocas destino (decidido durante la implementación, paso 7). El plan original no la incluía, pero `drawGoals` dibujaba el borde de las 5 bocas con `shadowBlur` en cada frame, y eso dejaba en falso el criterio "`shadowBlur` no se ejecuta dentro del bucle de frame". Son 2 bitmaps más (`goal` y `goal-filled`, boca vacía y boca ocupada) estampados 5 veces: **15 sprites en total**, no 13. La alternativa —relajar el criterio— habría dejado el único `shadowBlur` por frame que sí era fácil de quitar.
- **Sí:** la tortuga se cachea por celda, no por grupo. Los grupos son de ancho 2 y 3 pero la celda es la misma: 1 bitmap en vez de 2.
- **Sí:** el reloj se emite con `Math.ceil` a segundos enteros. Reduce los re-renders 10×. `ceil` y no `round` porque con `round` el HUD marcaría `0.0s` medio segundo antes de que la rana muera por tiempo, y eso se lee como un bug.
- **Sí:** se acepta que el HUD superior muestre siempre `.0`. La cuenta atrás continua ya está en la barra de tiempo dentro del canvas; el decimal del HUD era información duplicada y era la cara.
- **Sí:** no dibujar mientras `paused` está activo. Ahorra 60 frames por segundo de trabajo con el juego congelado, y el overlay "EN PAUSA" del player ya cubre la pantalla.
- **Sí:** `getContext("2d", { alpha: false })`. El juego pinta el 100 % del canvas cada frame, así que la capa alfa solo añade trabajo de composición.
- **No:** escalado por `devicePixelRatio`. Mejoraría la nitidez en pantallas retina pero multiplicaría por 4 los píxeles a pintar — va justo en contra del objetivo de este spec.
- **No:** `OffscreenCanvas` en un worker o migrar a WebGL. Es reescribir el render entero de un juego que debería ir sobrado a 60 fps con canvas 2D bien usado.
- **Sí:** el iPhone se mide con build de producción (`npm run build && npm run start`). El dev server servido por LAN no hidrata en iOS, así que medir ahí daría un número que no significa nada.

## Riesgos

| Riesgo                                                                                                                                                    | Mitigación                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La medición base desmiente el diagnóstico: el cuello de botella no es el `shadowBlur` ni el re-render, sino algo no identificado en la lectura de código. | El paso 1 es independiente y no optimiza nada. Si los números no señalan lo previsto, se para ahí, se perfila con DevTools y se replantea el spec antes de tocar los pasos 4–7.                                       |
| El glow horneado en el sprite se compone distinto al glow dibujado en vivo cuando dos entidades se solapan.                                               | En Frogger las entidades de un mismo carril nunca se solapan —el reparto equiespaciado garantiza un hueco de ≥1 columna— y los carriles ocupan filas distintas. El paso 8 lo verifica con capturas de los tres skins. |
| Un sprite con padding que entra por el borde izquierdo dibuja en `x` negativo.                                                                            | `drawImage` recorta por sí solo, sin error ni coste. El glow que se salía del canvas ya se perdía igual en el render actual.                                                                                          |
| La caché de sprites no se invalida al cambiar de skin y queda un fondo viejo con entidades nuevas, o al revés.                                            | La caché guarda el `SkinId` con el que se generó y se reemplaza **entera** —fondo y 13 sprites— en cuanto no coincide. Hay criterio de aceptación explícito para el cambio de skin en caliente.                       |
| La mediana de FPS de la primera ronda incluye el coste de generar los 13 sprites y ensucia la medición.                                                   | La generación ocurre al montar, antes de la primera ronda, y el buffer del medidor es de 120 frames (~2 s): cualquier pico inicial sale de la ventana enseguida. Además se mide en nivel ≥3, varias rondas después.   |
| Los FPS varían según la carga de la máquina y otras pestañas, y el número medido no es reproducible.                                                      | Medir con una sola pestaña abierta, tres veces, y anotar la mediana de las tres. En iPhone, con build de producción y la app en primer plano.                                                                         |
| Congelar el dibujo en pausa deja un canvas en blanco si el navegador descarta el backing store al cambiar de pestaña.                                     | Con canvas 2D el backing store persiste. Aun así, el primer frame tras reanudar redibuja todo, así que cualquier artefacto duraría un frame.                                                                          |

## Qué **no** está en este spec

- Cualquier cambio en `game-player.tsx`: memoizar el HUD, aislar el stat extra o cambiar `{extraStat.toFixed(1)}s`.
- Cualquier cambio en `app/globals.css`: el `gridscroll` infinito del fondo, las capas a pantalla completa con `mix-blend-mode` y `.av-noise`.
- Los otros 4 juegos (`rocas`, `caida`, `bloque-buster`, `serpentina`), que repiten los mismos patrones de `shadowBlur` por entidad y redibujo del fondo estático.
- `registry.ts`, `touch-controls.tsx` y el mando táctil.
- `prefers-reduced-motion` a nivel de aplicación.
- Rediseñar paletas o skins — dominio del agente `skin-designer`.
- Cambios de jugabilidad: velocidades, tiempos de ronda, puntuación, colisiones, ciclo de las tortugas.
- Escalado por `devicePixelRatio` y nitidez del canvas.
- WebGL, `OffscreenCanvas` en worker y degradación automática por FPS.
- Supabase, modelo de datos y guardado de puntuaciones.
- Tests.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
