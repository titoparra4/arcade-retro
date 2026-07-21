# SPEC 05 — Juego real: Rocas (Asteroids)

> **Estado:** Implementado
> **Depende de:** SPEC 01 (rutas `/games/[id]/jugar`, `GamePlayer`, HUD, modal de fin de partida, `av_scores` en `localStorage`)
> **Fecha:** 2026-07-21
> **Objetivo:** Portar el juego `references/started-games/02-asteroids/game.js` a un componente cliente en canvas (`AsteroidsGame`) e integrarlo en `/games/rocas/jugar`, reemplazando la simulación decorativa por el juego real, conectado al HUD, pausa, botón FIN y modal de guardado de puntuación ya existentes de la plataforma.

## Alcance

**Dentro:**

- Nuevo componente cliente `app/components/games/asteroids-game.tsx` que porta a TypeScript la lógica completa de `game.js` (clases `Bullet`, `Asteroid`, `PowerUp`, `Ship`, `Particle`; loop, colisiones, wrap toroidal, spawn de asteroides, niveles, power-up de triple disparo), dibujando en un `<canvas>` de resolución fija 800×600 dentro del `.crt-screen`.
- Quitar el HUD interno que el canvas original dibujaba (`drawHUD`, overlay de "GAME OVER") — el canvas solo dibuja el campo de juego: nave, asteroides, balas, partículas y power-up.
- Modificar `app/components/game-player.tsx`: cuando `game.id === "rocas"`, renderizar `<AsteroidsGame>` dentro de `.crt-screen` en lugar del `.game-arena` decorativo; los demás juegos conservan el `.game-arena` falso sin cambios.
- Wiring del estado real del juego hacia el HUD exterior vía callbacks (`onScoreChange`, `onLivesChange`, `onLevelChange`, `onGameOver`) — `score`, `lives` (ahora con setter real, ya no fijo en 3) y `level` se actualizan en vivo; al llegar a `'gameover'` se dispara el modal de fin ya existente.
- Indicador del power-up de triple disparo como stat adicional en el HUD exterior, visible solo mientras está activo (reemplaza el "3x" que dibujaba el canvas original).
- PAUSA congela el loop del juego por completo (no se llama `update()`), reutilizando el overlay "EN PAUSA" ya existente encima del canvas.
- FIN fuerza el fin de partida ya mismo con la puntuación acumulada (aunque queden vidas) y abre el modal de guardado de puntuación existente.
- "JUGAR DE NUEVO" reinicia el juego real por completo (score 0, nivel 1, 3 vidas, nuevos asteroides), sin recargar la página.
- Captura de teclado (flechas + espacio) con `preventDefault` mientras el juego está montado, para evitar scroll de la página; el canvas recibe foco al montar.
- El guardado de puntuación reutiliza el mecanismo `saveScore`/`av_scores` en `localStorage` ya existente en `game-player.tsx`, sin cambios en ese mecanismo.
- Solo se porta la lógica de `game.js`; no se copian `index.html`, `README.md` ni `favicon.svg` del original.

**Fuera de alcance (para specs futuros si llegan):**

- Controles táctiles/móviles — el juego queda solo con teclado, como el original.
- Cambios en `app/data.ts` (título, descripción, `best`, `plays`, portada de "rocas" quedan igual).
- Persistencia de puntuaciones en Supabase/base de datos — se mantiene `localStorage` (`av_scores`).
- Cualquier otro juego real (bloque-buster, caída, serpentina, etc.) — cada uno con su propio spec.
- Sonido/música.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No introduce datos persistentes nuevos (el esquema de `av_scores` en `localStorage` no cambia). Lo nuevo es el contrato del componente:

```ts
// app/components/games/asteroids-game.tsx
export interface AsteroidsGameProps {
  paused: boolean; // el padre controla la pausa vía prop
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
  onTripleShotChange: (secondsLeft: number) => void; // 0 = inactivo
}

export interface AsteroidsGameHandle {
  reset: () => void; // reinicia el juego real (usado por "JUGAR DE NUEVO")
  forceGameOver: () => void; // usado por el botón FIN ("abandonar partida")
}

export const AsteroidsGame: React.ForwardRefExoticComponent<
  AsteroidsGameProps & React.RefAttributes<AsteroidsGameHandle>
>;
```

- `game-player.tsx` mantiene un `ref` al componente para llamar `reset()` (JUGAR DE NUEVO) y `forceGameOver()` (botón FIN) de forma imperativa.
- Los callbacks (`onScoreChange`, `onLivesChange`, etc.) se disparan solo cuando el valor cambia (no en cada frame de `requestAnimationFrame`), para no saturar el estado de React.
- `av_scores` y `av_user` en `localStorage` conservan exactamente el esquema del SPEC 01.

## Plan de implementación

