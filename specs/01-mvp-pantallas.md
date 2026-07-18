# SPEC 01 — MVP visual: pantallas de Arcade Vault

> **Estado:** Implementado
> **Depende de:** — (primer spec del proyecto)
> **Fecha:** 2026-07-18
> **Objetivo:** Implementar en Next.js 16 la parte visual de las 5 pantallas de los templates de `references/templates/` (biblioteca, detalle, reproductor, auth y salón de la fama), sin ningún juego real.

## Alcance

**Dentro:**

- Ruta `/` — Biblioteca: hero, buscador por nombre, filtros por categoría, grid de tarjetas de juego con efecto tilt y estado vacío de "sin resultados".
- Ruta `/juegos/[id]` — Detalle: portada, tags, descripción, franja de estadísticas, botones de acción y leaderboard lateral con puntuaciones generadas por semilla.
- Ruta `/juegos/[id]/jugar` — Reproductor: HUD (jugador, puntuación, vidas, nivel), pantalla CRT decorativa con puntuación simulada por timer, pausa, y modal de fin de juego con guardado de puntuación en `localStorage`.
- Ruta `/auth` — Acceso: tarjeta con tabs iniciar sesión / crear cuenta, login simulado (guarda usuario en `localStorage`), modo invitado y botones sociales decorativos.
- Ruta `/salon` — Salón de la Fama: tabs por juego, podio (oro/plata/bronce), tabla de puntuaciones y fila "tu mejor marca" si hay usuario.
- Componente `Nav` compartido en el layout: logo, enlaces con estado activo, contador de créditos, botón de sesión y panel de menú móvil. Footer compartido.
- Portar `styles.css` a `app/globals.css` conservando el diseño tal cual, con `--pixel`/`--mono` apuntando a las variables de `next/font` ya cargadas en `layout.tsx`.
- Datos ficticios (`GAMES`, `CATS`, `PLAYERS`, `seededScores`) en `app/data.ts` con tipos TypeScript, como futuro punto de reemplazo por base de datos.
- Navegación con rutas reales de App Router (`next/link` / `useRouter`) en lugar del hash-routing del template.

**Fuera de alcance (para specs futuros):**

- Cualquier juego real o lógica de juego (la "partida" es solo animación decorativa con puntuación aleatoria).
- Autenticación real, backend, base de datos o API (todo es `localStorage` y datos en memoria).
- Login social funcional (Google/GitHub son botones decorativos).
- Sistema real de créditos/monedas (el contador "CRÉDITOS · 03" es fijo).
- Página 404 personalizada para ids de juego inexistentes (se usará `notFound()` con el default de Next.js).
- Tests.

## Modelo de datos

Todo el contenido ficticio vive en `app/data.ts` (sin `page.tsx`, no genera ruta). Se porta desde `references/templates/data.jsx` con tipos:

```ts
// app/data.ts
export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type Category = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export interface Game {
  id: string;          // slug usado en la URL: /juegos/[id]
  title: string;
  short: string;       // descripción corta (tarjeta)
  long: string;        // descripción larga (detalle)
  cat: Category;
  cover: string;       // clase CSS de portada, p. ej. "cover-bricks"
  color: GameColor;
  best: number;
  plays: string;       // formateado, p. ej. "12.4K"
}

export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string;        // "DD/MM/2026"
}

export const GAMES: Game[];                    // los 8 juegos del template, tal cual
export const CATS: ("TODOS" | Category)[];
export const PLAYERS: string[];                // 18 alias retro
export function seededScores(seed: number, count?: number): ScoreRow[];
```

Estado de sesión y puntuaciones en `localStorage` (mismas claves del template):

```ts
// Clave "av_user" — usuario simulado, null si no hay sesión
{ name: string }   // máx. 10 caracteres, mayúsculas

// Clave "av_scores" — array de puntuaciones guardadas
{ game: string, score: number, name: string, at: number }[]
```

Convenciones:

