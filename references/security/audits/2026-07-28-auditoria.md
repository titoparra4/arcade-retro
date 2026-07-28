# Auditoría de seguridad — 2026-07-28

> **Alcance:** repo local, `http://localhost:3000` (build de producción) y el proyecto de Supabase.
> **Contrato:** SPEC 15 (`specs/15-endurecimiento-seguridad.md`, Implementada) + `references/security/security-checklist.md`.
> **Rama auditada:** `spec-15-endurecimiento-seguridad` (cambios de la SPEC 15 todavía sin commitear).
> **Auditoría anterior:** ninguna. Esta es la primera, así que **no hay deriva que medir**: sirve de baseline.

## 1 · Veredicto

**No hay nada crítico ni alto.** Los diez controles de la SPEC 15 siguen en pie y se verificaron
uno a uno, incluida la prueba desde fuera con la clave publicable. Quedan **tres hallazgos**, el
más serio de severidad **Media** y ninguno explotable contra la base de datos.

## 2 · Hallazgos

| #   | Severidad | Área | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidencia                                                                                                         | Arreglo propuesto                                                                                                                                                                                                                       |
| --- | --------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Medio** | App  | `next` fijado en **16.2.10**, con 9 advisories publicados (severidad _high_). Los relevantes para este proyecto: _Unauthenticated disclosure of internal Server Function endpoints_ (GHSA-955p-x3mx-jcvp), _DoS in App Router using Server Actions_ (GHSA-m99w-x7hq-7vfj), _Proxy bypass con Turbopack_ (GHSA-6gpp-xcg3-4w24) y _Cache confusion of response bodies_ (GHSA-68g3-v927-f742 / GHSA-4633-3j49-mh5q). El proyecto usa Server Actions públicas, Turbopack y `proxy.ts`, así que las cuatro tocan superficie real. | `npm audit --omit=dev` → 3 high; `package.json:next = "16.2.10"`; el arreglo es `16.2.12`, `isSemVerMajor: false` | Subir a `next@16.2.12` (parche, sin cambio mayor) y volver a correr `npm run build`. Ver §5.1                                                                                                                                           |
| 2   | **Bajo**  | BD   | Lint **nuevo** del advisor de rendimiento que la SPEC 15 no dejó en su baseline: `scores.user_id` tiene FK a `auth.users` **sin índice de cobertura**.                                                                                                                                                                                                                                                                                                                                                                       | `get_advisors type=performance` → `unindexed_foreign_keys` en `scores_user_id_fkey`                               | Es rendimiento, **no** seguridad práctica: ninguna policy filtra por `scores.user_id` (`scores_select_public` es `qual = true` y `scores_insert_own` solo usa `with_check`), así que RLS no lo evalúa por fila. Índice opcional en §5.2 |
| 3   | **Bajo**  | Repo | `.AGENTS.md.swp` (fichero swap de vim) está sin seguir en la raíz, y `.gitignore` **no** cubre `*.swp`. No contiene secretos —es swap de `AGENTS.md`— pero un swap de un fichero que sí los tuviera acabaría commiteado.                                                                                                                                                                                                                                                                                                     | `git status --short` → `?? .AGENTS.md.swp`; `grep -nE 'swp\|swo' .gitignore` → sin coincidencias                  | Borrar el fichero y añadir `*.swp` / `*.swo` a `.gitignore`                                                                                                                                                                             |

**Riesgos ya aceptados por la SPEC 15:** ninguno ha empeorado. Se confirmó además que el bypass
de `x-forwarded-for` **sigue siendo real y sigue estando dentro de lo asumido** (ver §3).

## 3 · Verificado y correcto

### Base de datos

- **Advisor de seguridad: un solo lint**, `auth_leaked_password_protection` — exactamente el
  baseline esperado. Los cuatro de `SECURITY DEFINER` siguen cerrados.
- **RLS habilitado en las tres tablas** (`games`, `scores`, `profiles`; `relrowsecurity = true`).
  No apareció ninguna tabla nueva — `list_tables` devuelve las tres de siempre.
- **Las seis policies siguen intactas**, con los roles nombrados y no `public`:

  | tabla      | policy                   | roles                  | cmd    |
  | ---------- | ------------------------ | ---------------------- | ------ |
  | `games`    | `games_select_public`    | `{anon,authenticated}` | SELECT |
  | `scores`   | `scores_select_public`   | `{anon,authenticated}` | SELECT |
  | `scores`   | `scores_insert_own`      | `{authenticated}`      | INSERT |
  | `profiles` | `profiles_select_public` | `{anon,authenticated}` | SELECT |
  | `profiles` | `profiles_insert_own`    | `{authenticated}`      | INSERT |
  | `profiles` | `profiles_update_own`    | `{authenticated}`      | UPDATE |

  No hay ninguna policy `delete` en `scores` (correcto), ninguna `using (true)` sobre escritura, y
  todos los `auth.uid()` van envueltos en `(select …)`.

