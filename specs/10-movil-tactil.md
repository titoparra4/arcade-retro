# SPEC 10 — Soporte de juego en móvil táctil

> **Estado:** Implementado
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, layout del player), SPEC 05 (contrato `GameComponentProps`/`GameComponentHandle`, `GAME_REGISTRY`), SPEC 06 (tabla `games`, filas de los 4 juegos reales), SPEC 07/08/09 (los juegos `caida`, `bloque-buster`, `serpentina` que reciben controles táctiles)
> **Fecha:** 2026-07-24
> **Objetivo:** Permitir jugar los 4 juegos reales en dispositivos táctiles añadiendo controles en pantalla por juego —que sintetizan eventos de teclado— más escalado del canvas y un aviso de rotación en portrait, sin modificar ningún componente de juego.

## Alcance

**Dentro:**

- **Capa compartida de controles táctiles** (`app/components/games/touch-controls.tsx`): componente cliente que renderiza botones on-screen tipo mando y, al tocarlos, despacha `KeyboardEvent` sintéticos (`keydown`/`keyup` con el `code` correspondiente) sobre `window`. Los 4 juegos ya escuchan `window` keydown/keyup, así que reciben el input sin cambio alguno.
- **Mapa de controles por juego en `registry.ts`**: se añade un campo opcional `touchControls` a `GameRegistryEntry` con la definición de los botones de cada juego (código de tecla, etiqueta/ícono, y modo `hold`/`tap`/`repeat`). Mapeos:
  - `rocas`: girar izq (`ArrowLeft`, hold) · girar der (`ArrowRight`, hold) · empuje (`ArrowUp`, hold) · disparo (`Space`, tap).
  - `caida`: izq (`ArrowLeft`, repeat) · der (`ArrowRight`, repeat) · rotar (`ArrowUp`, tap) · bajar (`ArrowDown`, repeat) · soltar (`Space`, tap).
  - `bloque-buster`: izq (`ArrowLeft`, hold) · der (`ArrowRight`, hold).
  - `serpentina`: D-pad de 4 direcciones (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`, tap).
- **Renderizado condicional en `game-player.tsx`**: monta `<TouchControls>` como overlay sobre el canvas solo cuando el juego está en `GAME_REGISTRY` y tiene `touchControls` definido. La visibilidad final la decide CSS (`@media (hover: none) and (pointer: coarse)`): en desktop nunca se ven y el teclado sigue igual.
- **Overlay de botones sobre el canvas**: semitransparentes en las esquinas inferiores — D-pad/mover abajo-izquierda, botones de acción abajo-derecha — estilo mando, con `touch-action: none` y `preventDefault` para no hacer scroll/zoom de la página al jugar.
- **Escalado del canvas 800×600 (4:3)** por CSS para caber en la pantalla del móvil manteniendo proporción (sin deformar), reutilizando/ajustando el contenedor `.crt` del player.
- **Detección de orientación + aviso en portrait**: en vertical se muestra un overlay "gira tu dispositivo" y el juego se **auto-pausa**; al volver a landscape se **reanuda donde quedó**.
- **HUD responsive**: el HUD del player (Jugador/Puntuación/Vidas/Nivel/stat extra, selector de Skin, botones PAUSA/FIN/SALIR) se compacta/reflow para caber en pantallas pequeñas sin romper el layout de desktop.
- **Estilos en `app/globals.css`** para los botones táctiles, el overlay de portrait, el escalado del canvas y el HUD compacto.

**Fuera de alcance (para specs futuros):**

- Hacer responsive el resto del sitio: `nav.tsx`, la biblioteca (`games-library.tsx`), el detalle `/games/[id]`, el salón (`hall-of-fame.tsx`), el home y `/about`.
- Cualquier cambio en los 4 componentes de juego (`asteroids-game.tsx`, `caida-game.tsx`, `bloque-buster-game.tsx`, `serpentina-game.tsx`).
- Controles táctiles para los juegos **decorativos** (los que no están en `GAME_REGISTRY`): siguen con su simulación automática, sin mando.
- Gestos (swipe/tap sobre el canvas) como mecanismo de control — se eligió botones on-screen.
- Toggle manual para mostrar/ocultar el mando — la visibilidad es 100% por capacidad táctil.
- Soporte de juego en **portrait** (jugar en vertical): se descartó a favor de pedir landscape.
- Vibración/haptics, bloqueo de orientación vía `screen.orientation.lock`, o modo pantalla completa (`requestFullscreen`).
- Cambios en Supabase, en el modelo de datos o en el guardado de puntuaciones.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce tablas ni columnas nuevas en Supabase, ni cambia el contrato `GameComponentProps`/`GameComponentHandle`. Lo nuevo son (a) la definición de controles táctiles que se agrega a `GAME_REGISTRY`, y (b) el estado de orientación que vive en `game-player.tsx`.

```ts
// app/components/games/registry.ts — tipos nuevos

// Cómo se traduce un botón táctil a evento(s) de teclado:
// - "hold":   keydown al tocar, keyup al soltar. Para juegos que sondean keys[code]
//             cada frame (rocas: giro/empuje; bloque-buster: pala).
// - "tap":    keydown + keyup inmediato, una sola acción por toque. Para juegos que
//             actúan en el evento keydown (serpentina: dirección; caida: rotar/soltar).
// - "repeat": como "tap" pero mientras el dedo siga presionando se re-emite keydown
//             a intervalo fijo (auto-repetición). Para caida: mover izq/der y bajar.
type TouchButtonMode = "hold" | "tap" | "repeat";

interface TouchButton {
  code: string; // e.code sintetizado, p. ej. "ArrowLeft", "Space"
  label: string; // ícono/etiqueta corta mostrada en el botón, p. ej. "◄", "▲", "FUEGO"
  mode: TouchButtonMode;
  group: "pad" | "action"; // "pad" = esquina inf. izq (mover); "action" = esquina inf. der
}

// Se añade este campo opcional a la interfaz existente GameRegistryEntry:
interface GameRegistryEntry {
  // ...campos existentes (Component, extraStatLabel?, supportsSkins?)...
  touchControls?: TouchButton[]; // si está definido, el player monta <TouchControls>
}
```

Mapas concretos por juego (dentro de `GAME_REGISTRY`):

```ts
rocas.touchControls = [
  { code: "ArrowLeft", label: "◄", mode: "hold", group: "pad" },
  { code: "ArrowRight", label: "►", mode: "hold", group: "pad" },
  { code: "ArrowUp", label: "▲ EMPUJE", mode: "hold", group: "action" },
  { code: "Space", label: "● FUEGO", mode: "tap", group: "action" },
];

caida.touchControls = [
  { code: "ArrowLeft", label: "◄", mode: "repeat", group: "pad" },
  { code: "ArrowRight", label: "►", mode: "repeat", group: "pad" },
  { code: "ArrowDown", label: "▼", mode: "repeat", group: "pad" },
  { code: "ArrowUp", label: "↻ ROTAR", mode: "tap", group: "action" },
  { code: "Space", label: "⤓ SOLTAR", mode: "tap", group: "action" },
];

"bloque-buster".touchControls = [
  { code: "ArrowLeft", label: "◄", mode: "hold", group: "pad" },
  { code: "ArrowRight", label: "►", mode: "hold", group: "pad" },
];

serpentina.touchControls = [
  { code: "ArrowUp", label: "▲", mode: "tap", group: "pad" },
  { code: "ArrowDown", label: "▼", mode: "tap", group: "pad" },
  { code: "ArrowLeft", label: "◄", mode: "tap", group: "pad" },
  { code: "ArrowRight", label: "►", mode: "tap", group: "pad" },
];
```

Estado de orientación en `game-player.tsx`:

```ts
// true cuando el ancho < alto (portrait). Se calcula con matchMedia("(orientation: portrait)")
// y se actualiza en el evento "change". En portrait: overlay "gira tu dispositivo" + auto-pausa.
const [isPortrait, setIsPortrait] = useState(false);
```

Convenciones:

- La síntesis de teclas usa `window.dispatchEvent(new KeyboardEvent("keydown"|"keyup", { code, key, bubbles: true }))`. El `key` se deriva del `code` (no se usa en los juegos, que leen `e.code`, pero se rellena por corrección).
- Intervalo de auto-repetición del modo `repeat`: **120 ms** (constante `TOUCH_REPEAT_MS`), tras un retardo inicial de **220 ms** (constante `TOUCH_REPEAT_DELAY_MS`), imitando el auto-repeat de un teclado físico.
- Al soltar/cancelar un botón (`touchend`, `touchcancel`, `pointerup`, o `pointerleave`) siempre se emite el `keyup` correspondiente y se limpia cualquier temporizador de `repeat`, para no dejar una tecla "pegada".
- La auto-pausa por portrait reutiliza el mismo estado `paused` del player (no un mecanismo nuevo).

## Plan de implementación

1. **Tipos y mapa de controles en el registry.** En `app/components/games/registry.ts` añadir los tipos `TouchButtonMode`, `TouchButton` y el campo opcional `touchControls?: TouchButton[]` en `GameRegistryEntry`; poblar los 4 mapas (`rocas`, `caida`, `bloque-buster`, `serpentina`) según el modelo de datos. Prueba: `npm run build` compila; el campo aún no se consume en ningún lado.

2. **Componente `TouchControls`.** Crear `app/components/games/touch-controls.tsx` (cliente): recibe `buttons: TouchButton[]`, renderiza dos grupos (`pad` abajo-izq, `action` abajo-der) y traduce cada toque a `KeyboardEvent` sintéticos sobre `window` según el `mode` (`hold`/`tap`/`repeat`, con `TOUCH_REPEAT_MS`/`TOUCH_REPEAT_DELAY_MS`), garantizando siempre el `keyup` al soltar/cancelar y limpiando temporizadores. Prueba: `npm run build` compila; el componente aún no se monta.

3. **Estilos del mando + escalado del canvas.** En `app/globals.css` añadir los estilos del overlay de botones (semitransparentes, esquinas inferiores, `touch-action: none`), el escalado responsive del `.crt`/canvas 4:3 sin deformar, y ocultar el mando por defecto mostrándolo solo bajo `@media (hover: none) and (pointer: coarse)`. Prueba: en dev, redimensionar/emular táctil muestra los botones; en desktop no aparecen.

4. **Montaje del mando en el player.** En `game-player.tsx`, cuando `gameEntry?.touchControls` exista, renderizar `<TouchControls buttons={gameEntry.touchControls} />` como overlay dentro de `.crt-screen`. Prueba: en `/games/rocas/jugar` con emulación táctil, tocar los botones mueve/dispara la nave (teclas sintéticas llegan al juego); en desktop nada cambia.

5. **Orientación + aviso portrait con auto-pausa.** En `game-player.tsx` añadir el estado `isPortrait` vía `matchMedia("(orientation: portrait)")` con listener de `change`; en portrait mostrar el overlay "gira tu dispositivo" sobre el canvas y forzar `paused = true`, reanudando al volver a landscape (sin pisar una pausa manual previa). Prueba: emulando un móvil, girar a vertical pausa y muestra el aviso; girar a horizontal reanuda donde quedó.

6. **HUD responsive.** Ajustar en `globals.css` el layout del `.player-hud` y `.hud-actions` para pantallas pequeñas (reflow/compactación de stats, selector de Skin y botones PAUSA/FIN/SALIR) sin alterar el layout de desktop. Prueba: en viewport de móvil el HUD no desborda ni se solapa; en desktop se ve idéntico a antes.

7. **Build + playtest en los 4 juegos.** `npm run build` sin errores ni warnings de TypeScript. Playtest con emulación táctil (Playwright / responsive) de `rocas`, `caida`, `bloque-buster` y `serpentina`: cada mando controla su juego, ningún botón deja una tecla pegada, portrait pausa+avisa, PAUSA/FIN/SALIR y guardar puntuación siguen funcionando. Confirmar que en desktop los 4 juegos y el resto del sitio quedan intactos.

8. **Cierre.** Verificar los criterios de aceptación uno por uno y pasar el estado del spec a "Implementado" antes de mergear la rama.

## Criterios de aceptación

- [x] `npm run build` termina sin errores ni warnings de TypeScript.
- [x] En un dispositivo/emulación táctil, `/games/rocas/jugar` muestra el mando (D-pad abajo-izq, acciones abajo-der) superpuesto al canvas.
- [x] En desktop (puntero fino, con hover), **ningún** juego muestra el mando y el teclado funciona igual que antes.
- [x] En `rocas`: girar izq/der y empuje responden mientras se mantiene el botón presionado; disparo dispara una vez por toque.
- [x] En `caida`: izq/der/bajar se auto-repiten al mantener presionado; rotar y soltar actúan una sola vez por toque.
- [x] En `bloque-buster`: la pala se mueve izq/der mientras se mantiene presionado el botón.
- [x] En `serpentina`: cada botón del D-pad cambia la dirección una vez por toque (respetando la regla anti-reversa del juego).
- [x] Ningún botón deja una tecla "pegada": al soltar o cancelar el toque, el movimiento/acción se detiene (se emite el `keyup`).
- [x] Tocar los botones no hace scroll ni zoom de la página mientras se juega.
- [x] El canvas 4:3 (800×600) se escala para caber en la pantalla del móvil sin deformarse.
- [x] En portrait se muestra el overlay "gira tu dispositivo" y el juego se auto-pausa.
- [x] Al volver a landscape el juego se reanuda donde quedó (sin reiniciar la partida).
- [x] El HUD (stats, selector de Skin, PAUSA/FIN/SALIR) cabe en pantallas pequeñas sin desbordar ni solaparse.
- [x] El HUD y el layout del player en desktop se ven idénticos a antes de esta spec.
- [x] Los juegos **decorativos** (fuera de `GAME_REGISTRY`) no muestran mando.
- [x] Los 4 componentes de juego (`asteroids-game.tsx`, `caida-game.tsx`, `bloque-buster-game.tsx`, `serpentina-game.tsx`) no tienen cambios.
- [x] PAUSA/FIN/SALIR, el modal de fin de partida y "GUARDAR PUNTUACIÓN" siguen funcionando en móvil.

## Decisiones

- **Sí:** botones on-screen por juego, en vez de gestos (swipe/tap sobre el canvas). Los inputs simultáneos de `rocas` (girar + empujar + disparar a la vez) no se resuelven bien con gestos; los botones dan control preciso y explícito en los 4 juegos.
- **Sí:** sintetizar `KeyboardEvent` sobre `window` en una capa compartida, en vez de tocar cada juego. Los 4 juegos ya escuchan `window` keydown/keyup con `e.code`; así se logra soporte táctil con **cero cambios** en los componentes de juego y toda la lógica vive en un solo lugar.
- **No:** extender `GameComponentProps` con handlers de input táctil (como se hizo con `skin`). Habría obligado a editar los 4 juegos y a duplicar el mapeo tecla→acción que ya existe en cada uno; la síntesis de teclas lo evita.
- **No:** listeners táctiles por juego sobre cada canvas. Máxima flexibilidad pero lógica repetida x4 y sin capa compartida; contradice el objetivo de no tocar los juegos.
- **Sí:** modo por botón (`hold`/`tap`/`repeat`). Necesario porque los juegos difieren: `rocas`/`bloque-buster` sondean `keys[code]` cada frame (requieren `hold`), mientras `serpentina`/`caida` actúan en el evento `keydown` (requieren `tap`, y `repeat` para el movimiento continuo de Tetris).
- **Sí:** visibilidad por capacidad táctil (`(hover: none) and (pointer: coarse)`), sin toggle. Es la señal correcta para "dispositivo táctil primario"; evita mostrar el mando en una laptop con ventana angosta y mantiene la UI de desktop intacta.
- **Sí:** overlay de botones sobre el canvas, en vez de en los márgenes laterales. Funciona aunque el canvas ocupe toda la pantalla y no depende de que sobren gutters en móviles anchos.
- **Sí:** pedir landscape con aviso + auto-pausa en portrait, en vez de soportar juego en vertical. El canvas es 4:3: en portrait quedaría diminuto; auto-pausar evita perder la partida por una rotación accidental.
- **No:** bloquear la orientación (`screen.orientation.lock`) o entrar en pantalla completa. Requieren permisos/gestos del usuario y soporte irregular en navegadores móviles; el aviso + auto-pausa logra el objetivo sin esa fragilidad.
- **Sí:** `bloque-buster` solo con botones izq/der. Se verificó en el código que la bola sale automáticamente y no hay tecla de lanzar; agregar un botón "lanzar" sería inventar una mecánica inexistente.
- **Alcance acotado al in-game.** Hacer responsive el resto del sitio (nav, biblioteca, detalle, salón, home) es un esfuerzo aparte y va en su propia spec; esta se limita a poder **jugar** en móvil.

## Riesgos

| Riesgo                                                                                                                                                          | Mitigación                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una tecla queda "pegada" si el dedo se levanta fuera del botón o el navegador no dispara `touchend` (p. ej. al girar el dispositivo con un botón presionado).   | El componente emite el `keyup` en `touchend`, `touchcancel`, `pointerup` y `pointerleave`, y además fuerza `keyup` de todos los botones activos al pausar (incluida la auto-pausa por portrait) y al desmontarse. |
| `React.StrictMode` en dev monta/desmonta efectos dos veces; los listeners de orientación (`matchMedia`) o temporizadores de `repeat` podrían duplicarse.        | Todos los `useEffect` registran su cleanup (`removeEventListener`, `clearInterval`/`clearTimeout`), igual que el patrón ya usado en los componentes de juego; se verifica en dev.                                 |
| Los `KeyboardEvent` sintéticos podrían no gatillar los juegos si algún handler filtra por `isTrusted` o por propiedades ausentes.                               | Los 4 juegos solo leen `e.code` y llaman `preventDefault`; ninguno consulta `isTrusted`. Se construye el evento con `code`, `key` y `bubbles: true`, y se valida en playtest que cada juego responde.             |
| El escalado CSS del canvas 4:3 podría desalinear las coordenadas de toque de la pala en `bloque-buster` si algún día se pasara a control por posición del dedo. | Esta spec controla `bloque-buster` con botones izq/der (teclas sintéticas), no por posición; el escalado no afecta el mapeo. El control por arrastre queda fuera de alcance.                                      |
| `matchMedia("(orientation: portrait)")` y el auto-pausa podrían pelear con una pausa manual (reanudar al girar algo que el usuario había pausado a mano).       | El player distingue el origen de la pausa: al salir de portrait solo reanuda si la pausa la causó el portrait, respetando una pausa manual previa.                                                                |

## Qué **no** está en este spec

- Hacer responsive el resto del sitio (nav, biblioteca, detalle, salón, home, about).
- Cambios en los 4 componentes de juego.
- Controles táctiles para los juegos decorativos.
- Gestos (swipe/tap) como mecanismo de control.
- Toggle manual del mando.
- Jugar en portrait (vertical).
- Vibración/haptics, bloqueo de orientación o pantalla completa.
- Cambios en Supabase, en el modelo de datos o en el guardado de puntuaciones.
- Tests.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