1. **Puerto del juego a componente canvas.** Crear `app/components/games/asteroids-game.tsx`: portar las clases y funciones de `game.js` a TypeScript dentro de un client component, canvas 800×600, captura de teclado propia (flechas + espacio, con `preventDefault`), loop `requestAnimationFrame` con `dt` capado a 50ms. Quitar `drawHUD` y el overlay de "GAME OVER" del canvas. Exponer `AsteroidsGameHandle` (`reset`, `forceGameOver`) vía `forwardRef` + `useImperativeHandle`, y disparar `onScoreChange`/`onLivesChange`/`onLevelChange`/`onTripleShotChange`/`onGameOver` solo cuando cambian. Respetar la prop `paused` (no llamar `update()` mientras es `true`). Prueba: `npm run build` pasa; el componente aún no se usa en ninguna página.

2. **Integrar en `game-player.tsx`.** Cuando `game.id === "rocas"`, renderizar `<AsteroidsGame>` (con `ref`) dentro de `.crt-screen` en lugar de `.game-arena`; los demás juegos siguen igual. Cablear los callbacks a `setScore`, `setLives` (ahora con setter real), `setLevel` y a `endGame` (que ahora recibe el score final real). El botón PAUSA sigue alternando `paused`, que ahora se pasa como prop al canvas. El indicador "3x" del power-up se muestra como stat adicional en `player-hud` cuando hay tiempo restante. Prueba: `/games/rocas/jugar` carga con el juego real corriendo, se mueve con las flechas, dispara con espacio, y el HUD exterior refleja puntuación/vidas/nivel en vivo.

3. **FIN, pausa y game over conectados.** El botón FIN llama `ref.current.forceGameOver()` (abandona con el score actual). Al llegar a `gameover` (por perder las 3 vidas o por FIN), se dispara el modal existente de guardado de puntuación con la puntuación final real. Prueba: perder las 3 vidas abre el modal con el score correcto; pulsar FIN a mitad de partida también lo abre con el score acumulado hasta ese momento.

4. **Reinicio real.** "JUGAR DE NUEVO" en el modal llama `ref.current.reset()` (vuelve a score 0, nivel 1, 3 vidas, nuevos asteroides) en lugar de solo resetear el estado de React. Prueba: tras game over, "JUGAR DE NUEVO" deja el juego jugable desde cero sin recargar la página.

