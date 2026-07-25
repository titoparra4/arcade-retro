# SPEC 11 — Apariencia del gamepad MK-II

> **Estado:** Implementado
> **Depende de:** SPEC 01 (layout del player `/games/[id]/jugar`), SPEC 10 (mando táctil: `touch-controls.tsx`, tipos `TouchButton`, `.game-console` y su barra PAUSA + Skin)
> **Fecha:** 2026-07-24
> **Objetivo:** Rediseñar la apariencia del mando táctil para que sea idéntica al gamepad MK-II de `references/gamepad-assets/` —chasis con glow cian, cruceta con flechas SVG y hub pulsante, y botones circulares A/B— sin cambiar ningún comportamiento de entrada.

## Alcance

**Dentro:**

- **Chasis del mando.** `.game-console` (en `app/globals.css`, dentro de `@media (hover: none) and (pointer: coarse)`) adopta el look `.gp` del asset: degradado `#1c1c28 → #0c0c14`, borde cian, radio de 16px, doble borde interior, textura de puntos de 8px y sombra de glow cian. La barra inferior (PAUSA + selector de Skin) queda **dentro** del chasis, tal como está hoy.
- **Cruceta.** Las 4 teclas pasan de glifos de texto a **flechas SVG** (`<path>` triangular, `fill: currentColor`) con `drop-shadow` neón al pulsar, sobre teclas de 46px con sombra inferior sólida. Se añade el **hub central** con la gema cian en rombo (`clip-path`) y su animación `pulse-led` de 2s, desactivada bajo `prefers-reduced-motion: reduce`. Las direcciones que el juego no usa siguen atenuadas e inertes.
- **Botones de acción.** Círculos de 64px con degradado radial, brillo especular, borde de color, sombra inferior sólida y anillo punteado que aparece al pulsar. Dentro, la **letra** (`A`, `B`, …) en Press Start 2P con `text-shadow` neón; el caption actual (`FUEGO`, `EMPUJE`, `ROTAR`, `SOLTAR`) se mantiene debajo del círculo.
- **Asignación de letra y color.** Los botones del grupo `action` se renderizan en el orden del array y reciben letra de **derecha a izquierda**: el más a la derecha es `A`. Colores fijos por letra — `A` magenta, `B` cian, `C` verde, `D` amarillo.
- **Markup de `touch-controls.tsx`.** Cambian las clases y el contenido de los botones (SVG en la cruceta, hub, letra en las acciones). La lógica de entrada —`press`/`release`, `hold`/`tap`/`repeat`, temporizadores, `setPointerCapture`— **no se toca**.
- **Estados visuales.** `:active` de cada tecla/botón replica el del asset: hundido, glow, cambio de color. Se mantiene `touch-action: none`, `user-select: none` y `-webkit-tap-highlight-color: transparent`.

**Fuera de alcance (para specs futuros):**

- Cualquier cambio en `registry.ts`: ni los tipos `TouchButton`/`TouchButtonMode`, ni los 4 mapas `touchControls`, ni los `code`/`mode`/`group` de ningún botón.
- Cualquier cambio de comportamiento de entrada: modos, intervalos de auto-repetición, síntesis de `KeyboardEvent`.
- Eco de teclado en el mando (resaltar el botón al pulsar la tecla física), como hace el `<script>` del asset.
- Cambiar la regla de visibilidad: el mando sigue apareciendo solo bajo `@media (hover: none) and (pointer: coarse)`.
- Cambios en los componentes de juego, en el HUD superior, en el aviso de portrait o en el escalado del canvas.
- Que el mando cambie de paleta según la skin activa (`neon`/`retro`/`clasico`) — el mando es siempre neón.
- Vibración/haptics al pulsar.
- Cambios en Supabase, en el modelo de datos o en el guardado de puntuaciones.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

Este spec **no introduce estructuras de datos nuevas**: no toca Supabase, ni `GameComponentProps`/`GameComponentHandle`, ni los tipos `TouchButton`/`TouchButtonMode` de `registry.ts`. Lo único nuevo son tres constantes de presentación dentro de `app/components/games/touch-controls.tsx`, que reemplazan a las actuales.