- El usuario se comparte entre Nav, reproductor y salón vía un contexto de React (`UserProvider` en el layout), ya que con rutas reales no hay un `App` que lo sostenga.
- `seededScores` es determinista: mismas semillas que el template (`id.length * 17 + 3` en detalle, `tab.length * 23 + 7` en salón) para que el leaderboard no cambie entre renders.

## Plan de implementación

1. **Estilos base.** Portar `references/templates/styles.css` a `app/globals.css` (tras el `@import "tailwindcss"`), cambiando `--pixel`/`--mono` para que usen `var(--font-press-start)` / `var(--font-jetbrains-mono)` / `var(--font-courier-prime)`. Prueba manual: `npm run dev` muestra el fondo neón con grid y scanlines en la página actual.
2. **Datos.** Crear `app/data.ts` con los tipos, `GAMES`, `CATS`, `PLAYERS` y `seededScores` portados de `data.jsx`. Compila con `tsc` sin errores.
3. **Contexto de usuario.** Crear `app/components/user-context.tsx` (client): `UserProvider` que lee/escribe `av_user` en `localStorage` y hook `useUser()` con `user`, `login`, `signOut`. Montarlo en `layout.tsx`.
4. **Nav y footer.** Crear `app/components/nav.tsx` (client) portando `nav.jsx`: enlaces con `next/link`, estado activo con `usePathname()`, panel móvil, botón sesión/salir usando `useUser()`. Añadir Nav, `<main className="av-main">` y footer al `layout.tsx`. Prueba: la navegación se ve en todas las rutas.
5. **Biblioteca.** Crear `app/components/game-card.tsx` (client, efecto tilt) y reescribir `app/page.tsx` como client component con búsqueda, chips de categoría, grid y estado vacío. Prueba: filtrar y buscar funciona; cada tarjeta enlaza a `/juegos/[id]`.
6. **Detalle.** Crear `app/juegos/[id]/page.tsx`: server component que hace `await params` (API asíncrona de Next 16), busca el juego en `GAMES` y llama `notFound()` si no existe; render de portada, tags, stats, acciones y leaderboard con `seededScores`. Prueba: `/juegos/caida` se ve completo; un id falso da 404.
7. **Reproductor.** Crear `app/juegos/[id]/jugar/page.tsx` (server, `await params`) que delega en `app/components/game-player.tsx` (client) portando `reproductor.jsx`: HUD, timer de puntuación, pausa, modal de fin con guardado en `av_scores`. Prueba: la puntuación sube, pausa la congela, FIN abre el modal y GUARDAR muestra el toast.
8. **Auth.** Crear `app/auth/page.tsx` (client) portando `auth.jsx`: tabs, formulario que llama a `login()` y redirige a `/` con `useRouter`, modo invitado, botones sociales decorativos. Prueba: tras "ENTRAR AL VAULT" el Nav muestra el nombre de usuario.
9. **Salón de la Fama.** Crear `app/salon/page.tsx` (client) portando `salon.jsx`: tabs por juego, podio, tabla y fila "tu mejor marca" cuando hay sesión. Prueba: cambiar de tab cambia las puntuaciones; con sesión iniciada aparece la fila amarilla.
10. **Cierre.** `npm run build` sin errores y revisión visual de las 5 rutas contra `Arcade Vault.html` abierto en el navegador.