- **`profiles_update_own` tiene `with_check = null`** — se revisó por ser el patrón que suele ser
  hallazgo, y **no lo es aquí**: Postgres reutiliza la expresión `USING` como `WITH CHECK` cuando
  esta se omite, y además `profiles.id` es a la vez PK y FK a `auth.users`, así que mover la fila
  a otro usuario chocaría con una de las dos restricciones. _Razonado, no explotado._
- **Grants exactamente los nueve esperados**, ni uno más. Sin `TRUNCATE`, `DELETE` ni `REFERENCES`:
  `SELECT` para ambos roles en las tres tablas · `INSERT` para `authenticated` en `scores` ·
  `INSERT` + `UPDATE` para `authenticated` en `profiles`.
- **Funciones `SECURITY DEFINER`**: `handle_new_user()` (`search_path=""`) y `rls_auto_enable()`
  (`search_path=pg_catalog`), ambas con `search_path` fijado y con `EXECUTE` revocado a `anon`,
  `authenticated` y `public` (los tres `has_function_privilege` en `false`).
- **Ninguna vista** en `public`, así que no hay superficie de puenteo de RLS por `security_invoker`.
- **`list_migrations`**: las seis conocidas, la última `20260728105418_spec15_revoke_execute_…`.
  Sigue sin haber entrada para el paso 3 de la SPEC 15 (se aplicó a mano) — es lo documentado.

### Comprobación desde fuera, con la clave publicable (el ángulo del atacante)

`curl` directo contra `/rest/v1/…` con la cabecera `apikey`, sin pasar por la interfaz:

| Intento                                      | Resultado                         | Veredicto                        |
| -------------------------------------------- | --------------------------------- | -------------------------------- |
| `GET /rest/v1/games`                         | `200`                             | Correcto, el catálogo es público |
| `GET /rest/v1/scores`                        | `200`                             | Correcto, el salón es público    |
| `POST /rest/v1/scores` (puntuación falsa)    | `401` · `42501 permission denied` | **Bloqueado**                    |
| `POST /rest/v1/profiles`                     | `401` · `42501`                   | **Bloqueado**                    |
| `PATCH /rest/v1/profiles` (renombrar a otro) | `401` · `42501`                   | **Bloqueado**                    |
| `DELETE /rest/v1/scores?score=gt.0`          | `401` · `42501`                   | **Bloqueado**                    |
| `POST /rest/v1/rpc/handle_new_user`          | `404` · `PGRST202`                | No existe en la API              |
| `POST /rest/v1/rpc/rls_auto_enable`          | `401` · permiso denegado          | **Bloqueado**                    |

Detalle que confirma que la SPEC 15 hizo lo correcto: los rechazos llegan como `42501`
(**permiso denegado a nivel de grant**), no como violación de RLS. Es decir, la capa de grants
corta antes incluso de que RLS entre a opinar. Defensa en profundidad funcionando.

### Aplicación

- **Secretos: limpio.** El único `.env*` seguido es `.env.template`, y solo contiene marcadores
  (`re_xxxxxxxx`, `sb_publishable_xxxxx`). `.env.local` **nunca** estuvo en el historial
  (`git log -- .env.local` sale vacío). `.gitignore` mantiene `.env*` + `!.env.template`. El
  `git grep` de patrones de clave solo acierta en prosa de los specs, nunca en un valor real.
  El `git diff` pendiente no introduce ninguna clave.
- **Frontera cliente/servidor: correcta.** `process.env.RESEND_API_KEY` aparece solo en
  `app/about/actions.ts:38`, que es `"use server"`. Los demás `process.env` son `NEXT_PUBLIC_*`.
  Ni `lib/supabase/server.ts` ni `lib/supabase/proxy.ts` se importan desde ningún `"use client"`
  (sus 6 importadores son Server Components, Server Actions y Route Handlers).