```ts
// Reemplaza a DPAD_GLYPH: paths SVG de las flechas, en el viewBox 24×24 del asset.
const DPAD_ARROW_PATH: Record<string, string> = {
  ArrowUp: "M12 4 L20 16 L4 16 Z",
  ArrowRight: "M8 4 L20 12 L8 20 Z",
  ArrowDown: "M4 8 L20 8 L12 20 Z",
  ArrowLeft: "M16 4 L16 20 L4 12 Z",
};

// Reemplaza al ACTION_COLORS indexado por posición: ahora el color deriva de la letra.
const ACTION_LETTERS = ["A", "B", "C", "D"] as const;
const ACTION_COLORS: Record<string, string> = {
  A: "var(--magenta)",
  B: "var(--cyan)",
  C: "var(--green)",
  D: "var(--yellow)",
};
```

Regla de asignación de letra (derecha a izquierda, el último del array es `A`):

```ts
// actions = botones con group === "action", en el orden del array de touchControls.
const letter = ACTION_LETTERS[actions.length - 1 - idx];
// rocas:  [EMPUJE, FUEGO]  → B, A
// caida:  [ROTAR, SOLTAR]  → B, A
```

Convenciones:

- **Fallback con más de 4 acciones.** Si un juego futuro define más de 4 botones `action`, los que exceden la lista no reciben letra: muestran el glifo de su `label` (comportamiento actual) y el color cae en `var(--cyan)`. Ningún juego actual llega a ese caso.
- **El caption sigue derivándose del `label`.** Se mantiene el parseo existente: `"▲ EMPUJE"` → glifo (descartado ahora, la letra ocupa su lugar) + caption `EMPUJE`. Un `label` sin espacio no produce caption.
- La geometría de la cruceta (`DPAD_DIRS`, `DPAD_POS`) no cambia; el hub ocupa la celda central (columna 2, fila 2) que hoy está vacía.
- Los colores salen de las variables ya definidas en `app/globals.css` (`--cyan`, `--magenta`, `--green`, `--yellow`) — el asset usa los mismos valores (`#00f5ff`, `#ff006e`).

## Plan de implementación

1. **Chasis del mando.** En `app/globals.css` (dentro de `@media (hover: none) and (pointer: coarse)`) reestilizar `.game-console` con el look `.gp` del asset: degradado `#1c1c28 → #0c0c14`, borde `1px solid var(--line)`, radio 16px, sombra de glow cian, más los pseudo-elementos `::before` (doble borde interior cian) y `::after` (textura de puntos de 8px, `pointer-events: none`). Prueba: en viewport móvil el mando aparece sobre el chasis nuevo con la barra PAUSA + Skin dentro; en desktop nada cambia.

2. **Teclas de la cruceta.** Ajustar `.dpad` y `.dpad-key` a la geometría del asset: rejilla de 46px, radio 8px, degradado `#1a1a25 → #0a0a12`, sombra inferior sólida de 4px, y estado `:active` hundido con glow cian e `inset`. Mantener `.dpad-key--off` atenuada e inerte. Prueba: las 4 direcciones responden visualmente al pulsar y la cruz no se descuadra a 360px de ancho.

3. **Flechas SVG.** En `touch-controls.tsx` reemplazar `DPAD_GLYPH` por `DPAD_ARROW_PATH` y renderizar un `<svg viewBox="0 0 24 24" class="dpad-arrow">` con `fill: currentColor` dentro de cada tecla (también en las `--off`). En CSS, `.dpad-arrow` de 22px y `drop-shadow` neón doble en `:active`. Prueba: las flechas se ven nítidas y brillan al pulsar; el `aria-label` de cada botón sigue siendo el `label` del `TouchButton`.

4. **Hub central con gema.** Añadir el `<div className="dpad-hub" aria-hidden>` con `<span className="dpad-hub-gem" />` en la celda central de la rejilla. En CSS: fondo radial, borde cian tenue, `inset` oscuro, y la gema en rombo vía `clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)` con la animación `pulse-led` de 2s, anulada bajo `@media (prefers-reduced-motion: reduce)`. Prueba: la gema late en el centro de la cruz y se queda estática con movimiento reducido activado.

5. **Letra y color de los botones de acción.** En `touch-controls.tsx` sustituir el `ACTION_COLORS` indexado por posición por `ACTION_LETTERS` + `ACTION_COLORS` por letra, calcular la letra de derecha a izquierda y renderizarla como `<span className="action-cap-letter">` dentro del botón (en lugar del glifo), conservando el caption debajo. Prueba: `rocas` muestra `B EMPUJE` / `A FUEGO` y `caida` `B ROTAR` / `A SOLTAR`, con A magenta y B cian.

