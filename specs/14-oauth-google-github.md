# SPEC 14 — Inicio de sesión con Google y GitHub

> **Estado:** Implementado
> **Depende de:** SPEC 13 (Supabase Auth, tabla `profiles`, trigger `handle_new_user` y `scores.user_id`), SPEC 04 (clientes `lib/supabase/*`), SPEC 01 (pantalla `/auth`)
> **Fecha:** 2026-07-27
> **Objetivo:** Activar los botones GOOGLE y GITHUB de `/auth` con OAuth de Supabase, resolviendo el `player_name` —que ningún proveedor aporta— en una pantalla de onboarding `/auth/completar-perfil` que se muestra solo la primera vez.

## Alcance

**Dentro:**

- **Botones GOOGLE y GITHUB operativos** en `/auth` (`app/auth/auth-card.tsx`), hoy inertes desde el SPEC 13. Llaman a una Server Action nueva que ejecuta `signInWithOAuth` y redirige al proveedor.
- **Route Handler nuevo** `app/auth/callback/route.ts`: canjea el `?code=` con `exchangeCodeForSession` (flujo PKCE) y decide destino según haya perfil o no. Es el segundo Route Handler del proyecto, separado de `/auth/confirm` (que sigue siendo solo para los enlaces de correo con `verifyOtp`).
- **Pantalla de onboarding** `/auth/completar-perfil`: se muestra solo si el usuario tiene sesión y **no** tiene fila en `profiles`. Pide el `player_name` con las mismas reglas del SPEC 13 (mayúsculas, 1–10, `^[A-Z0-9_-]{1,10}$`, único) y precarga una sugerencia derivada de la metadata del proveedor.
- **Migración del trigger `handle_new_user`**: pasa a insertar en `profiles` **solo si** `raw_user_meta_data->>'player_name'` viene informado. Sin esto, cualquier alta por OAuth revienta con violación de `not null`.
- **Policy nueva `profiles_insert_own`** (`for insert to authenticated with check (id = auth.uid())`), para que la Server Action del onboarding pueda crear la fila. Hoy `profiles` no tiene ninguna policy de insert: solo escribe el trigger.
- **Enlazado automático de identidades**: quien ya tenga cuenta de correo y entre con Google o GitHub con ese mismo correo cae en la **misma** cuenta, con su `player_name` y sus puntuaciones. Es el comportamiento de fábrica de Supabase; el spec lo asume y no lo combate.
- **Estados de error visibles**: OAuth cancelado o denegado por el usuario, `code` inválido o caducado, nombre ya en uso en el onboarding.
- **Configuración del dashboard de Supabase**: proveedores Google y GitHub habilitados con su Client ID y Secret. **Ya hecha por Tito** antes de escribir este spec, tanto en Supabase como en Google Cloud Console y en GitHub.

**Fuera de alcance (para specs futuros):**

- **Vincular proveedores desde la cuenta** con `linkIdentity` ("conecta tu GitHub"). Necesita una página de perfil, que no existe; el enlazado automático por correo ya cubre el caso normal.
- **Desvincular** un proveedor (`unlinkIdentity`).
- Editar el `player_name` después de elegirlo. Sigue vetado igual que en el SPEC 13.
- Página de perfil o "mis puntuaciones".
- Más proveedores (Discord, Apple, X).
- URLs de redirección de producción o de LAN: solo `http://localhost:3000`, como en el SPEC 13.
- Protección de rutas en el proxy. Sigue solo refrescando la sesión: un usuario sin perfil navega y juega como invitado hasta que decide guardar puntuación.
- Reclamar las puntuaciones anónimas ya guardadas.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

No hay tablas nuevas. `profiles` y `scores` se quedan como las dejó el SPEC 13. Cambian el trigger y las policies de `profiles`.

### Trigger `handle_new_user` — se vuelve condicional

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Solo el alta por correo trae player_name en la metadata. Google y GitHub
  -- no aportan ninguno: su perfil lo crea /auth/completar-perfil.
  if coalesce(new.raw_user_meta_data->>'player_name', '') <> '' then
    insert into public.profiles (id, player_name)
    values (new.id, new.raw_user_meta_data->>'player_name');
  end if;
  return new;