- **Server Actions** — las siete exportadas, con sus cuatro preguntas respondidas:

  | Acción                       | ¿Sesión?                                                            | ¿Valida en servidor?                         | ¿Límite de tasa?                                                                              | ¿Filtra en errores?                      |
  | ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
  | `signUpAction`               | No (pública, correcto)                                              | `PLAYER_NAME_RE`, `EMAIL_RE`, `MIN_PASSWORD` | **Sí**, `actions.ts:68`, primera línea                                                        | No — mensajes genéricos                  |
  | `signInAction`               | No (pública)                                                        | Campos obligatorios                          | **Sí**, `actions.ts:131`, primera línea                                                       | No — mismo mensaje exista o no la cuenta |
  | `requestPasswordResetAction` | No (pública)                                                        | `EMAIL_RE`                                   | **Sí**, `actions.ts:265`, primera línea                                                       | No — «SI HAY UNA CUENTA CON …»           |
  | `sendContactEmail`           | No (pública)                                                        | Campos + `EMAIL_RE`                          | **Sí**, `about/actions.ts:25`, primera línea                                                  | No — `GENERIC_ERROR`                     |
  | `signInWithProviderAction`   | No                                                                  | Lista blanca `OAUTH_PROVIDERS`               | No — fuera de alcance por la SPEC 15 (solo redirige al proveedor, que tiene su propio límite) | No                                       |
  | `completeProfileAction`      | **Sí** — el `id` sale de `auth.getUser()`, **nunca del `FormData`** | `PLAYER_NAME_RE` + unique de la tabla        | No — exige sesión (fuera de alcance)                                                          | No                                       |
  | `updatePasswordAction`       | **Sí** — `auth.getUser()`                                           | `MIN_PASSWORD` + confirmación                | No — exige sesión (fuera de alcance)                                                          | No                                       |

  El `checkRateLimit` sigue siendo **literalmente la primera línea** en las cuatro públicas: ninguna
  validación se ha colado por delante.

- **Route Handlers de auth: sin redirección abierta.** `app/auth/callback/route.ts` y
  `app/auth/confirm/route.ts` **no leen ningún `?next=`**: los seis destinos posibles están
  escritos en el código (`/auth?error=oauth`, `/auth?error=enlace`, `/auth/completar-perfil`,
  `/auth/nueva-contrasena`, `/games`). Los fallos caen en `/auth?error=…` sin reventar, y los
  `console.error` registran `error.message`, nunca el `code` ni el `token_hash`.
- **Cabeceras: las cinco viajan de verdad**, con los valores exactos de la SPEC 15, verificadas
  contra la build de producción en `/`, `/games`, `/salon`, `/auth`, `/about` **y** en
  `/_next/static/chunks/10qk6v6416kh8.js`. No es lectura de `next.config.ts`: es `curl -sI`.
- **Limitador de tasa, ejercitado de verdad** (no leído):
  - `signIn` con el formulario real de `/auth`: los intentos 1–10 devuelven
    `CREDENCIALES INVÁLIDAS`, y el **11 y el 12** devuelven `DEMASIADOS INTENTOS. ESPERA UNOS
MINUTOS.` Corta exactamente donde dice `RATE_LIMITS.signIn.limit = 10`.
  - `contact` invocada **por HTTP directo, saltándose el formulario** (con la cabecera
    `Next-Action`): los intentos 1–3 pasan a la validación, el **4 y el 5** devuelven el mensaje del
    limitador. Se usó un correo mal formado, así que Resend no llegó a invocarse ni una vez y **no
    se envió ningún correo** durante la auditoría.
  - **El mensaje es idéntico en ambas acciones y no dice cuánto falta** — es la misma constante
    `RATE_LIMIT_ERROR` importada en los dos ficheros.
  - La poda a partir de `MAX_KEYS = 10_000` sigue en `lib/rate-limit.ts:86`.
  - **Enumeración de cuentas: no hay.** Un correo inexistente devuelve el mismo
    `CREDENCIALES INVÁLIDAS` que una contraseña equivocada.
- **`x-forwarded-for` sigue siendo falsificable — riesgo asumido, confirmado.** Con el cubo de
  `::1` ya agotado, un `POST` con `x-forwarded-for: 203.0.113.77` pasa el limitador y llega a la
  validación (`200`, `{"ok":false,"error":"NO SE PUDO TRANSMITIR…"}`). Es exactamente lo que la
  SPEC 15 documentó: frena el abuso casual, no a alguien decidido. **No es un hallazgo nuevo**,
  pero conviene tenerlo medido para el día del despliegue.
- **Confianza en el cliente: contenida.** `game-player.tsx:85` inserta en `scores` desde el
  navegador con `game_id`, `player_name`, `score` y `user_id`, y la policy `scores_insert_own`
  sigue exigiendo `user_id = (select auth.uid())` **y** que `player_name` coincida con el del
  perfil. Guardar con el nombre de otro es imposible. Que la **puntuación** sea falsificable es
  integridad del salón, no seguridad: fuera de alcance (candidato a spec, §6).