6. **Círculo de acción estilo asset.** En CSS llevar `.action-cap` a 64px con el degradado radial doble (brillo especular arriba-izquierda + relleno de color), borde de 2px en `currentColor`, sombra inferior sólida de 6px más glow, y la letra en Press Start 2P con `text-shadow` neón. Añadir `.action-cap-ring` (anillo punteado, `inset: -8px`) que aparece y escala en `:active`. Prueba: el botón se hunde y el anillo aparece al mantenerlo presionado; el color de la letra contrasta sobre el chasis oscuro.

7. **Build + playtest.** `npm run build` sin errores ni warnings de TypeScript. Playtest con Playwright a 390×844 y 360×800 en los 4 juegos (`rocas`, `caida`, `bloque-buster`, `serpentina`): el mando se ve como el asset, ningún botón deja una tecla pegada, la auto-repetición de `caida` sigue funcionando, el mando no desborda el ancho y PAUSA/FIN/SALIR y guardar puntuación siguen operativos. Capturas en `.playwright-screenshots/`. Verificar en desktop que ni el player ni el resto del sitio cambian.

8. **Cierre.** Comparar lado a lado con `references/gamepad-assets/gamepad-neon.png`, verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [x] `npm run build` termina sin errores ni warnings de TypeScript.
- [x] El chasis del mando muestra el degradado oscuro, el doble borde interior cian, la textura de puntos y el glow cian del asset.
- [x] La barra PAUSA + selector de Skin se renderiza dentro del chasis.
- [x] Las 4 direcciones de la cruceta muestran flechas SVG (no caracteres de texto).
- [x] Al mantener presionada una dirección, su flecha se ilumina en cian y la tecla se hunde.
- [x] El centro de la cruceta muestra el hub con la gema en rombo latiendo cada 2s.
- [x] Con `prefers-reduced-motion: reduce` activado, la gema se queda estática.
- [x] En `bloque-buster` las direcciones arriba y abajo siguen atenuadas e inertes (no responden al toque).
- [x] En `rocas` los botones de acción muestran `B` (cian) con caption `EMPUJE` y `A` (magenta) con caption `FUEGO`, en ese orden de izquierda a derecha.
- [x] En `caida` los botones muestran `B ROTAR` y `A SOLTAR`, en ese orden.
- [x] Al mantener presionado un botón de acción, el círculo se hunde y aparece el anillo punteado.
- [x] A 360×800 el mando completo cabe sin scroll horizontal ni desbordar el chasis.
- [x] En los 4 juegos ningún botón deja una tecla "pegada" al soltar o cancelar el toque.
- [x] La auto-repetición de `caida` (izq/der/bajar) sigue funcionando al mantener presionado.
- [x] En `serpentina` cada dirección sigue cambiando el rumbo una sola vez por toque.
- [x] `registry.ts` no tiene cambios (`git diff` vacío para ese archivo).
- [x] Los 4 componentes de juego no tienen cambios.
- [x] En desktop el mando sigue sin mostrarse y el player se ve idéntico a antes de este spec.
- [ ] PAUSA/FIN/SALIR, el modal de fin de partida y "GUARDAR PUNTUACIÓN" siguen funcionando en móvil.

## Decisiones

