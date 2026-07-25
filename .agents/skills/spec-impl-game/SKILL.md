---
name: spec-impl-game
description: Implementa un spec aprobado igual que /spec-impl y, al terminar, encadena los subagentes skin-designer y mobile-porter (en ese orden, uno después del otro) sobre el juego implementado. Usalo para specs de juego que además necesitan skins y mando táctil.
disable-model-invocation: true
argument-hint: <NN-spec-name>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*), Task, Agent
---

# /spec-impl-game — Implementador de specs de juego, con skins y mando táctil

## Session context

Estado actual del repositorio:
!`git status --short`

Rama actual:
!`git branch --show-current`

Specs disponibles:
!`ls specs/ 2>/dev/null || echo "La carpeta specs/ no existe"`

Specs de game jam:
!`ls -R specs/game-jam/ 2>/dev/null || echo "No hay specs de game jam"`

Configuración de creación de rama:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, sin archivo de configuración)"`

---

## Instrucciones

Este skill es `/spec-impl` **más el post-implementación**. `/spec-impl` termina en seco: cuando cierra el último paso del plan, el juego queda sin skins (`neon` / `retro` / `clasico`) y sin mando táctil, y hay que acordarse de invocar a mano los dos subagentes que tapan esos huecos, en el orden correcto. Este skill cierra ese ciclo: ejecuta el mismo procedimiento de `/spec-impl` — leyéndolo, no copiándolo — y al terminar encadena **`skin-designer` primero y `mobile-porter` después**, uno tras otro, nunca en paralelo, con confirmación tuya antes de cada uno.

Seguí estas fases en orden estricto. **No avances a la siguiente fase si la anterior no se completó correctamente.**

---

### Fase 0 — Cargar el procedimiento base

**Antes de hacer nada, leé COMPLETO `.agents/skills/spec-impl/SKILL.md`** (en este repo, no en otro lado). Esa lectura es obligatoria.

Este skill **no reimplementa el procedimiento**: ejecuta las Fases 1–4 de `/spec-impl` tal cual están escritas ahí, pasándoles el mismo `$ARGUMENTS` que recibiste vos:

- **Fase 1** — identificar el spec.
- **Fase 2** — validar que el estado significa "Aprobado".
- **Fase 3** — crear la rama git y cambiar a ella, y mostrar el resumen del spec.
- **Fase 4** — implementar paso a paso, pausando después de cada paso.

Todo lo que dice `/spec-impl` se hereda sin cambios: el bloqueo con su mensaje de error estándar si el estado no significa "Aprobado", el flag `AutoCreateBranch`, el resumen de objetivo/alcance/plan/criterios antes de arrancar, el ritmo de un paso por pausa, y la regla de detenerse ante una ambigüedad en vez de improvisar.

**Solo hay dos desviaciones**, y son estas:

1. **Búsqueda recursiva de specs.** La Fase 1 de `/spec-impl` solo mira `specs/` plano. Los specs de game jam viven un par de niveles más abajo, en `specs/game-jam/<juego>/NN-slug.md` (p. ej. `specs/game-jam/frogger/01-frogger-core.md`). Buscá también ahí. Si `$ARGUMENTS` matchea más de un archivo, listá los candidatos con su ruta completa y preguntá cuál. El nombre de rama sale igual del basename sin extensión: `01-frogger-core.md` → `spec-01-frogger-core`.

2. **El cierre de la Fase 4 no termina la ejecución.** Donde `/spec-impl` muestra su mensaje final ("✅ Todos los pasos del plan están implementados… verificá los criterios de aceptación…"), vos **no** lo mostrás: seguís a la Fase 5 de este skill, que tiene su propio cierre.

---

### Fase 5 — Encadenar los subagentes

Se ejecuta **solo si la Fase 4 se completó**. Si la implementación quedó a medias o el usuario la abortó, no arranques esta fase.

#### Determinar el juego objetivo

Los dos subagentes **exigen** un juego objetivo y tienen prohibido elegirlo por su cuenta, así que lo resolvés vos antes de invocar nada:

- El valor es el `id` del juego tal como quedó en `GAME_REGISTRY` (`app/components/games/registry.ts`) y en la URL `/games/<id>/jugar`.
- Confirmalo con el usuario en el mensaje de cierre de abajo. Si tenés dudas entre varios ids, preguntá — no adivines.
- **Si el spec implementado no agregó ni modificó un juego** (no hay entrada en `GAME_REGISTRY` que le corresponda), decíselo al usuario, **salteá la Fase 5 entera** y sugerí `/spec-impl` para specs de ese tipo. No inventes un juego objetivo con tal de tener algo que pasarle a los agentes.

