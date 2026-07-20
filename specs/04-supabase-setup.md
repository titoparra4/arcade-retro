# SPEC 04 — Integración base de Supabase

> **Estado:** Aprobado
> **Depende de:** SPEC 03 (convención `.env.template` / `.gitignore` de variables de entorno)
> **Fecha:** 2026-07-20
> **Objetivo:** Dejar la integración base de Supabase (clientes browser/server con `@supabase/ssr`, proxy de refresco de sesión y variables de entorno) conectada y verificada, como cimiento para specs futuros de auth real, scores persistentes, realtime y Edge Functions.

## Alcance

**Dentro:**

- Instalar `@supabase/supabase-js` y `@supabase/ssr`.
- Crear `lib/supabase/client.ts` (`createBrowserClient`, para Client Components).
- Crear `lib/supabase/server.ts` (`createServerClient` + `cookies()` de `next/headers`, para Server Components/Actions/Route Handlers).
- Crear `lib/supabase/proxy.ts` con `updateSession()` (refresca el token vía `supabase.auth.getClaims()` y sincroniza cookies), y `proxy.ts` en la raíz (nombre Next 16, no `middleware.ts`) que lo invoca, con el `matcher` estándar que excluye estáticos/imágenes.
- El proxy **solo refresca la sesión**; no incluye lógica de redirección a `/login` ni protección de rutas — no hay auth real todavía, eso llega en un spec futuro.
- Variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: placeholders en `.env.template` (versionado) y valores reales del proyecto `nwduxopaviglnluuobbl` en `.env.local` (no versionado).
- Página temporal `app/debug/supabase/page.tsx` (Server Component) que usa el cliente de servidor para llamar `supabase.auth.getClaims()` y mostrar en pantalla "conectado" o el error — marcada explícitamente como temporal en el código (comentario) y en este spec; se retira en el spec que implemente auth real.

**Fuera de alcance (para specs futuros):**

- Auth real (login/signup, reemplazo de `user-context.tsx`).
- Cualquier tabla en la base de datos — el proyecto está vacío (`list_tables` lo confirma); el esquema llega con el spec de scores/leaderboard.
- Persistencia de scores/leaderboard, realtime, Edge Functions — mencionados por el usuario como visión a futuro, cada uno con su propio spec.
- Protección de rutas / redirecciones basadas en sesión en el proxy.
- `service_role` / `sb_secret_...` key — este spec solo usa la publishable key; la secret key llega cuando exista una operación de servidor que la necesite.
- Tests automatizados (no hay setup de tests en el proyecto).

## Modelo de datos

Este spec no introduce tablas ni datos persistentes (el proyecto de Supabase está vacío). Lo nuevo es el contrato de los clientes y las variables de entorno:

```ts
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient(): SupabaseClient;
// Para Client Components. Singleton interno de createBrowserClient.
```

```ts
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";

export async function createClient(): Promise<SupabaseClient>;
// Para Server Components / Server Actions / Route Handlers.
// Crea un cliente nuevo por request (usa cookies() de next/headers).
```

```ts
// lib/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse>;
// Refresca el token vía supabase.auth.getClaims() y sincroniza cookies
// request/response. No redirige ni protege rutas en este spec.
```

```ts
// proxy.ts (raíz)
export async function proxy(request: NextRequest): Promise<NextResponse>;
export const config: { matcher: string[] };
```

Variables de entorno:

| Variable                               | Dónde                                               | Contenido                                           |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `.env.local` (real) / `.env.template` (placeholder) | `https://nwduxopaviglnluuobbl.supabase.co`          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` (real) / `.env.template` (placeholder) | Publishable key (`sb_publishable_...`) del proyecto |

No se toca `app/data.ts`, `localStorage` ni `user-context.tsx`.

## Plan de implementación

1. **Dependencias y entorno.** `npm install @supabase/supabase-js @supabase/ssr`. Añadir `NEXT_PUBLIC_SUPABASE_URL=https://nwduxopaviglnluuobbl.supabase.co` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx` como placeholders a `.env.template`; pegar los valores reales (URL + publishable key ya obtenidos del proyecto) en `.env.local`. Prueba: `npm run build` sigue pasando.
2. **Cliente de navegador.** Crear `lib/supabase/client.ts` con `createClient()` (`createBrowserClient` de `@supabase/ssr`). Prueba: `npm run build` pasa; aún no se usa en ningún componente.
3. **Cliente de servidor.** Crear `lib/supabase/server.ts` con `createClient()` async (`createServerClient` + `cookies()` de `next/headers`). Prueba: `npm run build` pasa.
4. **Proxy de sesión.** Crear `lib/supabase/proxy.ts` (`updateSession`) y `proxy.ts` en la raíz que lo invoca, con el `matcher` estándar (excluye `_next/static`, `_next/image`, favicon e imágenes). Prueba: `npm run dev` arranca sin errores y toda la navegación existente (home, games, about, salón, auth) sigue funcionando igual — el proxy no redirige nada.
5. **Página de verificación.** Crear `app/debug/supabase/page.tsx` (Server Component, con comentario marcándola como temporal) que usa `lib/supabase/server.ts`, llama a `supabase.auth.getClaims()` y muestra en pantalla "CONECTADO A SUPABASE" o el mensaje de error. Prueba: visitar `/debug/supabase` muestra "conectado" sin error de red/401.
6. **Cierre.** `npm run build` sin errores ni warnings de TypeScript; `git status` confirma que `.env.local` no está versionado y que `.env.template` sí incluye los dos placeholders nuevos.

