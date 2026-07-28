# SPEC 15 — Endurecimiento de seguridad

> **Estado:** Implementado
> **Depende de:** SPEC 03 (formulario de contacto y `sendContactEmail`), SPEC 04 (clientes `lib/supabase/*`), SPEC 13 (Supabase Auth, `profiles`, RLS de `scores`), SPEC 14 (trigger `handle_new_user` condicional y policy `profiles_insert_own`)
> **Fecha:** 2026-07-28
> **Objetivo:** Aplicar el checklist de `references/security/security-checklist.md` —cabeceras HTTP en Next, permisos de las funciones `SECURITY DEFINER`, RLS explícito y endurecido, ajustes de Auth en el dashboard y un limitador de tasa por IP sobre las cuatro Server Actions públicas— hasta dejar el advisor de seguridad de Supabase en cero.

## Alcance

**Dentro:**

- **Cabeceras de seguridad en `next.config.ts`**, aplicadas a todas las rutas vía `headers()`:
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()` y
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Migración: revocar `EXECUTE` sobre las dos funciones `SECURITY DEFINER`** de `public`
  (`handle_new_user()` y `rls_auto_enable()`) a los roles `public`, `anon` y `authenticated`.
  Cierra los cuatro warnings del advisor sin tocar el cuerpo de ninguna función.
- **RLS explícito y endurecido.** RLS ya está habilitado en `games`, `scores` y `profiles`;
  este spec lo verifica y además: (a) reescribe `games_select_public` y `scores_select_public`
  para que apunten a `anon, authenticated` en vez de al rol `public`, y (b) revoca los
  `GRANT` de `insert`, `update` y `delete` sobre `games` y `scores` que hoy siguen
  concedidos a `anon` pese a que ninguna policy los permite.
- **Ajustes en el dashboard de Supabase**, ejecutados por Tito y verificados desde aquí
  donde sea posible: longitud mínima de contraseña en 8, "Leaked password protection"
  activado, y límite de altas por hora e IP.
- **Limitador de tasa propio** en `lib/rate-limit.ts`: ventana deslizante en memoria del
  proceso, clave la IP del cliente, aplicado a las cuatro Server Actions invocables sin
  sesión — `signUpAction`, `signInAction`, `requestPasswordResetAction` y `sendContactEmail`.
- **El advisor de seguridad de Supabase en cero lints** como criterio de cierre.

**Fuera de alcance (para specs futuros):**

- **`Content-Security-Policy`**, ni siquiera en modo `Report-Only`. Es el header con criterio
  propio: exige inventariar los scripts inline de Next, las fuentes de Google, Supabase y
  Resend, y equivocarse deja el sitio en blanco. Merece su propio spec.
- **Limitador persistente o compartido entre instancias** (Upstash, tabla en Postgres). Este
  vive en memoria y se pierde al reiniciar, por decisión explícita.
- **Limitar `completeProfileAction`, `updatePasswordAction` y `signInWithProviderAction`.**
  Las dos primeras exigen sesión; la tercera solo redirige al proveedor, que ya tiene su
  propio límite.
- **Limitar el guardado de puntuaciones** ni ninguna forma de anti-trampas sobre `scores`.
  Una puntuación falsa es un problema de integridad del salón, no de seguridad, y es un
  spec entero.
- **CAPTCHA (Turnstile / hCaptcha), 2FA y verificación por SMS.** Ya estaban fuera en el SPEC 13.
- **Sacar Resend del sandbox** con un dominio verificado. Sigue siendo su propio spec.
- **Rotar claves, detección de secretos en CI o revisión del histórico de git.**
- **Borrado de cuenta y cualquier cosa que necesite `service_role`.** El proyecto no la tiene.
- **Protección de rutas en el proxy.** El sitio sigue público y jugable sin sesión.
- **URLs de producción o de LAN.** Solo `http://localhost:3000`, como los SPEC 13 y 14.
- **Cambiar `MIN_PASSWORD`.** Ya vale 8 en `app/auth/actions.ts`; este spec solo confirma
  que el dashboard coincide con el código.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