end;
$$;
```

Se usa `coalesce(... ->> ...) <> ''` y no el operador `?` de jsonb a propósito: `?` se confunde con un placeholder de parámetro en algunos drivers.

El trigger sigue siendo la garantía de integridad del alta por correo: si el nombre está ocupado, el `unique` aborta la transacción completa y no queda usuario huérfano. Para OAuth esa garantía la da el mismo `unique`, pero al insertar desde la Server Action.

### Policy nueva en `profiles`

```sql
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
```

Hasta ahora `profiles` no tenía policy de insert porque solo escribía el trigger `security definer`. El onboarding escribe como usuario autenticado, y solo puede crear **su propia** fila. Las policies `profiles_select_public` y `profiles_update_own` no se tocan.

### Metadata que aporta cada proveedor

| Proveedor | Claves útiles en `raw_user_meta_data`                        |
| --------- | ------------------------------------------------------------ |
| GitHub    | `user_name`, `preferred_username`, `full_name`, `avatar_url` |
| Google    | `full_name`, `name`, `given_name`, `picture`                 |

Ninguno trae `player_name`. Se usan solo para **sugerir** un nombre en el formulario; el jugador puede cambiarlo.

### Contratos de TypeScript

```ts
// lib/supabase/profiles.ts (añadidos)

/** Usuario con sesión iniciada pero sin fila en profiles. */
export interface PendingUser {
  id: string;
  email: string;
  suggestedName: string; // ya normalizado: mayúsculas, 1–10, ^[A-Z0-9_-]{1,10}$
}

/** Devuelve el usuario si tiene sesión y NO tiene perfil; null en cualquier otro caso. */
export async function getUserWithoutProfile(): Promise<PendingUser | null>;

/**
 * Deriva un player_name a partir de la metadata del proveedor.
 * Orden: user_name · preferred_username · primera palabra de full_name · parte
 * local del correo. Se pasa a mayúsculas, se descarta lo que no case con
 * [A-Z0-9_-], se recorta a 10 y, si queda vacío, devuelve "JUGADOR".
 * Es solo una sugerencia: la unicidad la sigue garantizando el unique de la tabla.
 */
export function suggestPlayerName(
  metadata: Record<string, unknown>,
  email: string,
): string;
```

```ts
// app/auth/actions.ts (añadidos) — "use server", reutilizan AuthFormState

export type OAuthProvider = "google" | "github";

/**
 * Lee "provider" del formulario, llama a signInWithOAuth con
 * redirectTo = <origin>/auth/callback y redirige a la URL del proveedor.
 * El origin sale de headers(); en fallo redirige a /auth?error=oauth.
 */
export async function signInWithProviderAction(
  formData: FormData,
): Promise<void>;

/**
 * Crea la fila de profiles del usuario de la sesión. Valida formato y
 * disponibilidad con isPlayerNameTaken, y traduce la violación de unique
 * (código 23505) por si dos personas eligen el mismo nombre a la vez.
 * En éxito: revalidatePath("/", "layout") y redirect("/games").
 */
