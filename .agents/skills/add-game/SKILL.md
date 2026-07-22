---
name: add-game
description: Crea (si hace falta, usando /spec como referencia) e implementa un spec aprobado que agrega un juego real jugable con leaderboard a la plataforma — porta la lógica desde references/started-games/ o la escribe desde cero, crea el componente canvas, lo registra en GAME_REGISTRY, y da de alta el juego en la tabla `games` de Supabase. Reemplaza a /spec-impl específicamente para specs de "agregar un juego nuevo".
disable-model-invocation: true
argument-hint: <NN-spec-name o descripción del juego nuevo>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*), Bash(npm run build:*), mcp__supabase__execute_sql, mcp__supabase__list_tables
---

# /add-game — Creador e implementador de specs que agregan un juego nuevo

## Session context

Estado actual del repositorio:
!`git status --short`

Rama actual:
!`git branch --show-current`

Specs disponibles:
!`ls specs/ 2>/dev/null || echo "La carpeta specs/ no existe"`

Configuración de creación de rama:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, sin archivo de configuración)"`

Juegos ya registrados:
!`cat app/components/games/registry.ts 2>/dev/null || echo "registry.ts no existe todavía"`

---

## Instrucciones

Este skill es como `/spec-impl`, pero especializado: solo trabaja con specs cuyo objetivo es **agregar un juego real jugable con leaderboard** a la plataforma (portado desde `references/started-games/` o escrito desde cero). A diferencia de `/spec-impl`, si el spec todavía no existe, este skill puede crearlo — usando `/spec` como referencia, nunca improvisando su propio formato — antes de seguir a la validación/implementación. Las Fases 2–3 (validar estado, crear rama) son idénticas a `/spec-impl`. La Fase 4 reemplaza el "implementa el plan libremente" genérico por la receta mecánica ya probada en SPEC 05 (Asteroids) y SPEC 06 (tabla `games`/`scores`), para no tener que re-derivarla cada vez.

Sigue estas fases en orden estricto. **No avances a la siguiente fase si la anterior no se completó correctamente.**

---

### Fase 1 — Identificar el spec, o crearlo si no existe

El argumento recibido es: `$ARGUMENTS`

Si `$ARGUMENTS` viene vacío:

- Lista los archivos disponibles en `specs/` (ya los tenés arriba).
- Pedile al usuario que especifique el nombre exacto de un spec existente, o una descripción en una sola frase del juego nuevo que quiere agregar.
- Detenete y esperá una respuesta. No continúes.

Si `$ARGUMENTS` tiene un valor, primero intentá encontrar un spec existente:

- Buscá el archivo en `specs/`. El usuario puede haber escrito el nombre completo (`07-tetris`), solo el número (`07`), o solo el slug (`tetris`). Probá encontrar el archivo correcto en cualquiera de esos casos.
- Si lo encontrás, continuá directo a la Fase 2.

**Si no encontrás ningún spec que coincida**, no le pidas al usuario que "corrija el nombre" sin más — tratá `$ARGUMENTS` como la descripción inicial de un juego nuevo a especificar, y creá el spec vos mismo siguiendo el mismo método que `/spec`:

1. **Antes de escribir una sola línea del spec, leé completo `.agents/skills/spec/SKILL.md` y `.agents/skills/spec/template.md`** (en este repo, no en otro lado). Esa lectura es obligatoria — este skill nunca inventa su propio formato de spec; reutiliza exactamente las fases, el tono para preguntar, y la estructura de secciones que ya define `/spec`.
2. Seguí esas fases de `/spec` al pie de la letra (entender contexto → aclarar con preguntas en bloques de 3–5 → desarrollar el spec sección por sección, confirmando cada una → guardar como `Borrador`, nunca `Aprobado` automáticamente). Usá `$ARGUMENTS` como la descripción inicial de una sola frase, en vez de volver a pedirla si ya alcanza para arrancar la Fase 2 de `/spec`.
3. **Diferencia con `/spec` genérico:** como el dominio ya se conoce (agregar un juego con leaderboard), usá `template.md` de este mismo skill (`.agents/skills/add-game/template.md`) y los specs `specs/05-rocas-asteroids.md`/`specs/06-games-leaderboard.md` como referencia para no volver a preguntar cosas que ya tienen un patrón establecido en este proyecto (el contrato del componente, el registro `GAME_REGISTRY`, el esquema de `games`/`scores` en Supabase). Concentrá las preguntas de aclaración en lo específico de este juego nuevo: de dónde sale (`references/started-games/NN-nombre` o descripción original), `id`/slug, `title`/`short`/`long`, `cat`, `color`, `cover`, y cualquier mecánica propia del juego que no se derive de Asteroids (p. ej. mouse/puntero, assets externos, HUD que hoy sea DOM en vez de canvas).
4. Al guardar el archivo en `specs/NN-slug.md` con estado `Borrador`: confirmá la ruta al usuario, recordale que el spec queda en `Borrador` y que tiene que revisarlo y pasarlo a `Aprobado` él mismo, y **detenete ahí** — no continúes a la Fase 2 de este skill en la misma invocación. El usuario vuelve a correr `/add-game <NN-slug>` una vez que lo apruebe.