Nota para `/spec-impl`: el diseño visual ya está definido por el template — el trabajo de UI es de portado fiel, usando `/frontend-design` como indica `CLAUDE.md` donde haya que tomar decisiones visuales nuevas.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Las 5 rutas (`/`, `/juegos/[id]`, `/juegos/[id]/jugar`, `/auth`, `/salon`) cargan sin errores en la consola del navegador.
- [ ] La apariencia de cada pantalla coincide con el template de referencia (fondo neón, fuentes pixel/mono, tarjetas, CRT, podio).
- [ ] En `/`, escribir en el buscador y pulsar chips filtra el grid; sin coincidencias aparece "NO HAY RESULTADOS".
- [ ] Clic en una tarjeta navega a `/juegos/[id]` con el juego correcto; un id inexistente (p. ej. `/juegos/xyz`) devuelve 404.
- [ ] En el detalle, "JUGAR AHORA" navega al reproductor y "VOLVER AL VAULT" a la biblioteca.
- [ ] En el reproductor la puntuación sube sola, "PAUSA" la congela con overlay "EN PAUSA", y "FIN" abre el modal con la puntuación final.
- [ ] "GUARDAR PUNTUACIÓN" añade una entrada a `av_scores` en `localStorage` y muestra "▸ PUNTUACIÓN GUARDADA_".
- [ ] En `/auth`, enviar el formulario guarda `av_user`, redirige a `/` y el Nav muestra el nombre en mayúsculas (máx. 10 caracteres).
- [ ] Clic en el botón con el nombre de usuario cierra sesión (borra `av_user`) y el Nav vuelve a mostrar "Iniciar Sesión".
- [ ] Recargar la página conserva la sesión iniciada.
- [ ] En `/salon`, cambiar de tab cambia podio y tabla; con sesión iniciada aparece la fila "TU MEJOR MARCA".
- [ ] En viewport móvil (<720px aprox., según los breakpoints del CSS) el botón ≡ abre el panel lateral y sus enlaces navegan.
- [ ] No queda ningún resto visual del create-next-app original (logo de Next, textos por defecto).

## Decisiones

- **Sí:** rutas reales de App Router (`/`, `/juegos/[id]`, `/juegos/[id]/jugar`, `/auth`, `/salon`). URLs compartibles y es lo idiomático en Next.js 16.
- **No:** replicar el hash-routing del template (`app.jsx`). Era un artefacto de la demo estática, no un requisito de diseño.
- **Sí:** portar `styles.css` tal cual a `app/globals.css` con clases `.av-*`. Fidelidad visual 100% con cero reescritura.
- **No:** migrar los estilos a utilidades Tailwind v4. Mucho trabajo y riesgo de desviarse del diseño; queda como mejora futura si algún día se necesita.
- **Sí:** mantener la simulación del template (puntuación por timer, login fake, `localStorage` con claves `av_user`/`av_scores`). Es la experiencia demo que definen los templates.
- **Sí:** datos ficticios centralizados en `app/data.ts`. Punto único de reemplazo cuando llegue la base de datos.
- **Sí:** contexto de React (`UserProvider`) para el usuario. Con rutas reales ya no existe el `<App/>` del template que sostenía ese estado.
- **Sí:** fuentes vía `next/font` (ya cargadas en `layout.tsx`) en lugar de los `<link>` a Google Fonts del template. Evita peticiones externas en runtime.
- **No:** juegos reales, backend, auth real, login social, sistema de créditos. Cada uno irá en su propio spec si llega a hacerse.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Desajuste de hidratación: el servidor no conoce `localStorage`, así que el Nav renderiza "Iniciar Sesión" y el cliente puede corregirlo a nombre de usuario | `UserProvider` inicia con `user = null` y lee `av_user` en un `useEffect` tras montar. Render inicial consistente; el nombre aparece un instante después. |
| El reset/preflight de Tailwind v4 puede pisar o ser pisado por los estilos globales del template (`body`, `button`, `a`) | El CSS portado va después del `@import "tailwindcss"` en `globals.css`, y sus selectores son de igual o mayor especificidad. Verificación visual contra `Arcade Vault.html` en el paso 10. |
| APIs asíncronas de Next 16: acceder a `params` sin `await` rompe en las rutas `[id]` | Los `page.tsx` de `/juegos/[id]` y `/juegos/[id]/jugar` son server components que hacen `await params` y pasan el juego resuelto a los componentes cliente. |
| `localStorage` deshabilitado (modo privado) | Igual que el template: lecturas/escrituras envueltas en `try/catch`. La app funciona sin persistencia. |

## Qué **no** entra en este spec

- Juegos reales ni lógica de juego.
- Backend, base de datos, API o autenticación real.
- Login social funcional y sistema de créditos.
- Tests.

Cada uno de estos, si llega, va en su propio spec.
