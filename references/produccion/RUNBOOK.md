# Runbook — Despliegue de Arcade Retro a producción

Guía para llevar Arcade Retro del proyecto Supabase de **desarrollo** al de **producción**.

> **Claude no tiene acceso a producción, y así debe seguir.**
> El MCP server de `.mcp.json` apunta solo al proyecto de desarrollo
> (`project_ref=nwduxopaviglnluuobbl`). **No añadas ahí el ref de producción.**
> Todo lo de este documento lo ejecutas tú.

Sustituye a lo largo del documento:

| Marcador       | Qué es                                                            |
| -------------- | ----------------------------------------------------------------- |
| `<TU_DOMINIO>` | El dominio público de la app (ej. `arcade-retro.vercel.app`)      |
| `<REF_PROD>`   | El _project ref_ de Supabase producción (la parte rara de la URL) |

---

## Orden de ejecución

Los pasos 1 y 2 son independientes, pero **el 3 no funciona hasta que los dos anteriores están hechos**:
sin las Redirect URLs configuradas, el login con Google o GitHub falla.

| #   | Paso                            | Dónde                     |
| --- | ------------------------------- | ------------------------- |
| 0   | Antes de empezar                | Local                     |
| 1   | Esquema y datos                 | SQL Editor de Supabase    |
| 2   | Configuración de Authentication | Dashboard de Supabase     |
| 3   | OAuth: Google y GitHub          | Google, GitHub y Supabase |
| 4   | Variables de entorno            | Hosting                   |
| 5   | Verificación                    | Todo                      |

---

## Paso 0 — Antes de empezar

### 0.1 — Ninguna clave real en el repo

`.gitignore` tiene un `!.env.template` explícito, así que **ese archivo sí se versiona**. Solo puede
contener marcadores. Compruébalo antes de cada commit:

```bash
git diff .env.template
```

Los valores reales viven únicamente en `.env.local`, que sí está ignorado.

### 0.2 — Actualizar Next.js (recomendado antes de desplegar)

`package.json` fija `next` en **16.2.10**, que arrastra advisories publicados sobre exposición de
endpoints de Server Functions, DoS vía Server Actions y bypass del proxy con Turbopack. Los tres
tocan superficie real de esta app: hay 7 Server Actions y `proxy.ts` refresca la sesión en cada
petición.

```bash
npm install next@16.2.12
npm run build   # comprobar que sigue compilando antes de desplegar
```

Lo propuso la auditoría de `references/security/audits/2026-07-28-auditoria.md` y sigue pendiente.
Es más barato hacerlo ahora que con la app ya publicada.

---

## Paso 1 — Esquema y datos

> Este paso es el **primer despliegue**, el que parte de un proyecto vacío. Para los cambios de
> esquema que vengan después, ver "Cambios de esquema posteriores" al final del documento: no se
> vuelve a tocar `01-esquema.sql`, se aplican las migraciones pendientes de `supabase/migrations/`.

En el **SQL Editor del proyecto de producción**, en este orden:

1. **`01-esquema.sql`** — tablas, índices, funciones, triggers, RLS, policies y grants. Su paso 9
   registra además las 7 migraciones que el archivo ya contiene, para que producción quede alineada
   con `supabase/migrations/` desde el minuto uno.
2. **`02-datos-games.sql`** — las 8 filas del catálogo de juegos.
3. **`03-verificacion.sql`** — comprobaciones de solo lectura.

Los tres son idempotentes: si algo falla a medias, se pueden volver a ejecutar.

**No sigas al paso 2 hasta que `03-verificacion.sql` cuadre entero.** Lo más importante que verifica
es que haya **exactamente 9 grants** para `anon`/`authenticated`: si salen más, las tablas quedaron
con permisos de escritura abiertos.

Lo que **no** viaja a producción, a propósito:

- Las 18 filas de `scores` de desarrollo — son partidas de prueba.
- Los 2 usuarios (`auth.users` + `profiles`) — migrar cuentas entre proyectos exige `service_role` y
  copiar hashes de contraseña; las cuentas de OAuth se recrean solas al hacer login.

---

## Paso 2 — Configuración de Authentication

**Nada de este paso se puede hacer por SQL ni por MCP**, y toda la configuración de desarrollo apunta
a `localhost`. Es la parte que más falla en un despliegue.

### 2.1 — Authentication → URL Configuration

| Ajuste            | Valor                     |
| ----------------- | ------------------------- |
| **Site URL**      | `https://<TU_DOMINIO>`    |
| **Redirect URLs** | `https://<TU_DOMINIO>/**` |

Las dos importan, y por motivos distintos:

- **Site URL** es lo que sustituye `{{ .SiteURL }}` en las plantillas de email. Si se queda en
  `localhost`, los correos de confirmación llegarán con enlaces a `localhost` y ningún usuario podrá
  activar su cuenta.
- **Redirect URLs** es la lista blanca de destinos permitidos tras un login. El código construye el
  `redirectTo` de OAuth a partir de la cabecera `origin` de la petición
  (`app/auth/actions.ts:179-186`), o sea el dominio real desde el que se sirve la app. Si ese dominio
  no está en la lista, Supabase rechaza el retorno. El patrón `/**` cubre `/auth/callback` y
  `/auth/confirm`.