- **XSS: sin superficie.** Cero `dangerouslySetInnerHTML`, cero `eval(`, cero `new Function(` en
  `app/` y `lib/`. React escapa el resto.
- **Proxy y sesión: correctos.** El `matcher` de `proxy.ts` solo excluye estáticos e imágenes, así
  que toda ruta de página refresca sesión. `updateSession` reconstruye `NextResponse.next({ request })`
  dentro de `setAll` y propaga las cookies a la respuesta — el patrón correcto de `@supabase/ssr`.
- **`npm run build` pasa** sin errores ni warnings de TypeScript.

## 4 · Qué NO se pudo verificar

- **La configuración de Auth del dashboard de Supabase.** El MCP no la expone. Siguen sin
  confirmar desde aquí: **"Minimum password length" = 8** (el código usa `MIN_PASSWORD = 8`, pero
  que el dashboard coincida es cosa de Tito) y el **límite de altas por hora e IP** (la SPEC 15
  anota 30/h/IP, valor por defecto). No se dan por buenos: **quedan sin verificar**.
- **`auth_leaked_password_protection`** sigue en WARN. Es del plan Pro y el proyecto está en Free:
  no es configuración mal puesta, es una palanca inexistente. Riesgo aceptado, sin cambios.
- **El escenario real de varias IP.** En `localhost` todo llega desde `::1`; lo más cerca que se
  llegó fue falsificando `x-forwarded-for`, que es justo lo que demuestra el límite del limitador.
- **Cerrar sesión y la entrega real del correo de contacto** no se ejercitaron: habrían necesitado
  credenciales de una cuenta real y mandar correo de verdad. No se tocó ninguna de las dos cosas.

## 5 · Arreglos propuestos (escritos, **sin aplicar**)

### 5.1 · Hallazgo 1 — subir Next a 16.2.12

```bash
npm install next@16.2.12
npm run build          # debe pasar sin errores ni warnings de TypeScript
npm start              # y volver a comprobar las cinco cabeceras con curl -sI
```

Es un salto de parche (`16.2.10` → `16.2.12`, `isSemVerMajor: false`) y arrastra consigo los
`postcss` y `sharp` parcheados. Conviene repasar después
`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` por si el parche tocó algo
de `proxy.ts` o de Server Actions.

Sobre las dos dependencias transitivas, para no inflar el hallazgo: **`postcss` es de tiempo de
build** (Tailwind v4) y **`sharp` solo entra por la API de optimización de imágenes**, que este
proyecto no usa (`next/image` no aparece en `app/` ni en `lib/`). Ninguna de las dos está hoy en
la ruta de una petición; el motivo real para actualizar es `next` en sí.

### 5.2 · Hallazgo 2 — índice de cobertura para la FK (opcional)

```sql
create index if not exists scores_user_id_idx on public.scores (user_id);
```

Migración sugerida: `add_scores_user_id_index`. **No la apliqué**: es rendimiento, no seguridad, y
con 18 filas en `scores` no cambia nada medible hoy. Vale la pena cuando la tabla crezca o cuando
llegue una consulta del tipo «mis puntuaciones».

### 5.3 · Hallazgo 3 — limpiar el swap de vim

```bash
rm .AGENTS.md.swp
```

Y añadir a `.gitignore`:

```gitignore
# vim swap files
*.swp
*.swo
```

## 6 · Candidatos a spec nueva

Ninguno **nuevo**. Siguen pendientes los que la propia SPEC 15 dejó fuera y que este informe no
tiene motivo para reabrir: **CSP** (el más valioso de los tres), **anti-trampas sobre `scores`** y
**sacar Resend del sandbox**.

## 7 · Baseline para la próxima auditoría

Lo que debe seguir igual la próxima vez. Cualquier desvío es hallazgo:

- Advisor de seguridad: **1 lint** (`auth_leaked_password_protection`, plan Free).
- Advisor de rendimiento: **1 lint** (`unindexed_foreign_keys`) — o **0** si se aplica §5.2.
- **3 tablas**, todas con RLS; **6 policies** con los roles de la tabla de §3.
- **9 filas de grants**, sin `TRUNCATE`, `DELETE` ni `REFERENCES`.
- **2 funciones `SECURITY DEFINER`**, ambas con `search_path` fijado y `EXECUTE` revocado a los tres roles.
- **0 vistas** en `public`.
- **6 migraciones**, la última `20260728105418`.
- **4 Server Actions públicas** con `checkRateLimit` en su primera línea.
- **5 cabeceras** en toda ruta, assets incluidos.
- Único `.env*` seguido: `.env.template`.