**No hay tablas nuevas.** `games`, `scores` y `profiles` se quedan exactamente como las
dejaron los SPEC 06, 13 y 14: mismas columnas, mismos índices, mismos datos. Lo que cambia
son permisos, una estructura en memoria y la configuración de Next.

### Migración: permisos de las funciones `SECURITY DEFINER`

```sql
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
```

Ninguna de las dos se pierde: `handle_new_user()` la invoca el trigger `on_auth_user_created`
y `rls_auto_enable()` el event trigger `ensure_rls`. Los triggers no consultan el permiso
`EXECUTE` del rol que provocó la operación, así que revocarlo no los afecta. Lo único que
desaparece es la ruta `/rest/v1/rpc/…`, que además nunca funcionó: PostgREST no expone
funciones que devuelven `trigger` ni `event_trigger`.

### Migración: policies con roles explícitos

```sql
alter policy games_select_public on public.games to anon, authenticated;
alter policy scores_select_public on public.scores to anon, authenticated;
```

Hoy ambas apuntan al rol `public`, que en Postgres significa _todos los roles, presentes y
futuros_. Nombrar `anon` y `authenticated` no cambia quién puede leer hoy —el sitio es
público a propósito— pero deja de conceder lectura automática a cualquier rol que se cree
mañana. `profiles_select_public` ya está bien: se creó con los dos roles nombrados.

### Migración: revocar los grants que ninguna policy usa

Los permisos por defecto de Supabase conceden **los siete** privilegios a `anon` y
`authenticated` sobre las tres tablas. RLS es lo que hoy impide el desastre. Esta migración
deja en cada tabla solo lo que alguna policy necesita de verdad:

```sql
revoke all on public.games      from anon, authenticated;
revoke all on public.scores     from anon, authenticated;
revoke all on public.profiles   from anon, authenticated;

grant select on public.games    to anon, authenticated;
grant select on public.scores   to anon, authenticated;
grant select on public.profiles to anon, authenticated;

grant insert         on public.scores   to authenticated;  -- scores_insert_own
grant insert, update on public.profiles to authenticated;  -- profiles_insert_own / _update_own
```

`TRUNCATE` es el que de verdad importa: **RLS no se aplica a `TRUNCATE`**, así que era el
único privilegio concedido que las policies no estaban conteniendo. Los demás (`INSERT`,
`UPDATE`, `DELETE`, `REFERENCES`, `TRIGGER`) sí los frenaba RLS; revocarlos es defensa en
profundidad, no un agujero que se cierre.

### `lib/rate-limit.ts` — nuevo

```ts
export interface RateLimitRule {
  limit: number; // intentos permitidos en la ventana
  windowMs: number; // tamaño de la ventana
}

/** Una regla por acción pública. Los nombres son las claves del limitador. */
export const RATE_LIMITS = {
  signUp: { limit: 5, windowMs: 60 * 60 * 1000 },
  signIn: { limit: 10, windowMs: 15 * 60 * 1000 },
  passwordReset: { limit: 3, windowMs: 60 * 60 * 1000 },
  contact: { limit: 3, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/** Mensaje único; no revela cuánto falta para poder reintentar. */
export const RATE_LIMIT_ERROR = "DEMASIADOS INTENTOS. ESPERA UNOS MINUTOS.";

/**
 * Registra un intento y dice si se permite. `true` = adelante.
 * Resuelve la IP internamente con headers(); la acción no le pasa nada del formulario.
 */
export async function checkRateLimit(action: RateLimitAction): Promise<boolean>;
```

Estructura interna, en memoria del proceso:

```ts
// Clave "<acción>:<ip>" → marcas de tiempo de los intentos aún dentro de la ventana.
const hits = new Map<string, number[]>();
```

Convenciones:

- **Ventana deslizante, no cubo fijo.** En cada llamada se descartan las marcas más viejas
  que `windowMs` y se cuenta lo que queda. Evita que alguien gaste el doble de intentos a
  caballo entre dos ventanas.