Si en cambio sí encontraste el spec en el primer intento, continuá directo a la Fase 2.

---

### Fase 2 — Validar el estado del spec

Leé el archivo del spec que localizaste en la Fase 1.

En el contenido, buscá la línea que contiene el estado del spec (`**Estado:**` / `**Status:**` o equivalente en otro idioma).

**Regla absoluta:** solo podés continuar si el estado **significa "Aprobado"** — sin importar el idioma usado (Aprobado, Approved, Aprovado, Approuvé, Genehmigt, Approvato, etc.).

Cualquier otro valor (Borrador/Draft, En revisión/In review, Implementado/Implemented, Obsoleto/Obsolete, o un valor no reconocido) significa **detenerse** y mostrar:

```
❌ No puedo implementar este spec.

Estado actual: [ESTADO ENCONTRADO]
Solo trabajo con specs cuyo estado signifique "Aprobado".

Para continuar tenés dos opciones:
  1. Si el spec está listo para implementarse, abrilo y cambiá el estado
     a "Aprobado" manualmente. Ese cambio lo hace el humano, no el agente.
  2. Si el spec todavía necesita trabajo, usá /spec [nombre] para retomarlo.
```

Si tenés dudas sobre si el valor significa "aprobado", no asumas — preguntale al usuario.

Además, verificá que el spec sea del tipo correcto para este skill: debe describir agregar un juego jugable con leaderboard (menciona un componente canvas, un `game.id`/slug, y alta en la tabla `games` de Supabase). Si el spec es sobre otra cosa, decíselo al usuario y sugerí `/spec-impl` en su lugar — no improvises una implementación fuera de este dominio.

---

### Fase 3 — Crear la rama git y cambiar a ella

Una vez confirmado que el estado significa "Aprobado":

1. Derivá el nombre de rama del nombre completo del archivo del spec, sin extensión. Formato: `spec-NN-slug` (p. ej. `07-tetris.md` → `spec-07-tetris`).
2. Leé el flag `AutoCreateBranch` del contexto de sesión de arriba (falta o no reconocido → `true` por default; solo un `false` explícito lo desactiva).
   - Si es `true`: creá/cambiá a la rama sin preguntar (`git checkout -b spec-NN-slug` si no existe, o `git checkout spec-NN-slug` si ya existe).
   - Si es `false`: preguntá `¿Crear y cambiar a la rama spec-NN-slug? [y/N]` antes de tocar git; si dice que no, avisá que vas a implementar en la rama actual y pedí confirmación explícita antes de continuar ahí.
3. Confirmá visualmente al usuario que el spec está listo y qué rama está activa (spec, rama, estado).
4. **No empieces a implementar todavía.** Mostrale primero al usuario un resumen del spec: objetivo, alcance, plan de implementación, y criterios de aceptación (buscá las secciones por significado, no por texto exacto — el spec puede estar en cualquier idioma).

---

### Fase 4 — Implementar según la receta de "agregar un juego"

Después de mostrar el resumen del spec, decile al usuario:

```
Voy a implementar el spec siguiendo esta receta (agregar un juego real con leaderboard):
  1. Metadata del juego
  2. Componente del juego
  3. Registro en GAME_REGISTRY
  4. Alta en Supabase (tabla games)
  5. Build + playtest
  6. Cierre

Voy a pausar después de cada paso para que revises el diff.

¿Arrancamos con el paso 1?
```

