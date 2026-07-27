# SPEC 13 — Autenticación real con Supabase

> **Estado:** Implementado
> **Depende de:** SPEC 04 (clientes `lib/supabase/*` y `proxy.ts`), SPEC 06 (tabla `scores` y flujo de guardado en `game-player.tsx`), SPEC 01 (pantalla `/auth` y layout de la nav)
> **Fecha:** 2026-07-27
> **Objetivo:** Reemplazar la autenticación simulada de `localStorage` por Supabase Auth con email y contraseña —registro con confirmación por correo, inicio y cierre de sesión, recuperación de contraseña y tabla `profiles` con `player_name` único— de modo que guardar una puntuación exija sesión iniciada.

## Alcance

**Dentro:**

- **Registro** (`/auth`, pestaña CREAR CUENTA) con los tres campos de la maqueta: usuario (`player_name`), correo y contraseña. Llama a `supabase.auth.signUp` con `player_name` en `options.data`.
- **Confirmación por correo.** Supabase envía el enlace; se verifica en un Route Handler nuevo `app/auth/confirm/route.ts` que llama a `verifyOtp` y redirige. Es el primer `route.ts` del proyecto.
- **Inicio de sesión** (`/auth`, pestaña INICIAR SESIÓN) con correo y contraseña vía `signInWithPassword`. El campo "Usuario" de la maqueta se sustituye por "Correo electrónico" en esta pestaña.
- **Cierre de sesión** real desde la nav: `signOut()` de Supabase, que limpia las cookies de sesión.
- **Recuperación de contraseña**: `/auth/recuperar` pide el correo (`resetPasswordForEmail`) y `/auth/nueva-contrasena` establece la contraseña nueva (`updateUser`) usando la sesión de recuperación.
- **Tabla `profiles`** en Supabase: `id` (FK a `auth.users`), `player_name` **único** (1–10 caracteres), `created_at`. Se rellena con un trigger `handle_new_user` al crearse el usuario.
- **`scores.user_id`** (uuid, nullable, FK a `auth.users`) y cambio de RLS: el `insert` pasa de público a solo `authenticated`, exigiendo `user_id = auth.uid()` y que `player_name` coincida con el del perfil.
- **`user-context.tsx` reescrito**: el usuario viene de la sesión de Supabase (valor inicial desde el layout servidor + `onAuthStateChange` en cliente), no de `localStorage`. Deja de escribir `av_user` y borra la clave vieja si existe.
- **`game-player.tsx`**: se elimina el input editable de nombre. Con sesión, guarda con el `player_name` del perfil y el `user_id`. Sin sesión, el modal muestra un enlace a `/auth` en lugar del botón GUARDAR PUNTUACIÓN.
- **`hall-of-fame.tsx`**: resalta la fila propia comparando contra el `player_name` del perfil autenticado.
- **Estados de error visibles** en `/auth`: credenciales inválidas, correo ya registrado, nombre de jugador ocupado, cuenta sin confirmar, contraseña demasiado corta.
- **Retirar `app/debug/supabase/page.tsx`**, marcada como temporal en la SPEC 04.
- **Configuración en el dashboard de Supabase**: activar "Confirm email" y fijar `http://localhost:3000` como Site URL y Redirect URL.

**Fuera de alcance (para specs futuros):**

- **OAuth con Google y GitHub** — es el SPEC 14. Los dos botones de `/auth` se mantienen visibles pero inertes, como hoy.
- Editar el `player_name` después del registro.
- Borrar la cuenta (necesitaría la clave `service_role`, que el proyecto no tiene).
- Página de perfil o "mis puntuaciones".
- Protección de rutas en el proxy: todo el sitio sigue público y se puede jugar sin sesión. El proxy sigue solo refrescando la sesión.
- Ligar la skin (`av_skin`) al perfil: sigue siendo preferencia anónima del navegador.
- Migrar las 16 puntuaciones anónimas ya guardadas a una cuenta: se quedan con `user_id` nulo y siguen apareciendo en el salón.
- URLs de redirección de producción o de LAN (`192.168.1.13:3000`): solo `localhost` por ahora.
- Verificación por SMS, 2FA, captcha o rate limiting propio.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