- **La IP** sale de la primera entrada de `x-forwarded-for`; si falta, de `x-real-ip`; si
  faltan las dos, de la cadena literal `"desconocida"`. Todos los clientes sin IP comparten
  cubo: es lo conservador.
- **Se cuenta el intento, no el fallo.** Un inicio de sesión correcto también consume cupo.
  Con 10 en 15 minutos nadie legítimo lo nota, y contar solo los fallos deja abierta la
  enumeración de contraseñas correctas.
- **Poda global** cuando el `Map` supera las 10 000 claves: se recorre entero y se borran
  las entradas sin marcas vivas. Sin esto, quien rote direcciones IP hace crecer el mapa
  hasta agotar la memoria — el limitador sería su propio vector de denegación de servicio.

### `next.config.ts` — cabeceras

```ts
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];
```

Se aplican con `source: "/(.*)"`, es decir a todas las rutas, incluidos los assets estáticos.

### Archivos que aparecen o cambian

| Archivo                | Qué pasa                                                                         |
| ---------------------- | -------------------------------------------------------------------------------- |
| `lib/rate-limit.ts`    | Nuevo                                                                            |
| `next.config.ts`       | +`headers()` con las cinco cabeceras                                             |
| `app/auth/actions.ts`  | `checkRateLimit` en `signUpAction`, `signInAction`, `requestPasswordResetAction` |
| `app/about/actions.ts` | `checkRateLimit` en `sendContactEmail`                                           |
| Migración Supabase     | Permisos de funciones, roles de las policies y grants de las tablas              |

## Plan de implementación

1. **Cabeceras de seguridad.** Añadir a `next.config.ts` la constante `securityHeaders` y la
   función `headers()` con `source: "/(.*)"`. Prueba: `npm run build && npm start` y
   `curl -sI http://localhost:3000/` muestra las cinco cabeceras; repetir contra `/games` y
   contra un asset de `/_next/static/` para confirmar que también las llevan. Nada visual cambia.

2. **Migración: permisos de las funciones `SECURITY DEFINER`.** `apply_migration` con los dos
   `revoke execute`. Prueba: `get_advisors` de tipo `security` pasa de cinco lints a uno —queda
   solo `auth_leaked_password_protection`, que se cierra en el paso 7—. Comprobar además que el
   alta por correo sigue creando su fila en `profiles`, que es lo que dispara el trigger.

3. **Migración: roles de las policies y grants de las tablas.** `apply_migration` con los dos
   `alter policy`, el `revoke all` y los `grant` de la sección anterior. Prueba, en este orden:
   `pg_policies` devuelve `{anon,authenticated}` en las dos policies tocadas;
   `information_schema.role_table_grants` no devuelve ninguna fila con `TRUNCATE`, `DELETE` ni
   `REFERENCES`; y en la aplicación, `/games` sigue listando los juegos, `/salon` sigue mostrando
   las puntuaciones y guardar una puntuación con sesión sigue funcionando. **Este es el paso que
   puede romper el sitio entero**: si alguna consulta necesitaba un permiso que acabamos de
   revocar, se ve aquí y no más tarde.

4. **El limitador.** Crear `lib/rate-limit.ts` con `RateLimitRule`, `RATE_LIMITS`,
   `RATE_LIMIT_ERROR`, el `Map` de marcas de tiempo, la resolución de IP, la ventana deslizante
   y la poda a partir de 10 000 claves. Prueba: `npm run build` pasa; todavía no lo llama nadie.

5. **Limitar las tres acciones de autenticación.** En `app/auth/actions.ts`, primera línea de
   `signUpAction`, `signInAction` y `requestPasswordResetAction`: si `checkRateLimit` devuelve
   `false`, devolver `fail(RATE_LIMIT_ERROR)` sin llegar a tocar Supabase. Prueba: fallar el
   inicio de sesión once veces seguidas; el intento número once muestra el mensaje del limitador
   y no el de credenciales inválidas.