Nota para `/spec-impl`: los pasos 2–4 son código de infraestructura sin decisiones visuales; no requieren `/frontend-design`.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `@supabase/supabase-js` y `@supabase/ssr` aparecen como dependencias en `package.json`.
- [ ] Existen `lib/supabase/client.ts`, `lib/supabase/server.ts` y `lib/supabase/proxy.ts` siguiendo el patrón oficial de Supabase para Next.js App Router.
- [ ] Existe `proxy.ts` en la raíz (no `middleware.ts`) que invoca `updateSession` con el `matcher` estándar.
- [ ] `.env.template` incluye `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como placeholders; `.env.local` tiene los valores reales y no está versionado (`git status` no lo muestra).
- [ ] Visitar `/debug/supabase` muestra "CONECTADO A SUPABASE" (o el mensaje de error si algo falla), confirmando que `supabase.auth.getClaims()` responde sin error de red.
- [ ] Toda la navegación existente (home `/`, `/games`, `/games/[id]`, `/games/[id]/jugar`, `/salon`, `/about`, `/auth`) sigue funcionando igual que antes — el proxy no redirige ni bloquea ninguna ruta.
- [ ] No se crea ninguna tabla ni esquema en la base de datos (el proyecto sigue vacío al cerrar el spec).

## Decisiones

- **Sí:** spec de solo integración base (clientes + proxy + verificación), sin auth real ni datos persistentes. Auth, scores/leaderboard, realtime y Edge Functions quedan como specs futuros — decisión explícita del usuario para no mezclar demasiadas áreas en un solo spec.
- **Sí:** `@supabase/ssr` con cookies (patrón SSR oficial) en vez de solo `@supabase/supabase-js` en cliente. Permite acceso a la sesión desde Server Components, Server Actions y el proxy — necesario para los specs futuros de auth y datos.
- **Sí:** `lib/supabase/` en la raíz del proyecto (no `app/lib/supabase/`). Sigue la convención oficial de Supabase y separa infraestructura de `app/`; se referencia con el alias `@/lib/supabase/*` ya configurado.
- **Sí:** `proxy.ts` (no `middleware.ts`). Next.js 16 renombró el archivo; mismo patrón, nuevo nombre.
- **Sí:** el proxy solo refresca la sesión, sin redirigir ni proteger rutas. No hay login real todavía — la protección de rutas llega con el spec de auth.
- **Sí:** publishable key (`sb_publishable_...`) en vez de la legacy `anon` JWT. Es la recomendada para apps nuevas (mejor seguridad, rotación independiente); la `anon` sigue funcionando pero queda descartada aquí.
- **No:** `service_role` / `sb_secret_...` key en este spec. No hay ninguna operación de servidor con privilegios elevados todavía; se añade cuando un spec futuro la necesite.
- **Sí:** página temporal `/debug/supabase` como criterio de aceptación verificable, ya que el proyecto no tiene tests automatizados. Se retira cuando el spec de auth real la reemplace por un flujo de verdad.
- **No:** crear ninguna tabla o esquema en este spec. El proyecto está vacío (confirmado con `list_tables`); el esquema de datos llega con el spec que lo necesite (scores, perfiles, etc.).

## Riesgos

| Riesgo                                                                                                                                        | Mitigación                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El proxy corre en cada request que matchea (casi toda la app) y añade una llamada a Supabase (`getClaims()`) en cada una, aumentando latencia | Aceptado como parte del patrón oficial; sin RLS ni datos sensibles todavía el costo es mínimo. Si se vuelve relevante, se puede acotar el `matcher` en un spec futuro.                                          |
| `.env.local` con las credenciales reales se commitea por error                                                                                | Ya mitigado: `.gitignore` excluye `.env*` salvo `.env.template` (verificado); el paso de cierre del plan confirma con `git status` que `.env.local` no aparece.                                                 |
| La publishable key queda visible en el bundle del cliente (`NEXT_PUBLIC_*`)                                                                   | Es el diseño esperado de Supabase (la key es pública por naturaleza); la seguridad real depende de Row Level Security, que se define cuando exista una tabla — no aplica todavía porque el proyecto está vacío. |
| La página `/debug/supabase` queda olvidada y se despliega a producción                                                                        | Marcada con comentario explícito de "temporal" en el código y en este spec; su retiro queda como criterio de aceptación del spec de auth real.                                                                  |