export async function completeProfileAction(
  prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState>;
```

```ts
// app/auth/callback/route.ts (nuevo — segundo Route Handler del proyecto)
export async function GET(request: NextRequest): Promise<Response>;
// ?code=…  → exchangeCodeForSession → con perfil: /games
//                                   → sin perfil: /auth/completar-perfil
// ?error=… → /auth?error=oauth   (el jugador canceló o denegó permisos)
// sin code → /auth?error=oauth
```

`/auth/confirm` no se toca: sigue siendo el destino de los enlaces de correo (`verifyOtp`). Son dos flujos distintos y comparten cero código.

### Archivos que aparecen o cambian

| Archivo                                     | Qué pasa                                                   |
| ------------------------------------------- | ---------------------------------------------------------- |
| `app/auth/callback/route.ts`                | Nuevo                                                      |
| `app/auth/completar-perfil/page.tsx`        | Nuevo (Server Component: resuelve `getUserWithoutProfile`) |
| `app/auth/completar-perfil/perfil-form.tsx` | Nuevo (cliente, `useActionState`)                          |
| `app/auth/actions.ts`                       | +`signInWithProviderAction`, +`completeProfileAction`      |
| `app/auth/auth-card.tsx`                    | Los dos botones sociales pasan a `<form action=…>`         |
| `lib/supabase/profiles.ts`                  | +`getUserWithoutProfile`, +`suggestPlayerName`             |
| Migración Supabase                          | `handle_new_user` condicional + `profiles_insert_own`      |

## Plan de implementación

1. **Migración: trigger condicional + policy de insert.** `apply_migration` con el `create or replace function public.handle_new_user()` de la sección anterior y la policy `profiles_insert_own`. Prueba: crear una cuenta por correo desde `/auth` sigue creando su fila en `profiles`; `select * from pg_policies where tablename = 'profiles'` devuelve las tres policies. De paso, confirmar en el dashboard que Google y GitHub están habilitados y que `http://localhost:3000/**` sigue en las Redirect URLs. La app no cambia.

2. **Helpers de perfil.** Añadir a `lib/supabase/profiles.ts` la interfaz `PendingUser`, `getUserWithoutProfile()` y `suggestPlayerName(metadata, email)` con la normalización descrita. Prueba: `npm run build` pasa; nadie los usa todavía.

3. **Server Action de OAuth.** Añadir `signInWithProviderAction` a `app/auth/actions.ts`: lee `provider` del `FormData`, calcula el `origin` con `headers()`, llama a `signInWithOAuth({ provider, options: { redirectTo: origin + "/auth/callback" } })` y hace `redirect(data.url)`. Prueba: `npm run build` pasa; la acción todavía no está conectada a ningún botón.

4. **Route Handler del callback.** Crear `app/auth/callback/route.ts` con el `GET`: canjea el `?code=` con `exchangeCodeForSession`, y redirige a `/games` o a `/auth/completar-perfil` según `getUserWithoutProfile()`. Prueba: visitar `/auth/callback` sin parámetros redirige a `/auth?error=oauth` sin reventar; visitarlo con `?error=access_denied` hace lo mismo.

5. **Server Action del onboarding.** Añadir `completeProfileAction` a `app/auth/actions.ts`: valida el formato contra `PLAYER_NAME_RE`, comprueba con `isPlayerNameTaken`, inserta en `profiles` con el `id` de la sesión, traduce el `23505` a "ese nombre ya está en uso" y termina con `revalidatePath("/", "layout")` + `redirect("/games")`. Prueba: `npm run build` pasa.

6. **Pantalla `/auth/completar-perfil`.** Crear el Server Component `page.tsx` (llama a `getUserWithoutProfile()`; si devuelve `null` redirige a `/games`) y el componente cliente `perfil-form.tsx` con `useActionState` sobre la acción del paso 5, el campo precargado con `suggestedName` y los mismos estados de error que `/auth`. Reutilizar `AuthShell` y usar `/frontend-design`. Prueba: con sesión y sin perfil se ve el formulario con el nombre sugerido; sin sesión o con perfil, redirige a `/games`.

7. **Activar los botones GOOGLE y GITHUB.** En `app/auth/auth-card.tsx`, envolver cada botón en un `<form action={signInWithProviderAction}>` con un `<input type="hidden" name="provider">`, quitar el comentario "inertes hasta el SPEC 14" y añadir el mensaje de `?error=oauth` junto al de `?error=enlace` que ya existe. Prueba: **el primer recorrido completo** — pulsar GOOGLE lleva a Google, volver cae en `/auth/completar-perfil`, elegir nombre entra a `/games` con la nav mostrando ese nombre.

8. **Enlazado automático y segundo proveedor.** Sin escribir código: entrar con GitHub usando el correo de la cuenta de contraseña que ya existe y comprobar que cae en la **misma** cuenta —mismo `player_name`, sin pasar por el onboarding— y que `auth.identities` tiene dos filas para ese `user_id`. Repetir el alta limpia con GitHub desde un correo nuevo. Si algo falla aquí, el arreglo es de configuración, no de código.

9. **Build + prueba de extremo a extremo.** `npm run build` sin errores ni warnings de TypeScript. Con Playwright: alta por Google → onboarding → guardar una puntuación real → cerrar sesión → volver a entrar por Google (esta vez sin onboarding). Comprobar también que el alta y el inicio de sesión por correo del SPEC 13 siguen intactos. Capturas en `.playwright-screenshots/`.

10. **Cierre.** Repasar los criterios de aceptación uno por uno, confirmar con `git status` que no se coló ningún Client Secret y pasar el estado del spec a "Implementado" antes de mergear la rama.

Notas operativas para `/spec-impl`:

- **El paso 1 es urgente, no rutinario.** Los proveedores ya están habilitados en el dashboard: hasta que salga esa migración, cualquier alta por OAuth muere con violación de `not null` en `profiles.player_name`.
- **Los pasos 7 y 8 no se pueden automatizar del todo**: la pantalla de consentimiento de Google y la de GitHub piden interacción real y no se dejan guionizar con Playwright de forma fiable. Se prueban a mano y se deja constancia con capturas.
- **El paso 8 no es reversible del lado de Supabase**: una vez enlazadas dos identidades sobre el mismo correo, desenlazarlas necesitaría `service_role`. Es el comportamiento buscado, pero conviene saberlo antes de pulsar.

## Criterios de aceptación

**Build y estructura**

- [x] `npm run build` termina sin errores ni warnings de TypeScript.
- [x] Existen `app/auth/callback/route.ts`, `app/auth/completar-perfil/page.tsx` y `app/auth/completar-perfil/perfil-form.tsx`.
- [x] `app/auth/auth-card.tsx` ya no contiene el comentario "Inertes hasta el SPEC 14".
- [x] Ningún Client Secret aparece en el repositorio (`git grep -i "client_secret"` no devuelve nada).

**Base de datos**

- [x] `public.profiles` tiene tres policies: `profiles_select_public`, `profiles_update_own` y `profiles_insert_own`.
- [x] La función `handle_new_user` solo inserta cuando `raw_user_meta_data->>'player_name'` viene informado.
- [x] Crear una cuenta por correo desde `/auth` sigue creando exactamente una fila en `profiles`. — verificado a nivel de trigger (alta con `player_name` → 1 fila; nombre duplicado → `unique_violation` aborta el alta y no deja usuario huérfano), no pulsando "CREAR CUENTA" en la interfaz.

**Alta por Google**

- [x] Pulsar GOOGLE en `/auth` lleva a la pantalla de consentimiento de Google.
- [ ] Al volver, un usuario nuevo aterriza en `/auth/completar-perfil` y **no** en `/games`. — la cuenta de Google usada en la prueba compartía correo con la de contraseña, así que se enlazó y entró a `/games`, que es lo correcto para ese caso. El camino de usuario nuevo quedó verificado con GitHub y en simulación, pero **no** con Google.
- [x] El campo de nombre llega precargado con una sugerencia en mayúsculas de 1–10 caracteres.
- [x] Guardar un nombre válido crea una fila en `profiles` con el `id` del usuario, redirige a `/games` y la nav muestra ese nombre.
- [x] Elegir un nombre ya ocupado muestra "ese nombre ya está en uso" y no crea ninguna fila.
- [x] Un nombre con caracteres no permitidos o de más de 10 muestra error antes de tocar la base.
- [x] Volver a entrar con Google **no** vuelve a pasar por `/auth/completar-perfil`: va directo a `/games`.

**Alta por GitHub**

- [x] Pulsar GITHUB en `/auth` lleva a la pantalla de autorización de GitHub.
- [x] Un usuario nuevo de GitHub pasa por el onboarding igual que el de Google.
- [x] La sugerencia de nombre para GitHub sale de `user_name`, no del correo. — con la cuenta real ambos candidatos normalizaban a la misma cadena; se comprobó con una cuenta donde difieren (`nova_pilot` → `NOVA_PILOT`, correo `spec14-e2e@…` habría dado `SPEC14-E2E`).

**Enlazado de identidades**

- [x] Entrar con Google o GitHub usando el correo de una cuenta de contraseña existente cae en **esa misma** cuenta: mismo `player_name`, sin pasar por el onboarding.
- [x] Tras ese enlazado, `auth.identities` tiene dos filas con el mismo `user_id`.
- [x] Las puntuaciones anteriores de esa cuenta siguen atribuidas a ella (`scores.user_id` no cambia).
- [ ] Esa cuenta sigue pudiendo entrar con correo y contraseña como antes. — pendiente: solo lo puede probar quien tiene la contraseña.

**Errores y casos de borde**

- [x] Cancelar el consentimiento en el proveedor devuelve a `/auth` con un mensaje de error legible, no a una pantalla en blanco. — probado invocando el callback con `?error=access_denied`, que es lo que envía el proveedor al cancelar.
- [x] Visitar `/auth/callback` sin `?code=` redirige a `/auth?error=oauth`.
- [x] Visitar `/auth/completar-perfil` sin sesión redirige a `/games`.
- [x] Visitar `/auth/completar-perfil` con sesión y perfil ya creado redirige a `/games`.
- [x] Un usuario con sesión que abandona el onboarding puede seguir navegando y jugando; la nav lo muestra como invitado. — requirió corregir `user-context.tsx`, que trataba como usuario a una sesión sin nombre.

**Nada roto del SPEC 13**

- [ ] Alta por correo, confirmación, inicio de sesión y cierre de sesión siguen funcionando igual. — inicio y cierre de sesión verificados; el alta con envío de correo y su confirmación, no (necesita un buzón real).
- [x] `/auth/recuperar` y `/auth/nueva-contrasena` siguen funcionando. — las pantallas responden 200 y `/auth/nueva-contrasena` sigue rechazando el acceso sin sesión de recuperación; el envío del correo no se volvió a ejercitar.
- [x] `/auth/confirm` sigue atendiendo los enlaces de correo y no se ha mezclado con `/auth/callback`. — sin parámetros, uno redirige a `?error=enlace` y el otro a `?error=oauth`.
- [x] "JUGAR COMO INVITADO" sigue en `/auth` y lleva a `/games`.
- [x] Guardar una puntuación con una cuenta creada por OAuth funciona y la fila trae su `user_id` y su `player_name`.

### Cambios respecto a lo planeado

- **`app/components/user-context.tsx`** no estaba en la tabla de archivos y hubo que tocarlo. Construía el usuario del cliente desde la sesión con `name: metadata.player_name ?? ""`, así que una sesión de OAuth sin perfil salía como usuario con nombre vacío y la nav pintaba un botón de cuenta en blanco. Ahora devuelve `null` cuando no hay nombre, igual que hace `getSessionUser()` en el servidor. El estado no existía en el SPEC 13 porque el trigger creaba siempre el perfil.
- **`app/auth/page.tsx`** pasa el `?error=` en crudo y `auth-card.tsx` lo traduce con un mapa, en vez de sumar un segundo prop booleano junto a `linkError`.
- **`.social form`** en `globals.css`: al meter cada botón social en su propio `<form>`, hacía falta que el form ocupara la columna de la rejilla.
- `suggestPlayerName` usa `full_name || name` porque Google manda `name` donde GitHub manda `full_name`.

## Decisiones

**El player_name, que es el problema real**

- **Sí:** pantalla de onboarding `/auth/completar-perfil`. Ningún proveedor aporta un nombre de jugador, y el salón es la cara pública del sitio: un nombre elegido vale más que uno derivado.
- **No:** generar el nombre automáticamente en el trigger a partir de `user_name` o del correo, con sufijo numérico al chocar (`KAI`, `KAI2`). Cero fricción, pero produce nombres feos y —con la edición de nombre vetada desde el SPEC 13— irreversibles.
- **No:** generar automático y permitir cambiarlo una sola vez. Es el onboarding disfrazado, con el coste añadido de un `update` y de decidir qué pasa con quien ya jugó bajo el nombre viejo.
- **Sí:** precargar una sugerencia derivada de la metadata, editable. Recoge lo bueno del automático sin renunciar a la elección.
- **Sí:** el trigger `handle_new_user` pasa a ser condicional en vez de crear la fila siempre. Es el cambio mínimo: el alta por correo conserva intacta su garantía transaccional y OAuth simplemente no dispara la inserción.
- **No:** hacer `profiles.player_name` nullable para que el trigger inserte siempre una fila vacía. Deja filas a medias en la tabla y obliga a todo el resto del código a distinguir entre "sin perfil" y "perfil sin nombre".
- **Sí:** policy `profiles_insert_own` acotada a `id = auth.uid()`. Es la primera escritura en `profiles` que no viene del trigger; sin la restricción, cualquiera podría crear perfiles ajenos.
- **Sí:** validar el nombre con `isPlayerNameTaken` **y** traducir el `23505`. Redundante a propósito: la comprobación previa da el mensaje bueno, el `unique` es lo que de verdad decide.

**Identidades y cuentas duplicadas**

- **Sí:** enlazado automático por correo. No es tanto una elección como una constatación: Supabase enlaza identidades con el mismo correo verificado y no expone ningún interruptor para desactivarlo. El enlazado ocurre en GoTrue **antes** de que nuestro callback reciba el `code`.
- **No:** bloquear el enlazado detectando dos identidades en el callback y cerrando la sesión. Cuando ese código corriese, el enlace en la base ya estaría hecho; deshacerlo exige `service_role`, que el proyecto no tiene (SPEC 04 y 13). Sería una pantalla que miente sobre el estado de la base.
- **Sí:** asumir el enlazado como una función, no como un defecto. El jugador entra por donde quiera y siempre cae en la misma cuenta, con su nombre y sus puntuaciones.
- **No:** `linkIdentity` manual desde una página de perfil. Necesita una página de perfil, que no existe.
- **Sí:** dejar que un usuario llegado por Google pueda ponerse contraseña vía `/auth/recuperar`. Es el comportamiento normal de Supabase, acaba con las dos vías abiertas sobre la misma cuenta y no cuesta una línea de código.

**Mecánica del flujo**

- **Sí:** Route Handler propio `app/auth/callback/route.ts`, separado de `/auth/confirm`. Comparten cero código: uno canjea un `code` de PKCE, el otro verifica un `token_hash` de correo. Mezclarlos sería un `switch` sobre dos flujos sin nada en común.
- **Sí:** Server Action para lanzar el OAuth en vez de `signInWithOAuth` desde el cliente. Es la convención del proyecto desde el SPEC 13 y deja el formulario funcionando aunque el JavaScript tarde en hidratar.
- **Sí:** decidir el destino post-callback consultando `profiles`, no una bandera en la metadata del usuario. La tabla es la única fuente de verdad sobre si el jugador tiene nombre.
- **No:** proteger rutas en el proxy para forzar el onboarding. El sitio sigue público y jugable sin cuenta desde el SPEC 13; un usuario sin perfil es simplemente un invitado con sesión.

**Alcance**

- **Sí:** solo Google y GitHub, los dos botones que la maqueta ya tenía. Añadir proveedores después es copiar un `case`.
- **Sí:** solo `http://localhost:3000`, como el SPEC 13. Las URLs de producción son un spec de despliegue, no de autenticación.
- **No:** editar el `player_name` después de elegirlo. Sigue vetado por la misma razón del SPEC 13: las puntuaciones guardan el nombre denormalizado.

## Riesgos

| Riesgo                                                                                                                                                                                                                      | Mitigación                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los proveedores **ya están habilitados** en el dashboard, así que ahora mismo un alta por Google muere con violación de `not null` en `profiles.player_name`. La ventana ya está abierta.                                   | El paso 1 del plan es exactamente esa migración y va antes que cualquier otra cosa. Mientras tanto los botones siguen inertes, así que nadie puede llegar ahí desde la UI.          |
| El enlazado automático es irreversible sin `service_role`: una vez unidas dos identidades sobre el mismo correo, no hay vuelta atrás desde la app.                                                                          | Es la decisión tomada, no un accidente. El paso 8 la verifica a conciencia con la cuenta de pruebas antes de dar el spec por cerrado.                                               |
| Un usuario abandona el onboarding y se queda con sesión sin perfil. `getSessionUser()` devuelve `null`, así que la nav lo muestra como invitado aunque tenga cookies de sesión.                                             | Es el comportamiento elegido. Al volver a `/auth` y pulsar el proveedor otra vez, el callback lo devuelve al onboarding. No queda encallado.                                        |
| Un usuario en ese estado juega y pulsa GUARDAR PUNTUACIÓN. El SPEC 13 le enseña el enlace a `/auth` porque el contexto lo ve como invitado, pero la policy `scores_insert_own` fallaría de todos modos por no tener perfil. | Coherente: la UI no ofrece guardar y la base tampoco lo aceptaría. El recorrido de vuelta —`/auth` → proveedor → onboarding— está cubierto por los criterios de aceptación.         |
| La sugerencia de nombre puede chocar con uno existente, y dos personas con el mismo nombre de GitHub verían la misma propuesta.                                                                                             | El campo es editable y el `unique` decide. `completeProfileAction` traduce el `23505` al mismo mensaje que la comprobación previa.                                                  |
| Google devuelve `full_name` con acentos, espacios o caracteres fuera de `[A-Z0-9_-]`; el `check` de `profiles` los rechazaría.                                                                                              | `suggestPlayerName` normaliza antes de proponer: mayúsculas, descarte de lo que no case, recorte a 10 y `"JUGADOR"` si queda vacío. Nunca propone algo que la base vaya a rechazar. |
| Si alguien intenta registrarse por correo con un correo que ya entró por OAuth, Supabase devuelve una respuesta ofuscada sin enviar correo —es su defensa contra enumeración de cuentas— y el jugador se queda esperando.   | Ya está cubierto: `signUpAction` detecta `identities.length === 0` y muestra "ese correo ya está registrado". El paso 9 lo comprueba con la cuenta creada por Google.               |
| El `origin` del `redirectTo` sale de `headers()`. Si el proyecto se abre por la IP de LAN (`192.168.1.13:3000`), la URL no está en las Redirect URLs de Supabase y el callback se rechaza.                                  | Asumido: este spec es solo `localhost`, igual que el SPEC 13. El error de Supabase es explícito y no rompe nada más.                                                                |
| Los pasos 7 y 8 dependen de pantallas de terceros que no se dejan guionizar con Playwright de forma fiable.                                                                                                                 | Se prueban a mano y se documentan con capturas en `.playwright-screenshots/`. El resto del recorrido —onboarding, guardado de puntuación, cierre de sesión— sí va con Playwright.   |

## Qué **no** está en este spec

- Vincular o desvincular proveedores desde la cuenta (`linkIdentity` / `unlinkIdentity`). El enlazado automático por correo cubre el caso normal.
- Página de perfil o "mis puntuaciones".
- Editar el `player_name` después de elegirlo.
- Más proveedores: Discord, Apple, X.
- URLs de redirección de producción o de LAN. Solo `http://localhost:3000`.
- Protección de rutas o redirecciones por sesión en el proxy. Un usuario sin perfil es un invitado con sesión, y el sitio sigue público y jugable.
- Reclamar las puntuaciones anónimas ya guardadas.
- Borrar la cuenta.
- Tests.

Cada uno de estos, si llega a necesitarse, va en su propio spec.