Esperá confirmación explícita antes de arrancar. Una vez confirmado, seguí estas reglas durante toda la implementación:

**Regla por encima de todo:** implementá lo que dice el spec. Si algo del spec te parece mejorable, mencionalo como observación pero implementá lo acordado.

**Ritmo de trabajo:** un paso a la vez, mostrás qué archivos tocaste y qué hiciste, decís "Paso N completado. ¿Revisás el diff y seguimos con el paso N+1?", y esperás confirmación.

**Si encontrás una ambigüedad** que el spec no resuelve: detenete, describila, presentá dos o tres opciones concretas, y esperá la decisión del usuario. No improvises.

**Si el usuario pide algo fuera del alcance del spec:** recordale que está fuera de alcance y sugerí anotarlo para el próximo spec.

Los seis pasos:

1. **Metadata del juego.** Confirmá contra el spec: `id`/slug (debe coincidir con la URL `/games/[id]`), `title`, `short`, `long`, `cat` (uno de `ARCADE`, `PUZZLE`, `SHOOTER`, `VERSUS`), `color` (uno de `cyan`, `magenta`, `yellow`, `green`), la clase CSS `cover` (buscá clases `cover-*` existentes en `app/globals.css` — reusá una si el spec no exige una nueva), y el origen (`references/started-games/NN-nombre` o descripción original). Si algo no está definido en el spec, preguntá antes de asumir.

2. **Componente del juego.** Creá/portá `app/components/games/<id>-game.tsx` siguiendo el contrato descrito en `template.md` (en esta misma carpeta) — leelo antes de escribir código. Si el origen es un archivo de `references/started-games/`, leé su `game.js` completo primero.

3. **Registro.** Agregá una entrada a `GAME_REGISTRY` en `app/components/games/registry.ts` (creá el archivo si todavía no existe, siguiendo el mismo contrato de `template.md`).

4. **Alta en Supabase.** Mostrale al usuario el `insert into games (...)` propuesto (columnas y checks documentados en `template.md` / SPEC 06), pedí confirmación explícita, y recién entonces ejecutalo con `mcp__supabase__execute_sql`. Verificá el resultado con una consulta de lectura (`select * from games where id = '<id>'`).

5. **Build + playtest.** Corré `npm run build` y confirmá que termina sin errores ni warnings de TypeScript. Hacé playtest manual en `/games/<id>/jugar`: controles del juego, HUD exterior en vivo (puntuación/vidas/nivel y el stat extra si aplica), PAUSA congela el loop, FIN cierra la partida con el score acumulado, GUARDAR PUNTUACIÓN inserta una fila real, JUGAR DE NUEVO reinicia completo sin recargar la página. Confirmá también que los demás juegos (decorativos y cualquier otro ya registrado) siguen sin cambios.

6. **Cierre.** Igual que `/spec-impl`: recordá verificar los criterios de aceptación del spec uno por uno, y pasar su estado a "Implementado" antes de mergear la rama.

---

## Resumen del comportamiento esperado

```
/add-game 07-tetris

  Fase 1  →  Encuentra specs/07-tetris.md
  Fase 2  →  Lee el estado → "Aprobado" → ✅ continúa
  Fase 3  →  git checkout -b spec-07-tetris
              Muestra objetivo, alcance, plan y criterios
  Fase 4  →  Metadata → Componente → Registro → Supabase → Build/playtest → Cierre,
              pausando para revisión después de cada paso

/add-game 08-arkanoid  (estado: Borrador)

  Fase 1  →  Encuentra specs/08-arkanoid.md
  Fase 2  →  Lee el estado → "Borrador" → ❌ se detiene
              Muestra el mensaje de error estándar
              No crea rama, no toca código

/add-game "quiero agregar el juego de la serpiente"  (no existe ningún spec que coincida)

  Fase 1  →  No encuentra spec en specs/
              Lee .agents/skills/spec/SKILL.md y .agents/skills/spec/template.md
              Sigue las fases de /spec (contexto → preguntas → secciones → guardar)
              apoyándose en template.md de add-game y en SPEC 05/06 como referencia
              Guarda specs/09-serpiente.md con estado "Borrador"
              Se detiene — pide revisar y aprobar antes de volver a correr /add-game
```