### Tabla nueva: `profiles`

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null unique
    check (player_name ~ '^[A-Z0-9_-]{1,10}$'),
  created_at timestamptz not null default now()
);
```

`player_name` se almacena **siempre en mayúsculas** (el formulario lo normaliza antes de enviarlo), así que el `unique` de Postgres basta para la unicidad — no hace falta índice funcional sobre `lower()`.

### Trigger de creación del perfil

```sql
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, player_name)
  values (new.id, new.raw_user_meta_data->>'player_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

El trigger corre dentro de la transacción del `insert` en `auth.users`: si el nombre está ocupado, la violación de `unique` **aborta el registro completo** y no queda un usuario huérfano sin perfil.

### RLS de `profiles`

```sql
alter table public.profiles enable row level security;

create policy profiles_select_public on public.profiles
  for select to anon, authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()));
```

Lectura pública: los `player_name` ya son públicos en el salón, y el registro necesita comprobar disponibilidad. No hay policy de `insert` — solo el trigger `security definer` escribe.

### Cambios en `scores`

```sql
alter table public.scores
  add column user_id uuid references auth.users(id) on delete set null;

drop policy scores_insert_public on public.scores;

create policy scores_insert_own on public.scores
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and player_name = (select player_name from public.profiles where id = (select auth.uid()))
  );
```

`scores_select_public` no se toca. Las 16 filas existentes conservan `user_id` nulo y siguen visibles en el salón y en `/games/[id]`.

### Contrato de TypeScript

```ts
// lib/supabase/profiles.ts (nuevo)
export interface Profile {
  id: string; // = auth.users.id
  playerName: string; // player_name, mayúsculas, 1–10
}

export async function getProfile(): Promise<Profile | null>; // servidor, sesión actual
export async function isPlayerNameTaken(name: string): Promise<boolean>;
```

```ts
// app/components/user-context.tsx (reescrito)
export interface User {
  id: string;
  email: string;
  name: string; // player_name del perfil
}

interface UserContextValue {
  user: User | null; // null = sin sesión
  loading: boolean; // true hasta resolver la sesión en cliente
  signOut: () => Promise<void>;
  skin: SkinId; // sin cambios: sigue en localStorage["av_skin"]
  setSkin: (s: SkinId) => void;
}
// Ya no existe `login`: el inicio de sesión pasa por Server Actions.
// `UserProvider` recibe `initialUser` desde `app/layout.tsx` (Server Component)
// y se suscribe a `onAuthStateChange` para reaccionar a login/logout.
```

```ts
// app/auth/actions.ts (nuevo) — todas "use server"
export interface AuthFormState {
  error: string | null;
  notice: string | null; // p. ej. "Revisa tu correo para confirmar la cuenta"
}

export async function signUpAction(prev, formData): Promise<AuthFormState>;
export async function signInAction(prev, formData): Promise<AuthFormState>;
export async function requestPasswordResetAction(
  prev,
  formData,
): Promise<AuthFormState>;
export async function updatePasswordAction(
  prev,
  formData,
): Promise<AuthFormState>;
```

```ts
// app/auth/confirm/route.ts (nuevo — primer Route Handler del proyecto)
export async function GET(request: NextRequest): Promise<Response>;
// Lee ?token_hash=&type=, llama supabase.auth.verifyOtp y redirige:
// type=email → /games · type=recovery → /auth/nueva-contrasena · fallo → /auth?error=enlace
```

### Configuración en el dashboard de Supabase

| Ajuste                         | Valor                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| Auth → Confirm email           | Activado                                                                |
| Auth → Site URL                | `http://localhost:3000`                                                 |
| Auth → Redirect URLs           | `http://localhost:3000/**`                                              |
| Plantilla "Confirm signup"     | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`    |
| Plantilla "Reset password"     | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |
| Auth → Minimum password length | 8                                                                       |

Las dos plantillas hay que **editarlas a mano**: las de fábrica usan `{{ .ConfirmationURL }}`, que apunta al endpoint de Supabase y devuelve los tokens en el hash de la URL — incompatible con el Route Handler.

## Plan de implementación

1. **Tabla `profiles` + trigger + RLS.** Migración de Supabase (`apply_migration`) con el `create table`, la función `handle_new_user`, el trigger `on_auth_user_created` y las dos policies de `profiles`. Prueba: `list_tables` muestra `public.profiles` con RLS activo; un `insert` manual en `auth.users` desde el dashboard crea su fila en `profiles`. La app no cambia.

2. **Columna `scores.user_id`.** Migración que añade la columna nullable con FK a `auth.users`. **No se toca todavía la policy de insert.** Prueba: guardar una puntuación desde `/games/rocas/jugar` sigue funcionando igual, con `user_id` nulo.

3. **Configuración del dashboard.** Activar "Confirm email", fijar Site URL y Redirect URLs a `http://localhost:3000`, subir la longitud mínima de contraseña a 8 y reescribir las plantillas "Confirm signup" y "Reset password" para que apunten a `/auth/confirm?token_hash=…`. Prueba: un `signUp` de prueba desde el dashboard genera un correo cuyo enlace apunta a `localhost:3000/auth/confirm`.

4. **Helpers de perfil.** Crear `lib/supabase/profiles.ts` con `getProfile()` (cliente de servidor + sesión actual) e `isPlayerNameTaken(name)`. Prueba: `npm run build` pasa; aún no se usa en ningún componente.

5. **Server Actions de registro e inicio de sesión.** Crear `app/auth/actions.ts` con `signUpAction` y `signInAction`, incluyendo la normalización a mayúsculas del `player_name`, la comprobación previa con `isPlayerNameTaken` y el mapeo de los errores de Supabase a mensajes en español. Prueba: `npm run build` pasa; las acciones no están conectadas todavía.

6. **Route Handler de confirmación.** Crear `app/auth/confirm/route.ts` con el `GET` que llama a `verifyOtp` y redirige según `type`. Prueba: visitar `/auth/confirm` sin parámetros redirige a `/auth?error=enlace` sin reventar.

7. **Rediseñar `/auth` con formularios reales.** Reescribir `app/auth/page.tsx`: la pestaña INICIAR SESIÓN pasa a correo + contraseña, la de CREAR CUENTA a usuario + correo + contraseña, ambas con `useActionState` sobre las acciones del paso 5, mostrando error y aviso. Se conservan JUGAR COMO INVITADO y los dos botones sociales inertes. Usar `/frontend-design`. Prueba: crear una cuenta real muestra "revisa tu correo", el enlace del correo confirma y deja sesión iniciada; un nombre repetido muestra "ese nombre ya está en uso".

8. **Sesión real en el contexto.** Reescribir `app/components/user-context.tsx` según el contrato del modelo de datos (`initialUser`, `onAuthStateChange`, `signOut` real, borrado de la clave `av_user`), pasarle `initialUser` desde `app/layout.tsx` y conectar el `signOut` de `nav.tsx`. Prueba: tras iniciar sesión la nav muestra el `player_name`; pulsarlo cierra la sesión y recargar la página no la resucita.

9. **Recuperación de contraseña.** Crear `app/auth/recuperar/page.tsx` (pide correo, llama a `requestPasswordResetAction`) y `app/auth/nueva-contrasena/page.tsx` (contraseña nueva vía `updatePasswordAction`, exige sesión de recuperación), más el enlace "¿Olvidaste tu contraseña?" en `/auth`. Usar `/frontend-design`. Prueba: el ciclo completo —pedir enlace, abrirlo desde el correo, escribir contraseña nueva, entrar con ella— funciona.

10. **Guardado de puntuación con sesión.** En `game-player.tsx`: eliminar `customName` y su input, usar el `player_name` del contexto, incluir `user_id` en el `insert` y, sin sesión, sustituir GUARDAR PUNTUACIÓN por un enlace a `/auth`. Prueba: con sesión, la fila guardada trae `user_id` y el nombre del perfil; sin sesión, el modal ofrece iniciar sesión y no hay forma de guardar desde la UI.

11. **Cerrar el RLS de `scores`.** Migración que elimina `scores_insert_public` y crea `scores_insert_own`. Prueba: guardar con sesión sigue funcionando; un `insert` anónimo desde la consola del navegador sin sesión devuelve error de RLS.

12. **Salón y limpieza.** En `hall-of-fame.tsx` resaltar la fila propia con el `player_name` del perfil; borrar `app/debug/supabase/page.tsx` y su carpeta. Prueba: el salón resalta tu fila tras iniciar sesión y `/debug/supabase` devuelve 404.

13. **Build + prueba de extremo a extremo.** `npm run build` sin errores ni warnings de TypeScript. Con Playwright: registro → confirmación → juego → guardar puntuación → cerrar sesión → recuperar contraseña → volver a entrar. Verificar además que sin sesión se puede navegar y jugar en `/`, `/games`, `/games/[id]` y `/games/[id]/jugar`. Capturas en `.playwright-screenshots/`.

14. **Cierre.** Repasar los criterios de aceptación uno por uno, confirmar con `git status` que no se coló ninguna credencial y pasar el estado del spec a "Implementado" antes de mergear la rama.

Notas operativas para `/spec-impl`:

- El **paso 3 es manual del usuario**: activar "Confirm email" y editar las plantillas de correo son cambios en el dashboard de Supabase que las herramientas MCP no cubren (`apply_migration` solo hace SQL). El paso se pausa esperándole.
- El **paso 11 es el punto de no retorno**: a partir de ahí ninguna puntuación anónima entra en la base. El paso 10 debe estar verificado antes.

## Criterios de aceptación

**Build y estructura**

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Existen `app/auth/actions.ts`, `app/auth/confirm/route.ts`, `app/auth/recuperar/page.tsx`, `app/auth/nueva-contrasena/page.tsx` y `lib/supabase/profiles.ts`.
- [ ] `app/debug/supabase/page.tsx` ya no existe y visitar `/debug/supabase` devuelve 404.
- [ ] `grep -r "av_user" app/` no devuelve ninguna escritura de esa clave.

**Base de datos**

- [ ] `public.profiles` existe con `player_name` `not null unique` y RLS activo.
- [ ] `public.scores` tiene la columna `user_id` con FK a `auth.users`.
- [ ] La policy `scores_insert_public` ya no existe; en su lugar está `scores_insert_own` restringida a `authenticated`.
- [ ] Las 16 puntuaciones anteriores al spec siguen en la tabla con `user_id` nulo y siguen apareciendo en el salón.

**Registro**

- [ ] Crear cuenta con usuario, correo y contraseña muestra el aviso de que hay que confirmar el correo, y **no** deja sesión iniciada.
- [ ] El correo de confirmación llega y su enlace apunta a `localhost:3000/auth/confirm?token_hash=…&type=email`.
- [ ] Abrir ese enlace deja la sesión iniciada y redirige a `/games`.
- [ ] Registrarse con un `player_name` ya existente muestra "ese nombre ya está en uso" y no crea el usuario (`auth.users` no gana una fila).
- [ ] Registrarse con un correo ya registrado muestra un mensaje de error, no una pantalla en blanco.
- [ ] Una contraseña de menos de 8 caracteres muestra error antes de crear nada.
- [ ] El `player_name` se guarda en mayúsculas aunque se escriba en minúsculas.
- [ ] Tras un registro exitoso, `profiles` tiene exactamente una fila nueva, con el mismo `id` que el usuario de `auth.users`.

**Inicio y cierre de sesión**

- [ ] Iniciar sesión con correo y contraseña correctos redirige a `/games` y la nav muestra el `player_name`.
- [ ] Iniciar sesión con contraseña incorrecta muestra "credenciales inválidas" y no redirige.
- [ ] Iniciar sesión con una cuenta sin confirmar muestra un mensaje que dice que falta confirmar el correo.
- [ ] Pulsar el nombre en la nav cierra la sesión y la nav vuelve a mostrar "Iniciar Sesión".
- [ ] Tras cerrar sesión, recargar la página no restaura al usuario.
- [ ] Con la sesión iniciada, recargar la página no produce un parpadeo de "sin sesión" en la nav.

**Recuperación de contraseña**

- [ ] `/auth/recuperar` acepta un correo y confirma que se envió el enlace.
- [ ] El enlace del correo lleva a `/auth/nueva-contrasena` con sesión de recuperación activa.
- [ ] Guardar la contraseña nueva permite iniciar sesión con ella e impide entrar con la anterior.
- [ ] Visitar `/auth/nueva-contrasena` directamente, sin enlace de recuperación, no permite cambiar la contraseña.

**Puntuaciones**

- [ ] El modal de fin de partida ya no tiene input de nombre.
- [ ] Con sesión iniciada, el modal muestra el `player_name` del perfil y guardar crea una fila con ese nombre y con `user_id` igual al del usuario.
- [ ] Sin sesión, el modal muestra un enlace a `/auth` en lugar del botón GUARDAR PUNTUACIÓN.
- [ ] Un `insert` en `scores` desde la consola del navegador sin sesión falla por RLS.
- [ ] Un `insert` con sesión pero con un `player_name` distinto al del perfil falla por RLS.
- [ ] El salón resalta la fila propia cuando hay sesión iniciada.

**Sin sesión (el sitio sigue público)**

- [ ] Se puede navegar `/`, `/games`, `/games/[id]`, `/salon` y `/about` sin sesión.
- [ ] Se puede jugar una partida completa en `/games/[id]/jugar` sin sesión.
- [ ] "JUGAR COMO INVITADO" sigue en `/auth` y lleva a `/games`.
- [ ] Los botones GOOGLE y GITHUB siguen visibles y siguen sin hacer nada.
- [ ] La skin seleccionada sigue persistiendo en `localStorage["av_skin"]` y sobrevive al cierre de sesión.

## Decisiones

**Partición del trabajo**

- **Sí:** partir en dos specs. Este cubre email y contraseña; el SPEC 14 añade Google y GitHub. OAuth depende de credenciales que hay que crear a mano en Google Cloud y GitHub, y eso bloquearía la implementación entera.
- **No:** un tercer spec solo para ligar `scores` al usuario. La restricción de RLS es inseparable de "guardar exige sesión": separarlas dejaría una ventana en la que la UI pide login pero la base sigue aceptando inserts anónimos.

**Autenticación**

- **Sí:** email y contraseña con confirmación por correo activada. Evita cuentas con correos inventados ocupando `player_name` únicos.
- **Sí:** Server Actions (`app/auth/actions.ts`) en vez de llamar al cliente de navegador desde el formulario. Es la convención del proyecto (`app/about/actions.ts`) y el patrón oficial de Supabase para App Router; deja las credenciales fuera del bundle de cliente.
- **Sí:** un Route Handler `app/auth/confirm/route.ts`, el primero del proyecto. `verifyOtp` tiene que escribir cookies de sesión y un Server Component no puede hacerlo.
- **No:** el flujo por defecto de Supabase con `{{ .ConfirmationURL }}` y tokens en el hash de la URL. Evita el Route Handler pero obliga a recoger la sesión en cliente, no funciona sin JavaScript y es el patrón que Supabase ya no recomienda.
- **Sí:** iniciar sesión con **correo**, no con `player_name`. Traducir nombre → correo exigiría una consulta pública que revelaría qué nombres están registrados.
- **No:** magic link. Otro flujo de correo más que mantener, y con contraseña ya cubierto el caso.
- **Sí:** longitud mínima de contraseña 8, por encima del 6 de fábrica de Supabase. Coste cero.

**Identidad del jugador**

- **Sí:** tabla `profiles` en vez de guardar el nombre solo en `user_metadata`. Es la única forma de exigir unicidad con un `unique` y de hacer join desde `scores` en SQL.
- **Sí:** `player_name` único y en mayúsculas, con `check` de formato `^[A-Z0-9_-]{1,10}$`. Normalizar a mayúsculas hace que el `unique` de Postgres baste, sin índice funcional sobre `lower()`.
- **Sí:** crear el perfil con un trigger `security definer` sobre `auth.users`. Corre dentro de la transacción del registro: o se crean usuario y perfil, o no se crea ninguno de los dos.
- **Sí:** además del trigger, comprobar la disponibilidad del nombre **antes** de llamar a `signUp`. El trigger garantiza la integridad, pero su error es un 500 opaco; la comprobación previa da el mensaje bueno.
- **No:** permitir editar el `player_name` después del registro. Con las puntuaciones guardando el nombre denormalizado, renombrar obliga a decidir qué pasa con el histórico — eso es un spec propio.
- **Sí:** lectura pública de `profiles`. Los nombres ya son públicos en el salón; no hay nada más en la tabla.

**Puntuaciones**

- **Sí:** `scores.user_id` nullable, no `not null`. Las 16 filas anónimas existentes son historia legítima del salón y no hay a quién atribuírselas.
- **Sí:** conservar `player_name` en `scores` además de `user_id`. El salón lee miles de filas y hacer join contra `profiles` en cada consulta no aporta nada mientras el nombre no se pueda cambiar.
- **Sí:** la policy de insert exige que `player_name` coincida con el del perfil. Sin eso, la unicidad de `profiles` no significa nada en el salón: cualquiera podría guardar con el nombre de otro.
- **Sí:** quitar el input editable de nombre del modal de fin de partida. Es la consecuencia directa de la policy anterior; dejarlo sería una UI que promete algo que la base rechaza.

**Sesión en el cliente**

- **Sí:** `initialUser` desde `app/layout.tsx` (Server Component) más `onAuthStateChange` en el provider. Evita el parpadeo de "sin sesión" en el primer render, que es lo que hace hoy el patrón hydrate-after-mount de `localStorage`.
- **Sí:** eliminar `av_user` y borrar la clave vieja al montar. La sesión pasa a vivir en cookies; mantener las dos fuentes garantiza que se desincronicen.
- **No:** ligar la skin al perfil. `av_skin` es preferencia del navegador, no de la cuenta; moverla a `profiles` añade sincronización y un conflicto (anónimo vs. perfil) a cambio de poco.

**Alcance del sitio**

- **Sí:** el sitio sigue completamente público y se puede jugar sin cuenta. La sesión solo hace falta para guardar puntuación.
- **No:** protección de rutas en el proxy. Sin rutas privadas, añadir redirecciones sería complejidad sin uso; el proxy sigue solo refrescando la sesión, como lo dejó la SPEC 04.
- **Sí:** conservar "JUGAR COMO INVITADO" y los dos botones sociales inertes. El botón de invitado es coherente con el sitio público; los sociales se activan en el SPEC 14 y quitarlos ahora para devolverlos después es trabajo doble.
- **No:** borrar cuenta. Necesita la clave `service_role`, que el proyecto deliberadamente no tiene todavía (SPEC 04).

## Riesgos

| Riesgo                                                                                                                                                                 | Mitigación                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El SMTP de fábrica de Supabase limita el envío a unos pocos correos por hora, y este spec depende del correo para registro **y** recuperación. Probar lo agota rápido. | Configurar SMTP propio con **Resend**, que el proyecto ya usa en `app/about/actions.ts` con `RESEND_API_KEY`. Ojo: la cuenta de Resend está en sandbox y solo entrega al dueño, así que las pruebas se hacen con ese correo. |
| Si Supabase capturase el error del trigger sin abortar la transacción, un nombre repetido dejaría un usuario en `auth.users` sin fila en `profiles`.                   | Se verifica a mano en el paso 1, antes de escribir código de UI. Si el comportamiento no es el esperado, se cambia a crear el perfil desde `signUpAction` tras el `signUp` y borrar el usuario si falla.                     |
| El paso 11 cierra el `insert` anónimo. Si el paso 10 quedó mal, nadie puede guardar puntuación y el fallo aparece un paso después de su causa.                         | El paso 10 se valida guardando una puntuación real con sesión antes de tocar la policy. La policy vieja se restaura con una migración de una línea.                                                                          |
| Las plantillas de correo se editan a mano en el dashboard; un enlace mal formado rompe registro y recuperación sin dar señal en el build.                              | El paso 3 termina comprobando el enlace de un correo real antes de seguir. Las dos plantillas quedan escritas literalmente en el modelo de datos de este spec.                                                               |
| Al iniciar o cerrar sesión, los Server Components ya renderizados (nav, salón) conservan el estado anterior hasta una navegación completa.                             | Las Server Actions redirigen tras autenticar, y el `onAuthStateChange` del provider llama a `router.refresh()` para revalidar el árbol de servidor.                                                                          |
| Un jugador que hoy usa un nombre en `localStorage` puede encontrárselo ocupado por otra persona al registrarse, y sus puntuaciones anónimas quedan bajo ese nombre.    | Asumido: no hay forma de demostrar la propiedad de un nombre anónimo. Las filas viejas se quedan con `user_id` nulo y el spec no las reclama para nadie.                                                                     |
| El enlace de confirmación abierto en otro navegador (o en el móvil) deja la sesión iniciada allí y no en el navegador donde se registró.                               | Es el comportamiento normal del flujo por correo. Tras confirmar, el usuario puede iniciar sesión con normalidad en cualquier navegador.                                                                                     |
| El paso 13 no se puede automatizar del todo: Playwright no lee el buzón de correo.                                                                                     | El tramo de correo (confirmación y recuperación) se prueba a mano y se deja constancia con capturas; el resto del recorrido sí va con Playwright.                                                                            |

## Qué **no** está en este spec

- OAuth con Google y GitHub — es el SPEC 14. Los botones se quedan visibles e inertes.
- Editar el `player_name` después del registro.
- Borrar la cuenta.
- Página de perfil o "mis puntuaciones".
- Protección de rutas o redirecciones por sesión en el proxy: todo el sitio sigue público y jugable sin cuenta.
- Ligar la skin al perfil: `av_skin` sigue en `localStorage`.
- Reclamar las puntuaciones anónimas ya guardadas.
- URLs de redirección de producción o de LAN.
- 2FA, SMS, captcha o rate limiting propio.
- Tests.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