6. **Limitar el formulario de contacto.** Mismo patrón al principio de `sendContactEmail`,
   devolviendo `{ ok: false, error: RATE_LIMIT_ERROR }`. Prueba: cuatro envíos seguidos desde
   `/about`; el cuarto se rechaza sin llamar a Resend (se confirma porque no llega el correo).

7. **Ajustes del dashboard de Supabase (los hace Tito).** En Authentication: subir "Minimum
   password length" a 8 si no lo está, activar "Leaked password protection" y fijar el límite de
   altas por hora e IP. Prueba: `get_advisors` de tipo `security` devuelve **cero** lints; e
   intentar registrarse con `password123` —que está en HaveIBeenPwned— es rechazado por el
   servidor, no por la validación del cliente.

8. **Prueba de extremo a extremo.** `npm run build` sin errores ni warnings de TypeScript. Con
   Playwright sobre la build de producción: entrar con una cuenta existente, guardar una
   puntuación, cerrar sesión, enviar el formulario de contacto y comprobar en las respuestas de
   red que las cinco cabeceras viajan en cada documento. Capturas en `.playwright-screenshots/`.

9. **Cierre.** Repasar los criterios de aceptación uno a uno, confirmar con `git status` y
   `git diff` que no se coló ninguna clave, y pasar el estado del spec a "Implementado" antes de
   mergear la rama.

Notas operativas para `/spec-impl`:

- **El paso 3 es el único que puede tumbar el sitio.** Va después del 2 y antes de todo lo demás
  justamente para que, si algo falla, falle con la aplicación todavía sin tocar por este spec y
  el `git revert` sea de una migración sola.
- **El limitador vive en memoria del proceso, así que reiniciar el servidor lo borra.** Es la vía
  para desatascarte durante los pasos 5, 6 y 8 si te limitas a ti mismo probando: `Ctrl-C` y
  arrancar de nuevo.
- **En desarrollo todo llega desde `::1`**, así que durante las pruebas tú eres todas las IP del
  mundo. El límite se comporta como está escrito, pero no estás probando el escenario real de
  varios clientes.
- **El paso 7 no lo puedo ejecutar ni leer**: el MCP de Supabase no expone la configuración de
  Auth. La verificación es con `get_advisors` y con el registro de prueba, no la pantalla.

## Criterios de aceptación

**Build y estructura**

- [x] `npm run build` termina sin errores ni warnings de TypeScript.
- [x] Existe `lib/rate-limit.ts` y exporta `RATE_LIMITS`, `RATE_LIMIT_ERROR` y `checkRateLimit`.
- [x] `git diff` no introduce ninguna clave ni secreto.

**Cabeceras**

- [x] `curl -sI http://localhost:3000/` devuelve las cinco cabeceras con los valores exactos
      de la sección de modelo de datos.
- [x] Las mismas cinco viajan en `/games`, `/salon`, `/auth` y en un asset de `/_next/static/`.
      Comprobado también en `/about`.
- [x] La aplicación sigue renderizando igual: no hay recursos bloqueados en la consola del
      navegador en ninguna de esas cuatro rutas (0 errores, 0 warnings).

**Base de datos**

- [ ] ~~`get_advisors` de tipo `security` devuelve **cero** lints.~~ **No alcanzable en el plan
      Free.** Quedan 0 lints de base de datos —los cuatro de `SECURITY DEFINER` se cerraron— pero
      persiste `auth_leaked_password_protection`, porque "Leaked password protection" es una
      función **solo del plan Pro en adelante**. Ver la nota al final de esta sección.
- [x] Ni `anon` ni `authenticated` conservan `TRUNCATE`, `DELETE` ni `REFERENCES` sobre
      `games`, `scores` o `profiles`:
      `select * from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')`
      no devuelve ninguna fila con esos privilegios.
- [x] Los únicos privilegios que quedan son: `SELECT` para ambos roles en las tres tablas,
      `INSERT` para `authenticated` en `scores`, e `INSERT` y `UPDATE` para `authenticated`
      en `profiles`.
- [x] `games_select_public` y `scores_select_public` tienen `roles = {anon,authenticated}`
      en `pg_policies`, no `{public}`.
