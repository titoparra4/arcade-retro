# SPEC 02 — Home landing page

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-07-19
> **Objetivo:** Implementar el landing page del template `references/templates/home-about/` como nueva ruta `/`, moviendo la Biblioteca y sus rutas hijas de `/` y `/juegos/*` a `/games/*`.

## Alcance

**Dentro:**

- Nueva ruta `/` — Home landing con las 7 secciones del template `home.jsx`: hero (siluetas pixel flotantes, título, eyebrow "INSERTA UNA MONEDA", CTAs), "¿Por qué?" (4 feature cards con iconos pixel), preview de juegos (6 mini-tarjetas de `GAMES`), franja de estadísticas, actividad en vivo (ticker de puntuaciones + top jugadores), precios (plan único + FAQ) y CTA final.
- Animación de aparición al hacer scroll (`useReveal` con `IntersectionObserver`), portada como hook o efecto en el componente cliente.
- Mover la Biblioteca de `/` a `/games` y renombrar `app/juegos/` → `app/games/` (detalle en `/games/[id]`, reproductor en `/games/[id]/jugar`), sin cambios visuales en esas pantallas.
- Actualizar todos los enlaces afectados por el movimiento: `nav.tsx` (logo → `/`, nuevo enlace "Inicio", "Biblioteca" → `/games` con estado activo sobre `/games/*`), `game-card.tsx`, `app/games/[id]/page.tsx` ("VOLVER"), `game-player.tsx`, `salon/page.tsx` y redirecciones post-login/invitado de `auth/page.tsx` → `/games`.
- Portar de `references/templates/home-about/styles.css` a `app/globals.css` **solo las clases del home** (`.home*`, `.hero-*`, `.silo*`, `.feature-*`, `.ft-*`, `.mini-*`, `.stat*`, `.activity-*`, `.ac-*`, `.tick-*`, `.tk-*`, `.top-*`, `.tp-*`, `.lb-link`, `.pricing-*`, `.price-*`, `.pc-*`, `.faq-*`, `.final-*`, `.section-*`, `.kicker`, `.reveal`, `.live-led` y afines).
- Textos adaptados a "Arcade Retro" donde el template dice "Vault" ("¿POR QUÉ ARCADE RETRO?", "JUGADOR RETRO", etc.).
- Datos ficticios de actividad (ticker y top jugadores) como constantes locales en el componente del home, marcadas como temporales.

**Fuera de alcance (para specs futuros):**

- Página "Acerca de" (`about.jsx`) y todas sus clases CSS (`.about-*`, `.gp-*`, `.contact-*`, `.div-*`, etc.).
- Enlace "Acerca de" en el nav (llega con su spec).
- Datos reales de actividad/ranking (backend o `data.ts`); el ticker y el top son decorativos.
- Redirecciones 301/rewrites desde las URLs viejas `/juegos/*` (no hay producción que preservar).
- Todo lo ya excluido en SPEC 01 (juegos reales, backend, auth real, créditos, tests).

## Modelo de datos

Este spec no introduce estructuras de datos nuevas ni cambia `app/data.ts` — reutiliza `GAMES` del SPEC 01 para las mini-tarjetas (`GAMES.slice(0, 6)`).

Lo único nuevo son dos constantes **locales y temporales** en el componente del home (marcadas con un comentario como datos decorativos a reemplazar cuando exista actividad real):

```ts
// app/components/home-landing.tsx — datos decorativos, NO persisten
const TICKER: { p: string; g: string; s: number; t: string; c: GameColor }[];
// jugador, juego, puntuación, "hace X min", color de acento

const TOP_TODAY: { r: number; p: string; s: number }[];
// rank, jugador, puntuación
```

No se toca `localStorage` ni el contexto de usuario.

## Plan de implementación

