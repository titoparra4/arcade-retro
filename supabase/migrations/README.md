# Migraciones

**Toda modificación del esquema de desarrollo se aplica como migración.** No se toca el SQL Editor
del dashboard, no se usa `execute_sql` para DDL, no se edita nada a mano. La razón es una sola: lo que
se aplica aquí es exactamente lo que después se aplica en producción.

Este directorio es el historial en git. La tabla `supabase_migrations.schema_migrations` del proyecto
de desarrollo es el historial en la base de datos. **Los dos tienen que coincidir siempre**: un
archivo por versión, mismo nombre, mismo contenido.

---

## Hacer un cambio en desarrollo

1. Claude aplica el cambio con `mcp__supabase__apply_migration`, en snake_case y con un nombre que
   diga qué hace (`add_streak_to_scores`, no `update_schema`).
2. Supabase le asigna una versión (timestamp UTC) y la registra.
3. **En el mismo paso**, Claude guarda el SQL _idéntico_ en
   `supabase/migrations/<version>_<nombre>.sql`.
4. Tito revisa el diff y commitea.

Si el paso 3 se salta, el cambio existe en la base de datos y no en el repo — que es justo el agujero
que este directorio vino a tapar.

### Reglas del SQL

- **Idempotente siempre que se pueda**: `create or replace`, `drop policy if exists` antes de
  `create policy`, `if not exists`. Una migración a medias tiene que poder reejecutarse.
- **Hacia adelante, nunca hacia atrás.** Una migración aplicada no se edita ni se borra: si estaba
  mal, se corrige con una migración nueva. Editar una ya aplicada rompe la correspondencia entre el
  repo y las dos bases de datos.
- **Tabla nueva ⇒ recortar grants.** El event trigger `ensure_rls` activa RLS solo; los 7 privilegios
  que Supabase concede por defecto a `anon`/`authenticated` siguen ahí. Toda migración que cree una
  tabla en `public` tiene que terminar con:
  ```sql
  revoke all on public.<tabla> from anon, authenticated;
  grant select on public.<tabla> to anon, authenticated;  -- y solo lo que haga falta más
  ```
- **Datos y esquema, separados.** Cargas de datos (catálogo de juegos, etc.) van en su propia
  migración, no mezcladas con DDL.

---

## Llevar los cambios a producción

Claude **no** tiene acceso a producción y así debe seguir (`.mcp.json` apunta solo a desarrollo). El
despliegue lo hace Tito a mano, en el SQL Editor del proyecto de producción.

### Primer despliegue (baseline)

Producción se estrena con el snapshot, no reproduciendo la historia entera:

1. `references/produccion/01-esquema.sql` — equivale a todas las migraciones de este directorio.
2. `references/produccion/02-datos-games.sql`
3. `references/produccion/03-verificacion.sql`
4. **Registrar el baseline** para que producción sepa dónde está parada: el bloque final de
   `01-esquema.sql` marca como aplicadas las versiones que el snapshot ya contiene.

Detalle completo en `references/produccion/RUNBOOK.md`, paso 1.

### Despliegues posteriores

Solo los archivos **posteriores** a la última versión registrada en producción:

```sql
-- en el SQL Editor de PRODUCCIÓN, para saber desde dónde seguir
select version, name from supabase_migrations.schema_migrations order by version;
```

Por cada archivo pendiente, en orden de versión: pegar su contenido, ejecutar y registrarlo:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('<version>', '<nombre>')
on conflict (version) do nothing;
```

Después, `03-verificacion.sql`. Lo que más importa que cuadre siguen siendo **los 9 grants** de
`anon`/`authenticated`: si salen más, alguna tabla quedó con permisos de escritura abiertos.

---

## Historial

| Versión          | Qué hace                                                      | Origen  |
| ---------------- | ------------------------------------------------------------- | ------- |
| `20260721215144` | Tablas `games` y `scores`, RLS, policies públicas, catálogo   | SPEC 04 |
| `20260727150504` | Tabla `profiles`, trigger `handle_new_user`, RLS              | SPEC 13 |
| `20260727150654` | Columna `scores.user_id`                                      | SPEC 13 |
| `20260727164444` | Guardar puntuación exige sesión (`scores_insert_own`)         | SPEC 13 |
| `20260727193632` | `handle_new_user` condicional + `profiles_insert_own` (OAuth) | SPEC 14 |
| `20260728105418` | Revoke `execute` en las funciones `security definer`          | SPEC 15 |
| `20260731103126` | Reconciliación: `rls_auto_enable` + `ensure_rls` + 9 grants   | SPEC 15 |

Las seis primeras se extrajeron de `supabase_migrations.schema_migrations` de desarrollo, donde ya
estaban registradas; llegaron al repo el 2026-07-31. La séptima registra la parte de la SPEC 15 que
se había ejecutado a mano y solo vivía en `01-esquema.sql`.