- [x] RLS sigue habilitado en las tres tablas (`relrowsecurity` verdadero en `pg_class`).
- [x] Las seis policies del proyecto siguen existiendo con el mismo `qual` y `with_check`
      que antes de este spec (se capturó el baseline antes de la migración y se comparó después).

**Limitador de tasa**

- [x] El intento número 11 de inicio de sesión desde la misma IP en 15 minutos devuelve
      `RATE_LIMIT_ERROR` y no llega a llamar a `signInWithPassword`.
- [x] El intento número 6 de registro en una hora devuelve `RATE_LIMIT_ERROR`.
- [x] El cuarto envío del formulario de contacto en una hora devuelve `RATE_LIMIT_ERROR`
      y **no** llega ningún correo de esos intentos. Probado con un correo mal formado en los
      tres primeros: el limitador corre antes de la validación, así que consumen cupo sin que
      Resend llegue a invocarse nunca.
- [x] La cuarta solicitud de recuperación de contraseña en una hora devuelve `RATE_LIMIT_ERROR`.
- [x] El mensaje mostrado es idéntico en las cuatro acciones y no dice cuánto falta para
      poder reintentar.
- [x] Un inicio de sesión correcto también consume cupo. Verificado a la inversa, que es
      equivalente y no exige diez sesiones: tras **un** inicio de sesión correcto, el bloqueo
      llegó en el **décimo** intento fallido y no en el undécimo.
- [x] Reiniciar el servidor limpia el limitador y permite volver a intentar de inmediato.
      (Verifica que el estado vive solo en memoria, que es la decisión tomada.)

**Dashboard de Supabase**

- [ ] "Minimum password length" vale 8, el mismo número que `MIN_PASSWORD` en
      `app/auth/actions.ts`. **Pendiente de confirmación visual de Tito**: el MCP de Supabase no
      expone este ajuste, así que no hay forma de verificarlo desde aquí.
- [ ] ~~Registrarse con `password123` es rechazado por el servidor con el mensaje de
      contraseña comprometida, no por la validación del cliente.~~ **Bloqueado por el plan Free**
      — depende de la misma función que el lint de arriba.
- [x] El límite de altas por hora e IP está configurado: **30 por hora y por IP** (el valor por
      defecto de Supabase), en _Authentication → Rate Limits → "Rate limit for sign ups and
      sign ins"_. Queda por detrás de los umbrales propios (`signUp` 5/h, `signIn` 10/15 min),
      así que actúa de red de seguridad y no cambia los mensajes que ve el jugador.

**Nada roto de los SPEC 13 y 14**

- [x] Iniciar sesión con correo y contraseña sigue funcionando (demostrado por la fila de
      `scores` con `user_id`, que no puede existir sin sesión).
      **Cerrar sesión queda pendiente de confirmación de Tito**: la sesión se abrió en su
      navegador, no en el de Playwright, así que el logout no llegó a observarse.
- [x] Los botones GOOGLE y GITHUB siguen llevando a su proveedor y el callback sigue
      resolviendo a `/games` o a `/auth/completar-perfil`. Ambos botones llevan a
      `accounts.google.com` y `github.com/login` con `redirect_to=…/auth/callback`.
- [x] Guardar una puntuación con sesión sigue insertando la fila con su `user_id` y su
      `player_name` (`bloque-buster` · 550 · `TITOPARRA4`, con `user_id` = `profiles.id`).
- [x] `/games`, `/games/[id]` y `/salon` siguen leyendo datos sin sesión iniciada.
- [x] El formulario de contacto sigue entregando el correo en el primer envío: la acción
      devolvió `ok` y la pantalla mostró `> MENSAJE RECIBIDO.`, es decir que Resend aceptó el
      envío sin error. Falta que Tito confirme la recepción en su bandeja.

### Nota de cierre: el lint que queda y por qué