1. **CSS del home.** Portar a `app/globals.css` las clases del home listadas en el alcance (desde `references/templates/home-about/styles.css`), después de los estilos existentes. Prueba manual: `npm run dev` y las 5 pantallas actuales se ven igual que antes (las clases nuevas aún no se usan).
2. **Movimiento a `/games`.** Renombrar `app/juegos/` → `app/games/`; mover el contenido de `app/page.tsx` (Biblioteca) a `app/games/page.tsx`; dejar en `app/page.tsx` un `redirect("/games")` temporal. Actualizar enlaces: `nav.tsx` ("Biblioteca" → `/games`, activo sobre `/games`), `game-card.tsx`, `app/games/[id]/page.tsx`, `game-player.tsx`, `salon/page.tsx` y los dos `router.push` de `auth/page.tsx` → `/games`. Prueba: todo el flujo (biblioteca → detalle → jugar → salón → auth) funciona bajo las URLs nuevas.
3. **Esqueleto del home.** Crear `app/components/home-landing.tsx` (client) con el hook `useReveal`, las siluetas flotantes (`FloatingSilhouettes`) y la sección hero completa (eyebrow, título en 3 líneas, subtítulo, CTAs "EXPLORAR JUEGOS" → `/games` y "CREAR CUENTA" → `/auth`, indicador "DESLIZA"). Reescribir `app/page.tsx` para renderizarlo (fuera el redirect temporal). Prueba: `/` muestra el hero y los CTAs navegan.
4. **Features y preview de juegos.** Añadir a `home-landing.tsx` la sección "¿POR QUÉ ARCADE RETRO?" (4 feature cards con `FeatureIcon`) y "JUEGOS DISPONIBLES AHORA" (6 mini-tarjetas de `GAMES` que enlazan a `/games/[id]` + botón "VER TODOS LOS JUEGOS" → `/games`). Prueba: las mini-tarjetas navegan al detalle correcto.
5. **Stats y actividad.** Añadir la franja de estadísticas y la sección "ACTIVIDAD EN VIVO" con las constantes `TICKER` y `TOP_TODAY` (comentadas como temporales) y el enlace "VER SALÓN →" → `/salon`. Prueba: ambas tarjetas se ven como el template y el enlace navega.
6. **Precios y CTA final.** Añadir la sección de precios (tarjeta "JUGADOR RETRO" con sello FREE PLAY + 3 FAQ, CTA "EMPEZAR GRATIS" → `/auth`) y la sección final "¿LISTO PARA JUGAR?" con "INSERTAR MONEDA →" → `/games`. Prueba: la página completa hace scroll con las animaciones de aparición.
7. **Nav.** Añadir "Inicio" (→ `/`, activo solo en `/` exacto) en el nav de escritorio y en el panel móvil. Prueba: el estado activo distingue Inicio (`/`) de Biblioteca (`/games` y `/games/*`).
8. **Cierre.** `npm run build` sin errores y revisión visual del home contra `references/templates/home-about/arcade-vault-standalone.html` abierto en el navegador (desktop y viewport móvil).