5. **Cierre.** `npm run build` sin errores ni warnings de TypeScript; playtest manual completo en `/games/rocas/jugar`: movimiento/disparo/wrap toroidal, asteroides grandes→medianos→pequeños al impactar, power-up de triple disparo (aparece, se recoge, expira), pérdida de vida con parpadeo de invencibilidad, transición de nivel al limpiar el campo, pausa, FIN, guardado de puntuación en `av_scores`, y confirmar que los demás juegos (p. ej. `/games/bloque-buster/jugar`) siguen mostrando la simulación falsa sin cambios.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/games/rocas/jugar` carga sin errores en consola, con el juego real en canvas en vez de la simulación decorativa.
- [ ] La nave rota con ←/→, propulsa con ↑ (con llama visible) y dispara con Espacio; nave, balas y asteroides envuelven los bordes del canvas (toroidal).
- [ ] Los asteroides grandes se parten en medianos y estos en pequeños al ser impactados por una bala; los pequeños desaparecen sin dividirse; aparecen partículas de explosión.
- [ ] El HUD exterior (Jugador/Puntuación/Vidas/Nivel) refleja en vivo el score, las vidas y el nivel reales del juego, sin HUD duplicado dentro del canvas.
- [ ] El power-up de triple disparo aparece ocasionalmente, se puede recoger, y mientras está activo se ve un indicador con el tiempo restante en el HUD exterior.
- [ ] Al chocar la nave contra un asteroide se pierde una vida, hay explosión, y la nave reaparece con parpadeo de invencibilidad temporal; al llegar a 0 vidas el estado pasa a game over.
- [ ] Al limpiar todos los asteroides del nivel actual, el juego avanza automáticamente al siguiente nivel (más asteroides, HUD de nivel actualizado) sin perder la partida.
- [ ] El botón PAUSA congela el juego (nave y asteroides dejan de moverse) y muestra el overlay "EN PAUSA"; REANUDAR continúa donde quedó.
- [ ] El botón FIN termina la partida de inmediato con la puntuación acumulada hasta ese momento y abre el modal de fin de partida.
- [ ] Perder las 3 vidas abre el mismo modal de fin de partida con la puntuación final correcta.
- [ ] "GUARDAR PUNTUACIÓN" en el modal añade una entrada a `av_scores` en `localStorage` con el score real de la partida (mismo comportamiento que el resto de los juegos).
- [ ] "JUGAR DE NUEVO" reinicia el juego real desde cero (score 0, nivel 1, 3 vidas, nuevos asteroides) sin recargar la página.
- [ ] "SALIR" navega a `/games/rocas` sin errores.
- [ ] Las flechas y la barra espaciadora no hacen scroll de la página mientras se juega.
- [ ] Los demás juegos (`/games/bloque-buster/jugar`, `/games/caida/jugar`, etc.) siguen mostrando la simulación decorativa sin cambios visuales ni de comportamiento.
- [ ] `app/data.ts` no cambia.

## Decisiones

- **Sí:** reemplazar solo `.game-arena` dentro del `.crt-screen` existente por el canvas real; conservar el HUD/modal compartido de `GamePlayer`. Mantiene consistencia de interfaz entre todos los juegos y evita duplicar pantallas de pausa/fin/guardado por cada juego.
- **Sí:** quitar el HUD interno dibujado por el canvas original (score/nivel/vidas/game over) y dejar que el HUD exterior de React sea la única fuente de verdad visual de esos datos. Evita duplicación e inconsistencia entre dos HUDs.
- **No:** mantener el overlay "GAME OVER... ESPACIO PARA REINICIAR" propio del juego original. Se descarta porque la plataforma ya tiene su propio modal de fin con guardado de puntuación; usarlo unifica la experiencia con el resto de los juegos.
- **Sí:** el botón FIN "abandona" la partida con el score acumulado (aunque queden vidas), en vez de deshabilitarlo. Coherente con el comportamiento actual de FIN en los demás juegos (termina la partida a demanda).
- **Sí:** PAUSA congela el loop por completo (no se llama `update()`). Es el comportamiento más simple y predecible; evita pausar/reanudar de forma parcial los timers internos del juego (invencibilidad, cooldowns, power-up).
- **Sí:** `forwardRef` + `useImperativeHandle` (`reset`, `forceGameOver`) para que `game-player.tsx` controle el juego de forma imperativa desde los botones existentes, en vez de reescribir la máquina de estados del juego como props declarativas. Es el patrón más directo para un game loop con estado interno complejo (clases, canvas).
- **Sí:** controles solo de teclado, sin soporte táctil/móvil en este spec. El juego original es de escritorio; los controles táctiles son una funcionalidad nueva que merece su propio spec si se necesita jugar desde el celular.
- **Sí:** `app/data.ts` no se toca (título, descripción, `best`, `plays`, portada de "rocas" quedan igual). Es contenido decorativo ficticio ajeno a la lógica del juego; la entrada ya existía lista para este juego.
- **Sí:** persistencia de puntuación vía `localStorage` (`av_scores`), reutilizando `saveScore` ya existente. Consistente con SPEC 01 y con la decisión de SPEC 04 de dejar la persistencia real (Supabase) para un spec futuro.
- **Sí:** canvas con resolución fija 800×600, escalado por CSS dentro de `.crt-screen` (que ya tiene `aspect-ratio: 4/3`, coincidente). Evita reescribir la física del juego —que depende de constantes `W`/`H` fijas— para soportar resoluciones dinámicas; el ligero escalado es coherente con la estética CRT (scanlines, viñeta) ya existente.
- **No:** tocar la lógica de física/mecánicas del juego original (velocidades, spread del triple disparo, probabilidad de drop del power-up, etc.). Se porta tal cual — el juego "ya está creado"; solo se adapta la integración con React/Next.js.

## Riesgos

| Riesgo                                                                                                                                                                                                                  | Mitigación                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El modo dev de Next.js (`React.StrictMode`) monta/desmonta efectos dos veces; sin cuidado esto podría duplicar el `requestAnimationFrame` o los listeners de teclado, causando el doble de velocidad o inputs fantasma  | El `useEffect` que arranca el loop y añade los listeners de teclado registra su cleanup (`cancelAnimationFrame`, `removeEventListener`) correctamente; se verifica manualmente en dev que la velocidad y los controles sean normales. |
| Si el jugador navega fuera de `/games/rocas/jugar` (SALIR, VOLVER) mientras el juego corre, el loop o los listeners podrían seguir vivos y filtrar memoria/inputs a otras rutas                                         | El cleanup del `useEffect` de `AsteroidsGame` cancela el `requestAnimationFrame` y remueve los listeners de teclado al desmontar.                                                                                                     |
| Las capas visuales del `.crt-screen` (scanlines, viñeta oscura en los bordes) pueden reducir el contraste del juego (líneas blancas finas sobre negro) y dificultar ver asteroides pequeños o balas cerca de los bordes | Se acepta como parte de la estética retro ya definida por el proyecto; si el playtest lo hace ilegible, ajustar `z-index`/opacidad de esas capas es un ajuste menor dentro de este mismo spec, no uno nuevo.                          |
| El canvas de resolución fija (800×600) escalado por CSS puede verse borroso en pantallas grandes/alto DPI                                                                                                               | Aceptado por decisión explícita (ver Decisiones); coherente con la estética CRT, ya "sucia" por diseño (scanlines, viñeta).                                                                                                           |
