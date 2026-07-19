# SPEC 03 — Página "Acerca de" y formulario de contacto

> **Estado:** Aprobado
> **Depende de:** SPEC 02
> **Fecha:** 2026-07-19
> **Objetivo:** Implementar la página "Acerca de" (`/about`) del template `references/templates/home-about/` con su formulario de contacto funcional, que envía el mensaje por correo mediante Resend (modo sandbox) usando una Server Action.

## Alcance

**Dentro:**

- Nueva ruta `/about` con la página del template `about.jsx`: hero (kicker "▸ ACERCA DE", título, párrafo de misión), fila de 3 highlights con iconos pixel (`HighlightIcon`), banner divisor animado y sección de contacto (intro con tips + formulario).
- Animación de aparición al hacer scroll con el mismo patrón `reveal`/`IntersectionObserver` ya usado en el home.
- Formulario de contacto como componente cliente con campos nombre / correo / mensaje, validación de campos vacíos con efecto shake (como el template) y los estados nuevos del envío real: **enviando** (botón deshabilitado, texto "TRANSMITIENDO…"), **éxito** (terminal del template, con botón "ENVIAR OTRO MENSAJE") y **error del servidor** (mensaje estilo terminal en rojo debajo del botón, conservando lo escrito).
- Server Action que valida los campos en servidor y envía el correo con **Resend en modo sandbox**: `from: onboarding@resend.dev`, `to: tito.parra4@hotmail.com`, `replyTo` con el correo del visitante, y el nombre + mensaje en el cuerpo.
- Instalar la dependencia `resend`.
- `RESEND_API_KEY` leída de entorno; crear `.env.example` documentando la variable (la key real va a mano en `.env.local`, que no se versiona).
- Portar de `references/templates/home-about/styles.css` a `app/globals.css` **solo las clases del about** (`.about-*`, `.highlight*`, `.hl-*`, `.div-*`, `.contact-*`, `.tip*`, `.field`, `.shake`, `.terminal-success`, `.term-*`, `.line`, `.prompt`, `.caret` y afines) — las del home ya están.
- Enlace "Acerca de" en el nav (escritorio + panel móvil), activo en `/about` — pendiente desde el SPEC 02.
- Textos adaptados a "Arcade Retro" donde el template dice "Vault" (p. ej. "ACERCA DE ARCADE RETRO", terminal "RETRO-OS // TERMINAL"), siguiendo la convención de los specs anteriores.

**Fuera de alcance (para specs futuros si llegan):**

- Correo de confirmación al visitante.
- Anti-spam: captcha, rate limiting, honeypot.
- Persistencia de los mensajes (base de datos o similar).
- Dominio verificado en Resend / envío en producción a direcciones arbitrarias.
- Tests (no hay setup de tests en el proyecto).

## Modelo de datos

Este spec no introduce datos persistentes ni toca `app/data.ts`, `localStorage` o el contexto de usuario. Lo nuevo es el contrato entre el formulario y la Server Action:

```ts
// app/about/actions.ts
"use server";

export type ContactInput = {
  name: string;
  email: string;
  msg: string;
};

export type ContactResult =
  | { ok: true }
  | { ok: false; error: string }; // mensaje mostrable en la terminal de error

export async function sendContactEmail(input: ContactInput): Promise<ContactResult>;
```

- La action re-valida en servidor (campos no vacíos, email con forma válida) — la validación del cliente es solo UX, no seguridad.
- `ContactResult.error` es un texto genérico apto para pantalla ("NO SE PUDO TRANSMITIR EL MENSAJE. INTENTA DE NUEVO."); el detalle real del fallo de Resend va a `console.error` del servidor, nunca al cliente.

Variables de entorno:

| Variable | Dónde | Contenido |
| --- | --- | --- |
| `RESEND_API_KEY` | `.env.local` (no versionado; se añade a mano) | API key de la cuenta Resend |

`.env.example` versionado documenta la variable con un valor placeholder.

## Plan de implementación

1. **Dependencia y entorno.** `npm install resend`; crear `.env.example` con `RESEND_API_KEY=re_xxxxxxxx` como placeholder; verificar que `.gitignore` ya excluye `.env.local` (la key real se pega ahí a mano). Prueba: `npm run build` sigue pasando.
2. **CSS del about.** Portar a `app/globals.css` las clases del about listadas en el alcance (desde `references/templates/home-about/styles.css`), después de los estilos existentes; ante una clase que ya exista (p. ej. `.kicker`), conservar la versión ya portada. Prueba: las pantallas actuales se ven igual que antes.
3. **Esqueleto de la página.** Crear `app/components/about-content.tsx` (cliente, con el patrón reveal) con hero, fila de highlights (`HighlightIcon`) y banner divisor, textos adaptados a "Arcade Retro"; crear `app/about/page.tsx` que lo renderiza. Prueba: `/about` muestra hero, highlights y divisor con sus animaciones.
4. **Formulario (UI).** Añadir la sección de contacto a `about-content.tsx`: intro con tips y formulario con estado local, validación de vacíos con shake y la terminal de éxito del template (aún sin envío real; el submit solo pasa a éxito como en el template). Prueba: validación y ambas vistas del formulario funcionan.
5. **Server Action y envío real.** Crear `app/about/actions.ts` con `sendContactEmail` (re-validación en servidor + Resend sandbox: `from: onboarding@resend.dev`, `to: tito.parra4@hotmail.com`, `replyTo` del visitante). Conectar el formulario: estado "TRANSMITIENDO…" con botón deshabilitado, éxito solo si `ok: true`, terminal de error si `ok: false` conservando lo escrito. Prueba: enviar el formulario y confirmar que el correo llega a la bandeja con reply-to correcto; probar el error (p. ej. key inválida) y ver la terminal roja.
6. **Nav.** Añadir "Acerca de" (→ `/about`, activo en `/about`) al nav de escritorio y al panel móvil. Prueba: el enlace navega y el estado activo no interfiere con Inicio/Biblioteca.
7. **Cierre.** `npm run build` sin errores y revisión visual de `/about` contra `arcade-vault-standalone.html` (desktop y viewport móvil).