Nota para `/spec-impl`: igual que en SPEC 01, el trabajo de UI es portado fiel del template; usar `/frontend-design` donde haya que tomar decisiones visuales nuevas.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/` carga el home sin errores en la consola del navegador, con las 7 secciones: hero, por qué, preview, stats, actividad, precios y CTA final.
- [ ] Las secciones aparecen con la animación de reveal al hacer scroll (y las siluetas del hero flotan).
- [ ] "▶ EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →" e "INSERTAR MONEDA →" navegan a `/games`; "✦ CREAR CUENTA" y "EMPEZAR GRATIS →" a `/auth`; "VER SALÓN →" a `/salon`.
- [ ] Las 6 mini-tarjetas muestran los primeros 6 juegos de `GAMES` y cada una navega a su `/games/[id]`.
- [ ] La Biblioteca completa (buscador, filtros, grid, estado vacío) funciona en `/games` igual que antes en `/`.
- [ ] `/games/[id]` y `/games/[id]/jugar` funcionan; un id inexistente en `/games/xyz` devuelve 404; las URLs viejas `/juegos/*` ya no existen (404).
- [ ] Tras iniciar sesión o entrar como invitado en `/auth`, se redirige a `/games`.
- [ ] En el nav, "Inicio" está activo solo en `/` y "Biblioteca" en `/games` y sus subrutas; el logo navega a `/`. No aparece "Acerca de".
- [ ] El panel móvil incluye "Inicio" y sus enlaces navegan.
- [ ] Ningún texto visible del home dice "Vault" (todo adaptado a "Arcade Retro").
- [ ] La apariencia del home coincide con `arcade-vault-standalone.html` en desktop y en viewport móvil (hero, grids en columna, secciones apiladas).
- [ ] Las pantallas del SPEC 01 no cambian visualmente (solo cambió su URL).

## Decisiones

- **Sí:** home en `/` como landing y Biblioteca movida a `/games`. El landing es la puerta de entrada del sitio; lo decidió el usuario en la fase de preguntas.
- **Sí:** rutas hijas renombradas a `/games/[id]` y `/games/[id]/jugar`. URLs coherentes en un solo idioma y estado activo del nav trivial (todo cuelga de `/games`).
- **No:** dejar el detalle en `/juegos/[id]`. Mezclaba inglés y español en las URLs y complicaba el nav.
- **No:** redirecciones desde `/juegos/*`. No hay producción ni enlaces externos que preservar.
- **Sí:** redirección post-login a `/games`. Conserva el comportamiento actual: quien entra va directo a jugar.
- **Sí:** `TICKER` y `TOP_TODAY` como constantes locales temporales en el componente, como en el template. Son decorativas; se moverán a datos reales (o a `data.ts`) cuando exista actividad real.
- **No:** mover esos datos a `app/data.ts` ahora. El usuario prefirió la constante temporal; `data.ts` queda como contrato solo para datos que ya se comparten entre pantallas.
- **Sí:** portar únicamente las clases CSS del home. Las de "Acerca de" (`.about-*`, `.gp-*`, `.contact-*`) llegan con su propio spec, evitando CSS muerto.
- **Sí:** omitir "Acerca de" del nav hasta su spec. Evita un enlace que da 404.
- **Sí:** textos adaptados a "Arcade Retro". Consistente con el renombrado ya aplicado al resto de la app.
- **No:** copiar los textos "Vault" del template tal cual. Mezclaría dos marcas en el mismo sitio.
- **Sí:** un único componente cliente `home-landing.tsx` con sus piezas internas (`FloatingSilhouettes`, `FeatureIcon`, `MiniCard`), como hace el template. La página no comparte piezas con otras rutas; no amerita fragmentarse en archivos.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Algún enlace a `/` o `/juegos/*` queda sin actualizar tras el movimiento de rutas y navega al sitio equivocado | Al cerrar el paso 2, `grep` de `/juegos` y `href="/"` en `app/`; los criterios de aceptación recorren todos los flujos de navegación. |
| El nuevo `styles.css` del template redefine clases que ya existen en `app/globals.css` (p. ej. `.section-title`, `.kicker`) con valores distintos, alterando las pantallas del SPEC 01 | Portar solo bloques de selectores del home; ante una clase duplicada, comparar con la versión ya portada y conservar la existente. El paso 1 y el último criterio verifican que las pantallas viejas no cambian. |
| El efecto reveal oculta contenido: si el `IntersectionObserver` no llega a ejecutarse, las secciones con `.reveal` quedarían invisibles | Mismo patrón del template (estado inicial con opacidad y transición, `in` al intersectar) dentro de un `useEffect` en componente cliente; verificación de scroll completo en el criterio de reveal. |

## Qué **no** entra en este spec

- Página "Acerca de" (`about.jsx`) ni sus estilos — irá en su propio spec.
- Enlace "Acerca de" en el nav.
- Datos reales de actividad o ranking (el ticker y el top son constantes decorativas).
- Redirecciones desde las URLs viejas `/juegos/*`.
- Juegos reales, backend, auth real, créditos, tests (ya excluidos desde SPEC 01).

Cada uno de estos, si llega, va en su propio spec.