#### Reglas de invocación

- **Secuencial, nunca en paralelo.** Una sola llamada al Agent tool por vez, con `run_in_background: false`. Esperás a que la primera termine **y a que el usuario revise/commitee** antes de lanzar la segunda. Está prohibido emitir las dos llamadas en el mismo mensaje.
- **El reporte final de un subagente no se le muestra al usuario** — al volver, relatale vos lo que importa: qué archivos tocó, qué decidió, qué quedó pendiente.
- **Si un agente falla o queda a medias:** reportá qué pasó y **no** lances el siguiente sin preguntar.
- Este skill **no commitea** — Tito commitea cada paso él mismo. Revisá que no haya secretos antes de cada pausa. (Ver `[[spec-impl-user-commits]]`.)

#### Mensaje de cierre y primer gate

```
✅ Todos los pasos del plan están implementados.

Juego objetivo detectado: <id>   (entrada en GAME_REGISTRY, jugable en /games/<id>/jugar)

Falta el post-implementación, en dos etapas y en este orden:
  1. skin-designer  → skins neon / retro / clasico para <id>
  2. mobile-porter  → mando táctil para <id>

¿Lanzo skin-designer sobre <id>?
```

Esperá confirmación explícita. No arranques sin ella.

#### 5a — skin-designer

Con el OK, una única llamada `Agent(subagent_type: "skin-designer", run_in_background: false)`. El prompt tiene que incluir:

- el `id` del juego objetivo, explícito y sin ambigüedad;
- la ruta de su componente (`app/components/games/<id>-game.tsx`);
- la ruta del spec que se acaba de implementar;
- la rama activa;
- el recordatorio de que Tito commitea cada paso él mismo.

Al volver: relatá el resumen al usuario y pausá para que revise y commitee.

```
skin-designer terminó. Revisá y commiteá el diff cuando quieras.

¿Lanzo ahora mobile-porter sobre <id>?
```

#### 5b — mobile-porter

Con el OK, una única llamada `Agent(subagent_type: "mobile-porter", run_in_background: false)`, con el mismo contexto que le pasaste a `skin-designer`. Al volver, relatá su resumen igual.

#### Cierre final

```
✅ Implementación + skins + mando táctil completos para <id>.

Pendiente tuyo:
  - Verificar los criterios de aceptación del spec uno por uno.
  - Pasar el estado del spec a "Implementado".
  - Commitear y mergear la rama <rama>.
```

---

## Resumen del comportamiento esperado

```
/spec-impl-game 01-frogger-core   (estado: Aprobado)

  Fase 0  →  Lee .agents/skills/spec-impl/SKILL.md completo
  Fase 1  →  Busca en specs/ y en specs/game-jam/**
              Encuentra specs/game-jam/frogger/01-frogger-core.md
  Fase 2  →  Lee el estado → "Aprobado" → ✅ continúa
  Fase 3  →  git checkout -b spec-01-frogger-core
              Muestra objetivo, alcance, plan y criterios
  Fase 4  →  Implementa paso a paso, pausando después de cada paso
  Fase 5  →  Detecta el juego objetivo (frogger) y pide OK
              → skin-designer(frogger)   → pausa para commit
              → mobile-porter(frogger)   → pausa para commit
              Cierre: verificar criterios, pasar a "Implementado", mergear

/spec-impl-game 02-frogger-extra   (estado: Borrador)

  Fase 0  →  Lee el procedimiento base
  Fase 1  →  Encuentra el spec
  Fase 2  →  Lee el estado → "Borrador" → ❌ se detiene
              Muestra el mensaje de error estándar de /spec-impl
              No crea rama, no toca código, no lanza ningún agente

/spec-impl-game 12-hall-of-fame   (spec que no toca ningún juego)

  Fases 0-4 →  Igual que /spec-impl, implementación completa
  Fase 5    →  No hay entrada en GAME_REGISTRY que le corresponda
                Avisa, saltea los agentes, y sugiere /spec-impl para specs así
```

**La única diferencia con `/spec-impl` es la Fase 5** (más la búsqueda recursiva de specs de la Fase 1). Si un spec no termina en un juego jugable, usá `/spec-impl` directamente.