- **Sí:** el look `.gp` reemplaza el estilo de `.game-console` en vez de anidar un panel nuevo. Anidar dejaba dos cajas concéntricas con bordes y sombras compitiendo; reemplazar da un solo mando coherente y no añade un nivel de DOM.
- **Sí:** letra `A`/`B` dentro del círculo con el caption debajo. Es el look del asset sin perder la información de qué hace cada botón, que sí se pierde con la letra sola.
- **No:** letra `A`/`B` sin caption. Fiel al asset pero el jugador no tiene forma de saber qué botón dispara y cuál empuja.
- **No:** conservar el glifo (`●`, `▲`, `↻`, `⤓`) dentro del círculo. Adoptar la forma sin la letra deja el mando a medio camino entre los dos diseños.
- **Sí:** letra asignada de derecha a izquierda (el botón más a la derecha es `A`). Respeta la convención NES que usa el asset (B izquierda, A derecha) sin tener que reordenar los arrays de `touchControls` en `registry.ts`.
- **Sí:** color fijo por letra (A magenta, B cian, C verde, D amarillo) en vez de por índice de array. Con la asignación derecha-a-izquierda, el índice ya no es una base estable; atar el color a la letra hace que `A` sea siempre magenta en todos los juegos.
- **Sí:** flechas SVG en vez de los caracteres `▲◄►▼`. Los glifos de texto se renderizan distinto en cada plataforma y no aceptan `drop-shadow` limpio; el SVG con `currentColor` da el glow del asset y se ve igual en iOS y Android.
- **Sí:** hub central con gema pulsante, respetando `prefers-reduced-motion`. Es el detalle que más identifica al asset y ocupa una celda de la rejilla que hoy está vacía; una animación infinita sin escape es un problema de accesibilidad conocido.
- **Sí:** tamaños del breakpoint móvil del asset (cruceta 144px, círculos 64px) en vez de los del breakpoint de escritorio (156px / 74px). El mando solo se ve en pantallas táctiles; a 360px de ancho los tamaños grandes no caben.
- **No:** eco de teclado (resaltar el botón al pulsar la tecla física), aunque el asset lo trae. El mando solo se muestra bajo `(hover: none) and (pointer: coarse)`, donde no hay teclado físico: sería código muerto.
- **No:** que el mando cambie de paleta según la skin activa. El mando es cromo de la consola, no del juego; atarlo a la skin multiplicaría por tres las variantes a mantener y va en su propio spec si alguna vez se quiere.
- **Alcance estrictamente visual.** No se toca `registry.ts` ni la lógica de entrada de `touch-controls.tsx`: el riesgo de romper el juego en móvil se concentra en el markup y el CSS, y el `git diff` de los archivos de comportamiento debe quedar vacío.

## Riesgos

| Riesgo                                                                                                                                                           | Mitigación                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El `<svg>` dentro del botón captura los eventos de puntero y el `pointerup` llega con otro `target`, dejando una tecla "pegada".                                 | `.dpad-arrow` y `.action-cap-letter` llevan `pointer-events: none`; además `setPointerCapture` ya se hace sobre `e.currentTarget` (el `<button>`), que no cambia. Se valida en el playtest del paso 7.  |
| El pseudo-elemento `::after` de la textura de puntos cubre el chasis y bloquea los toques de la cruceta y los botones.                                           | `::before` y `::after` del chasis llevan `pointer-events: none`, igual que en el asset original.                                                                                                        |
| Los tamaños nuevos (cruceta 144px + dos círculos de 64px) desbordan en pantallas angostas.                                                                       | El cálculo da 304px más padding del chasis, dentro de 360px. El paso 7 lo verifica a 360×800, el viewport más estrecho que se soporta.                                                                  |
| En iOS Safari el pseudo-selector `:active` no se aplica de forma fiable, y el feedback visual de pulsación desaparece.                                           | El feedback ya depende de `:active` en el diseño actual y funciona porque los botones tienen handlers de puntero. Si el playtest lo desmiente, se añade una clase `is-pressed` desde `press`/`release`. |
| La animación infinita de la gema repinta durante la partida y compite con el `requestAnimationFrame` del juego.                                                  | `pulse-led` solo anima `opacity` y `transform` (compositables en GPU, sin layout ni paint) sobre un elemento de 12px. Se anula bajo `prefers-reduced-motion`.                                           |
| Un juego futuro con un solo botón de acción recibiría la letra `A`, y con tres el primero sería `C` — puede leerse raro si el orden del array no es el esperado. | El caption debajo del círculo dice siempre qué hace el botón, así que la letra nunca es la única pista. Reordenar un array de `touchControls` es un cambio de una línea en `registry.ts`.               |

## Qué **no** está en este spec

- Cambios en `registry.ts`: tipos, mapas `touchControls`, códigos de tecla o modos.
- Cambios en la lógica de entrada de `touch-controls.tsx` (`hold`/`tap`/`repeat`, temporizadores, síntesis de `KeyboardEvent`).
- Eco de teclado en el mando.
- Mostrar el mando en desktop o cambiar su regla de visibilidad.
- Cambios en los componentes de juego, el HUD superior, el aviso de portrait o el escalado del canvas.
- Que el mando cambie de paleta según la skin activa.
- Vibración/haptics.
- Cambios en Supabase, en el modelo de datos o en el guardado de puntuaciones.
- Tests.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