Nota para `/spec-impl`: el trabajo de UI es portado fiel del template; usar `/frontend-design` donde haya que tomar decisiones visuales nuevas (p. ej. la terminal de error, que no existe en el template).

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] `/about` carga sin errores en la consola del navegador, con hero, 3 highlights, banner divisor y sección de contacto.
- [ ] Las secciones aparecen con la animación de reveal al hacer scroll y los pixels del divisor animan.
- [ ] Enviar el formulario con algún campo vacío no llama a la action: hace shake y no cambia de vista.
- [ ] Al enviar con datos válidos, el botón muestra "TRANSMITIENDO…" deshabilitado y, al resolver, aparece la terminal de éxito ("RETRO-OS // TERMINAL") con el nombre del visitante en mayúsculas.
- [ ] El correo llega a `tito.parra4@hotmail.com` con el nombre y mensaje del visitante, y responder desde la bandeja dirige al correo del visitante (`replyTo`).
- [ ] Si Resend falla (p. ej. `RESEND_API_KEY` inválida), aparece la terminal de error con mensaje genérico, lo escrito se conserva y se puede reintentar; el detalle del fallo solo aparece en la consola del servidor.
- [ ] "ENVIAR OTRO MENSAJE" vuelve al formulario vacío.
- [ ] La action re-valida en servidor: invocada con campos vacíos o email malformado devuelve `{ ok: false }` sin llamar a Resend.
- [ ] En el nav (escritorio y panel móvil), "Acerca de" navega a `/about` y está activo solo ahí; Inicio y Biblioteca conservan su estado activo.
- [ ] Ningún texto visible dice "Vault" (todo adaptado a "Arcade Retro", incluida la terminal "RETRO-OS // TERMINAL").
- [ ] La apariencia coincide con `arcade-vault-standalone.html` en desktop y viewport móvil.
- [ ] Las pantallas de los SPEC 01 y 02 no cambian visualmente.
- [ ] `.env.example` está versionado con el placeholder; `.env.local` no está versionado.

## Decisiones

- **Sí:** ruta `/about`. Coherente con las URLs existentes en inglés (`/games`, `/auth`).
- **Sí:** Server Action (`app/about/actions.ts`) en lugar de Route Handler. El formulario la invoca directamente sin exponer un endpoint público extra; patrón idiomático de Next 16 para formularios.
- **No:** Route Handler `app/api/contact/route.ts`. Descartado por lo anterior.
- **Sí:** Resend en **modo sandbox** — `from: onboarding@resend.dev`, `to` fijo a `tito.parra4@hotmail.com` (el correo de la cuenta, único destino que el sandbox permite). Verificar dominio queda para un spec futuro si el proyecto sale a producción.
- **Sí:** `replyTo` con el correo del visitante, para responder directo desde la bandeja.
- **Sí:** re-validación en servidor dentro de la action. La validación del cliente es solo UX; la action es invocable desde fuera del formulario.
- **Sí:** error genérico en pantalla, detalle real solo en `console.error` del servidor. No filtrar información de la API al cliente.
- **Sí:** estados nuevos "TRANSMITIENDO…" y terminal de error conservando lo escrito. El template no los tiene porque no enviaba nada real.
- **Sí:** textos adaptados a "Arcade Retro", incluida la terminal de éxito → "RETRO-OS // TERMINAL". Regla heredada de los specs 01–02: ningún "Vault" visible.
- **Sí:** enlace "Acerca de" en el nav en este spec. Estaba explícitamente diferido desde el SPEC 02 a "su spec", que es este.
- **Sí:** un único componente cliente `about-content.tsx` con sus piezas internas (`HighlightIcon`, formulario), como `home-landing.tsx`. La página no comparte piezas con otras rutas.
- **No:** correo de confirmación al visitante, anti-spam (captcha/rate limiting/honeypot) y persistencia de mensajes. Excluidos por decisión del usuario; cada uno sería su propio spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El sandbox de Resend solo entrega al correo de la cuenta: si el `to` cambia o el proyecto se despliega esperando otros destinos, el envío falla con 403 | El `to` queda como constante fija documentada en la action; la limitación queda registrada en las decisiones y salir del sandbox tiene su propio spec futuro. |
| `RESEND_API_KEY` ausente (clon fresco sin `.env.local`): la action reventaría en runtime | La action comprueba la variable al inicio y devuelve `{ ok: false }` con el error genérico + `console.error` claro en servidor; `.env.example` documenta la variable. |
| Clases del template con nombres genéricos (`.field`, `.line`, `.tip`) podrían colisionar con clases ya portadas en `globals.css` y alterar pantallas existentes | Portar solo los bloques del about; ante una clase duplicada, comparar con la existente y conservarla. El último criterio de aceptación verifica que SPEC 01–02 no cambian visualmente. |
| La Server Action es invocable desde fuera del formulario (sin captcha ni rate limiting, excluidos de este spec): posible spam | Riesgo residual aceptado: la re-validación en servidor filtra payloads vacíos y en sandbox el único destino posible es la propia bandeja. El anti-spam llegará en su spec si el proyecto sale a producción. |