"Leaked password protection" **solo está disponible en el plan Pro en adelante**
([docs](https://supabase.com/docs/guides/auth/password-security)), y el proyecto sigue en Free
por decisión de Tito. El advisor de seguridad queda por tanto en **un lint**, no en cero:

    auth_leaked_password_protection — Leaked Password Protection Disabled

No es implementación pendiente ni configuración mal puesta: es una palanca que no existe en el
plan contratado. Los otros cuatro lints del advisor —los `SECURITY DEFINER` expuestos vía
`/rest/v1/rpc/…`— sí se cerraron en el paso 2. El día que el proyecto pase a Pro, cerrarlo es
activar la casilla en _Authentication → Sign In / Providers → Email_; no hay código que tocar.

Mitigación vigente mientras tanto: `MIN_PASSWORD` = 8 en `app/auth/actions.ts`, el mismo mínimo
en el dashboard, el límite de altas de Supabase (30/h/IP) y el limitador propio de este spec
(`signUp` 5/h por IP).

### Nota de cierre: qué quedó fuera del rastro de migraciones

El paso 2 se aplicó con `apply_migration` y figura como
`20260728105418_spec15_revoke_execute_security_definer_functions`. El paso 3 —los dos
`alter policy`, el `revoke all` y los `grant`— lo ejecutó Tito a mano en el SQL Editor porque la
llamada automática fue bloqueada, así que **el estado de la base es el correcto pero no hay
entrada de migración para ese cambio**. Todo su SQL es idempotente y está transcrito literalmente
en la sección "Modelo de datos" de este spec, que es de dónde habría que recuperarlo si algún día
se reconstruye el proyecto desde cero.

## Decisiones

**Cabeceras**

- **Sí:** los tres del checklist más `Permissions-Policy` y `Strict-Transport-Security`. Son
  declarativos y el sitio no usa cámara, micrófono ni geolocalización, así que denegarlas no
  puede romper nada.
- **Sí:** `HSTS` con `preload`, aun sabiendo que en `localhost` el navegador la ignora por no
  haber HTTPS. Se pone ahora para que el día del despliegue ya esté. La cola larga es que salir
  de la lista de precarga tarda meses, y se acepta.
- **No:** `Content-Security-Policy`, ni siquiera en `Report-Only`. Es el único header con
  criterio propio: exige inventariar los scripts inline de Next, las fuentes de Google, Supabase
  y Resend. Equivocarse deja el sitio en blanco, y eso no puede colarse dentro de un spec cuyo
  otro 80% es trivial.
- **Sí:** aplicarlos con `source: "/(.*)"`, assets estáticos incluidos. Excluirlos sería
  optimizar bytes a cambio de una regla más difícil de auditar.

**Permisos de Postgres**

- **Sí:** revocar `EXECUTE` sobre `handle_new_user()` y `rls_auto_enable()`. Cuesta dos líneas,
  no afecta a los triggers —que no consultan `EXECUTE` del rol que provocó la operación— y deja
  el advisor en cero.
- **No:** cambiarlas a `SECURITY INVOKER`, que es la otra remediación que sugiere el linter.
  `handle_new_user()` **necesita** `SECURITY DEFINER` para escribir en `profiles` desde el alta
  en `auth.users`; cambiarla rompería el registro por correo del SPEC 13.
- **No:** moverlas a un esquema fuera de la API, la tercera remediación. Obligaría a reescribir
  los dos triggers a cambio de nada que el `revoke` no consiga.
- **Sí:** revocar los grants que ninguna policy usa, `profiles` incluida. `TRUNCATE` es el
  motivo real: **RLS no se aplica a `TRUNCATE`**, así que era el único privilegio concedido que
  las policies no estaban conteniendo. Los demás son defensa en profundidad.
- **Sí:** `revoke all` seguido de `grant` explícito, en vez de listar privilegio a privilegio lo
  que hay que quitar. No depende de cuáles estén concedidos hoy y se lee como una declaración
  del estado final deseado.
- **Sí:** roles nombrados (`anon, authenticated`) en las policies en vez del rol `public`. No
  cambia quién lee hoy, pero deja de conceder lectura automática a cualquier rol futuro.
- **No:** tocar `alter default privileges`. Haría que las tablas futuras nacieran sin grants y
  se convertiría en una trampa silenciosa para el siguiente spec que cree una tabla. Queda
  anotado en riesgos.

**Limitador de tasa**

- **Sí:** meterlo en este spec aunque el checklist solo pedía el límite de altas del dashboard.
  Decisión de Tito. El de Supabase cubre el registro; las otras tres acciones públicas quedaban
  sin nada.
- **Sí:** `Map` en memoria del proceso. Cero dependencias, cero tablas, cero variables de
  entorno. Se pierde al reiniciar y no se comparte entre instancias, y hoy eso da igual: el
  proyecto corre en una sola instancia. Un límite imperfecto que existe vale más que uno
  perfecto que no.
- **No:** tabla `rate_limits` en Supabase. Se escribiría con la clave publicable, es decir que
  el propio atacante podría escribir en ella y falsear el contador. Sin `service_role` no hay
  forma de cerrarlo.
- **No:** Upstash Redis. Es lo correcto de verdad y lo que se usaría en producción, pero añade
  dependencia, cuenta externa y dos variables de entorno para un sitio que hoy solo corre en
  `localhost`.
- **Sí:** las cuatro acciones públicas, no solo el registro. `sendContactEmail` es la más
  abusable de todas —envía correo real por Resend sin sesión y su propio comentario admite que
  es invocable fuera del formulario— y dejarla fuera habiéndola encontrado sería absurdo.
- **Sí:** clave solo la IP. Con la clave por correo, la diferencia de respuesta entre un correo
  limitado y uno no limitado sería un canal de enumeración de cuentas.
- **Sí:** contar el intento, no el fallo. Contar solo fallos deja abierta la enumeración de
  contraseñas correctas. Con 10 cada 15 minutos nadie legítimo lo nota.
- **Sí:** ventana deslizante en vez de cubo fijo. Con cubos fijos se gasta el doble de intentos
  a caballo entre dos ventanas.
- **Sí:** un mensaje único que no dice cuánto falta. Decir el tiempo exacto le regala al
  atacante el calendario para automatizar.
- **Sí:** poda global del `Map` a partir de 10 000 claves. Sin ella, rotar direcciones IP hace
  crecer el mapa sin techo y el limitador se convierte en su propio vector de denegación de
  servicio.
- **No:** limitar `completeProfileAction` ni `updatePasswordAction`. Exigen sesión.
- **No:** limitar el guardado de puntuaciones. Es integridad del salón, no seguridad, y da para
  un spec entero.

**Alcance**

- **Sí:** un solo spec para las cuatro áreas, aun rozando el límite de tamaño. El checklist es
  una unidad y partirlo daría cuatro specs de dos pasos.
- **Sí:** dejar los pasos de dashboard dentro del plan aunque no se puedan automatizar. Son tres
  de los cinco ítems del checklist: fuera, el spec quedaría vacío.
- **No:** tocar `MIN_PASSWORD`. Ya vale 8; lo que faltaba era confirmar que el dashboard coincide.

## Riesgos

| Riesgo                                                                                                                                                                                                                                | Mitigación                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El paso 3 revoca grants sobre las tres tablas. Si alguna consulta del sitio dependía de un privilegio que ninguna policy declara, deja de funcionar de golpe y en producción.                                                         | El paso 3 va solo en su commit y antes de todo el código nuevo, así que revertirlo es revertir una migración. Su prueba recorre `/games`, `/salon` y el guardado de una puntuación antes de dar el paso por bueno.                                                                      |
| Los permisos por defecto de Supabase (`alter default privileges`) siguen vigentes: **la próxima tabla que se cree nacerá otra vez con los siete privilegios** para `anon` y `authenticated`.                                          | Se decidió no tocar las default privileges para no convertirlas en una trampa silenciosa. Queda escrito aquí y en las decisiones: el spec que cree la siguiente tabla debe repetir el `revoke all` + `grant`. El event trigger `ensure_rls` al menos le habilitará RLS automáticamente. |
| El limitador vive en la memoria de un proceso. En un despliegue sin servidor —Vercel, por ejemplo— cada instancia tiene su propio `Map`, así que el límite real es el configurado **multiplicado por el número de instancias vivas**. | Asumido y explícito. Hoy el proyecto corre en una sola instancia en `localhost`. El día del despliegue, este es el primer punto a revisar, y la salida es cambiar la implementación de `lib/rate-limit.ts` sin tocar a sus cuatro llamantes.                                            |
| **`x-forwarded-for` la puede falsificar el cliente** si no hay un proxy de confianza delante que la reescriba. Un atacante que rote el valor de esa cabecera se salta el limitador por completo.                                      | Honestidad por delante: este limitador frena el abuso casual y los bucles tontos, no a alguien decidido. Detrás de Vercel o Cloudflare la cabecera sí es de confianza y el límite pasa a valer de verdad.                                                                               |
| Varias personas detrás de la misma IP —una oficina, un NAT móvil— comparten cupo. Tres solicitudes de recuperación por hora se agotan rápido en una red compartida.                                                                   | Los umbrales de las acciones que más molestarían al equivocarse son los más generosos (10 inicios de sesión cada 15 minutos). Recuperación y contacto son acciones que nadie legítimo repite cuatro veces en una hora.                                                                  |
| En desarrollo todas las peticiones llegan desde `::1`, así que probando te limitas a ti mismo y no estás ejercitando el escenario real.                                                                                               | Reiniciar el servidor vacía el `Map`. Queda anotado en las notas operativas del plan.                                                                                                                                                                                                   |
| `X-Frame-Options: DENY` impide embeber el sitio en un `iframe` **desde cualquier origen, incluido el propio**. Si algún día se quiere ofrecer un juego embebible en otra página, esta cabecera lo bloquea.                            | No hay ningún `iframe` en el proyecto hoy. Si esa necesidad aparece, la salida es sustituirla por `frame-ancestors` en la CSP —que es su reemplazo moderno— dentro del spec de CSP que este deja fuera.                                                                                 |
| `HSTS` con `preload` es difícil de revertir: entrar en la lista de precarga de los navegadores es rápido y salir tarda meses. Un subdominio futuro servido por HTTP plano quedaría inalcanzable.                                      | Decisión tomada a sabiendas. El sitio no tiene subdominios y no se prevé servir nada por HTTP plano.                                                                                                                                                                                    |
| "Leaked password protection" solo actúa al registrarse o al cambiar la contraseña. **Las cuentas que ya existen con una contraseña comprometida siguen igual** después de activarlo.                                                  | Es el comportamiento de Supabase, no un fallo de configuración. Forzar el cambio a las cuentas existentes necesitaría `service_role` y una campaña de correos: otro spec, si alguna vez importa.                                                                                        |
| La poda del `Map` a partir de 10 000 claves recorre el mapa entero dentro de la petición que la dispara, así que esa petición concreta paga el barrido.                                                                               | Solo ocurre bajo un ataque de rotación de IP, que es justo cuando la latencia de una petición es lo de menos. Con tráfico normal el mapa nunca se acerca a ese tamaño.                                                                                                                  |

## Qué **no** está en este spec

- `Content-Security-Policy`, ni bloqueante ni en `Report-Only`. Es su propio spec.
- Limitador de tasa persistente o compartido entre instancias (Upstash, tabla en Postgres).
- Limitar `completeProfileAction`, `updatePasswordAction` ni `signInWithProviderAction`.
- Limitar el guardado de puntuaciones o cualquier forma de anti-trampas sobre `scores`.
- CAPTCHA, 2FA y verificación por SMS. Ya estaban fuera desde el SPEC 13.
- Cambiar `alter default privileges`: las tablas futuras seguirán naciendo con los grants
  por defecto de Supabase.
- Sacar Resend del sandbox con un dominio verificado.
- Rotar claves, detección de secretos en CI o revisión del histórico de git.
- Borrado de cuenta ni nada que necesite `service_role`.
- Protección de rutas en el proxy. El sitio sigue público y jugable sin sesión.
- URLs de producción o de LAN. Solo `http://localhost:3000`.
- Tests.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