Si además quieres seguir desarrollando en local contra producción (no recomendado), tendrías que
añadir `http://localhost:3000/**` a la lista. Mejor mantener local apuntando a desarrollo.

### 2.2 — Authentication → Providers → Email

| Ajuste                     | Valor                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| Confirm email              | **Enabled**                                                          |
| Minimum password length    | **8**                                                                |
| Leaked password protection | Solo disponible en plan Pro. Si sigues en Free, queda como pendiente |

### 2.3 — Authentication → Email Templates ⚠️

**Hay que editar las dos plantillas a mano.** Las de fábrica usan `{{ .ConfirmationURL }}`, que
devuelve el token en el **hash** de la URL (`#access_token=...`). El hash no llega nunca al servidor,
así que el Route Handler `app/auth/confirm/route.ts` no lo ve y la confirmación falla en silencio: el
usuario aterriza en la home sin sesión y sin saber por qué.

**Confirm signup** → el enlace debe apuntar a:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

**Reset password** → el enlace debe apuntar a:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

`type=recovery` es lo que hace que el handler redirija a `/auth/nueva-contrasena` en lugar de a
`/games`. Si se pone `email` en la de recuperación, el usuario acaba en el arcade sin poder cambiar
la contraseña.

### 2.4 — Authentication → Rate Limits

Revisa el límite de signup (por defecto 30/hora/IP). En producción es la única defensa real contra el
alta masiva de cuentas — ver la nota sobre el rate limiter de la app en "Riesgos conocidos".

---

## Paso 3 — OAuth: Google y GitHub

Tres sitios distintos y el orden importa: primero se crean las credenciales fuera, después se pegan
en Supabase.

> **El callback de OAuth apunta a Supabase, no a tu app.** Es
> `https://<REF_PROD>.supabase.co/auth/v1/callback`. El error más común es poner ahí el dominio de la
> app. El flujo es: proveedor → Supabase → `https://<TU_DOMINIO>/auth/callback` (esto último es lo que
> cubren las Redirect URLs del paso 2.1).

### 3.1 — Google

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**.
2. Abre el cliente OAuth existente o crea uno nuevo de tipo _Web application_.
3. En **Authorized redirect URIs**, añade:
   ```
   https://<REF_PROD>.supabase.co/auth/v1/callback
   ```
   Google sí admite varias URIs por cliente, así que puedes reutilizar el de desarrollo añadiendo esta
   segunda entrada. Aun así, tener clientes separados para dev y prod es más limpio.
4. Copia el **Client ID** y el **Client Secret**.

### 3.2 — GitHub ⚠️ requiere una app nueva

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Authorization callback URL**:
   ```
   https://<REF_PROD>.supabase.co/auth/v1/callback
   ```
3. Copia el **Client ID** y genera un **Client Secret**.

**GitHub solo admite una callback URL por aplicación**, así que aquí no vale reutilizar la app de
desarrollo: hace falta una segunda OAuth App exclusiva de producción.

### 3.3 — Supabase producción → Authentication → Providers

Habilita **Google** y **GitHub** y pega en cada uno el Client ID y el Client Secret del paso anterior.

**Comportamiento heredado que conviene tener presente:** el enlazado automático de identidades por
email verificado está activo. Si alguien se registra con email y luego entra con un Google que usa
esa misma dirección verificada, ambas identidades acaban en la misma cuenta. Es el default de
Supabase, no tiene interruptor, y se aceptó como feature en la SPEC 14.

---

## Paso 4 — Variables de entorno en el hosting

Solo cuatro variables se leen realmente en el código:

| Variable                               | Valor en producción                | Dónde se usa                                    |
| -------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL del proyecto de **producción** | `lib/supabase/{client,server,proxy}.ts`         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key de **producción**  | `lib/supabase/{client,server,proxy}.ts`         |
| `RESEND_API_KEY`                       | la clave de Resend                 | `app/about/actions.ts` (formulario de contacto) |
| `NEXT_PUBLIC_APP_URL`                  | `https://<TU_DOMINIO>`             | declarada, todavía sin consumidor               |

Dos avisos:

- **`SUPABASE_DB_PASSWORD` no se despliega.** No la lee ningún código: es solo para conectarte
  directamente a Postgres desde tu máquina. Ponerla en el hosting es exponerla sin ganar nada.
- **`RESEND_API_KEY` es el único secreto de verdad** de la lista. La publishable key de Supabase es
  pública por diseño (va al navegador); lo que protege los datos son las policies y los grants del
  paso 1, no el secreto de esa clave.

**Resend está en modo sandbox**, así que `sendContactEmail` solo entrega correo al dueño de la cuenta.
Para que el formulario de contacto de `/about` funcione de verdad con visitantes, hay que verificar un
dominio en Resend.

---

## Paso 5 — Verificación end-to-end

Con la app ya desplegada:

1. **Lectura pública** — abre `https://<TU_DOMINIO>/games` sin iniciar sesión. Deben verse los 8
   juegos. Si sale vacío, es que `02-datos-games.sql` no se ejecutó o las env vars apuntan al
   proyecto equivocado.
2. **Escritura bloqueada** — los dos `curl` del final de `03-verificacion.sql`: lectura 200, escritura
   401 con código `42501`.
3. **Registro con email** — crea una cuenta. Debe llegar el correo, y el enlace tiene que aterrizar en
   `/auth/confirm` y de ahí a la app **con sesión iniciada**. Si acabas en la home con un `#` largo en
   la URL, la plantilla de email del paso 2.3 no se editó.
4. **Login con Google** y **login con GitHub**. Si cualquiera de los dos rebota, el sospechoso número
   uno es la lista de Redirect URLs (2.1); el segundo, la callback URL en el proveedor (3.1 / 3.2).
5. **Perfil** — al entrar por OAuth por primera vez debe pedirte elegir `player_name` en
   `/auth/completar-perfil`. Prueba también a repetir un nombre ya cogido: debe rechazarlo.
6. **Partida completa** — juega a `rocas`, muere, guarda la puntuación y compruébala en `/salon`.
   Esto ejercita la policy `scores_insert_own`, que es la más restrictiva de las seis.
7. **Recuperar contraseña** — pide un reset y comprueba que el enlace lleva a
   `/auth/nueva-contrasena` (y no a `/games`).

De los 8 juegos del catálogo, solo 5 son jugables (`rocas`, `caida`, `bloque-buster`, `serpentina`,
`ranaria`). `gloton`, `invasores` y `duelo-pixel` mostrarán el placeholder decorativo: es lo
esperado, no un fallo del despliegue.

---

## Riesgos conocidos que se llevan a producción

Se listan para que sea una decisión consciente, no una sorpresa.

1. **`next@16.2.10` tiene advisories sin parchear** que tocan Server Actions, Turbopack y el proxy.
   Fix: `npm install next@16.2.12` (paso 0.2). **Es lo más importante de esta lista.**

2. **El rate limiter no limita en serverless.** `lib/rate-limit.ts` es un `Map` en memoria por
   proceso: se reinicia en cada cold start y no se comparte entre instancias. Los límites configurados
   (registro 5/h, login 10/15min, reset 3/h, contacto 3/h) son reales en un servidor único y
   prácticamente decorativos en serverless. Además, la auditoría confirmó que se puede saltar
   falsificando la cabecera `x-forwarded-for`. Mientras tanto, el límite de signup del dashboard
   (2.4) es la defensa que sí se aplica de verdad.

3. **No hay cabecera CSP.** Omisión deliberada de la SPEC 15, con spec propio pendiente. Las otras
   cinco cabeceras sí están en `next.config.ts`.

4. **No existe cliente `service_role`.** Decisión sostenida desde la SPEC 04. Consecuencia: la app no
   puede borrar cuentas ni desvincular identidades. Si algún día hace falta, será un spec nuevo, y
   ese secreto **nunca** debe acabar en código de cliente.

5. **Ninguna ruta está protegida.** `proxy.ts` solo refresca la sesión; no redirige ni bloquea. Es el
   diseño actual (las páginas privadas comprueban la sesión por su cuenta), pero conviene saberlo.

---

## Cambios de esquema posteriores

Del primer despliegue en adelante, **producción se actualiza aplicando migraciones**, no reejecutando
`01-esquema.sql`. El proceso completo está en `supabase/migrations/README.md`; el resumen operativo:

1. Averigua dónde está parada producción, en su SQL Editor:

   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   ```

2. Compara con los archivos de `supabase/migrations/`. Los que tengan una versión **mayor** que la
   última registrada son los pendientes.

3. Por cada pendiente, **en orden de versión**: pega su contenido, ejecútalo, y regístralo:

   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('<version>', '<nombre>')
   on conflict (version) do nothing;
   ```

4. Vuelve a pasar **`03-verificacion.sql`**. Si la migración creó una tabla, lo primero que hay que
   mirar es el recuento de grants: ya no serán 9, y el número nuevo tiene que ser exactamente el que
   esa tabla necesita. Cualquier privilegio de más es escritura abierta a `anon`.

`01-esquema.sql` no se toca en este flujo. Sigue siendo el baseline para estrenar un proyecto desde
cero; si algún día se regenera, se regenera entero desde el estado real de desarrollo, no parcheando.

---

## Después del despliegue

- Ejecuta el agente **`security-auditor`** contra producción. Su contrato es la SPEC 15
  (`specs/15-endurecimiento-seguridad.md`) y `references/security/security-checklist.md`; el informe
  va a `references/security/audits/`. Como no tiene acceso al proyecto de producción, tendrás que
  pegarle tú la salida de `03-verificacion.sql`.
- **Todo cambio de esquema en desarrollo va como migración**, con su archivo en
  `supabase/migrations/` commiteado en el mismo paso. Nada de DDL suelto en el SQL Editor: lo que no
  queda como migración no llega nunca a producción.
- Ojo con las tablas nuevas: nacen con los 7 grants abiertos para `anon`. Ver el aviso final de
  `01-esquema.sql`.
