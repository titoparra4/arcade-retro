# SPEC 06 — Tabla de juegos y leaderboard reales

> **Estado:** Implementado
> **Depende de:** SPEC 04 (clientes Supabase `lib/supabase/client.ts` / `server.ts`), SPEC 01 (rutas `/games`, `/games/[id]`, `/salon`, mecanismo `av_scores` que este spec reemplaza)
> **Fecha:** 2026-07-21
> **Objetivo:** Reemplazar los datos ficticios de `app/data.ts` y el leaderboard simulado (`seededScores` / `localStorage`) por tablas reales `games` y `scores` en Supabase, con la biblioteca, el detalle, el salón de la fama y el guardado de puntuaciones en `game-player.tsx` leyendo y escribiendo datos reales.

## Alcance

**Dentro:**

- Migración Supabase (`mcp__supabase__apply_migration`, aplicada directo al proyecto remoto `nwduxopaviglnluuobbl` — no hay stack local): crear tabla `games` (PK `id` = mismo slug usado hoy, `title`, `short`, `long`, `cat`, `cover`, `color`) y tabla `scores` (`id` uuid PK, `game_id` FK → `games.id`, `player_name` texto, `score` entero, `created_at` timestamptz). RLS: `SELECT` público en ambas tablas; `INSERT` público solo en `scores`.
- Seed de la migración: insertar los 8 juegos actuales de `app/data.ts` (mismo contenido, mismos ids) directamente en la tabla `games`.
- Nueva capa de acceso a datos server-side (usa `lib/supabase/server.ts`) con funciones para: listar juegos con `best`/`plays` calculados (`MAX(score)`/`COUNT(*)` desde `scores`, agrupado por juego), obtener top N scores de un juego, y top scores por juego para el salón.
- `app/data.ts`: se recorta a solo los tipos que siguen siendo útiles en el cliente (p. ej. `GameColor`, `Category`, la forma de `Game`); se eliminan `GAMES`, `PLAYERS`, `seededScores`, `ScoreRow`.
- `app/games/page.tsx` pasa a Server Component que trae los juegos desde Supabase y delega buscador/chips a un nuevo client component que recibe los juegos ya resueltos.
- `app/games/[id]/page.tsx`: reemplaza `seededScores` por el top real de `scores` para ese `game_id`; estado vacío ("Aún nadie ha jugado — sé el primero") si no hay partidas.
- `app/games/[id]/jugar/page.tsx`: busca el juego en la tabla `games` de Supabase en vez de en el array estático.
- `app/components/game-player.tsx`: `saveScore` inserta en `scores` vía `lib/supabase/client.ts` (cliente de navegador) en vez de `localStorage`; si el insert falla, el modal muestra un mensaje de error simple en vez del toast de éxito. Se elimina el uso de `av_scores`.
- `app/salon/page.tsx`: consulta el top real por juego; calcula podio y tabla desde datos reales; la fila "TU MEJOR MARCA" hace match exacto por `av_user.name` contra `player_name` en `scores` de ese juego — si no hay coincidencia, la fila no se muestra.
- `app/components/game-card.tsx` no cambia de lógica interna; sigue recibiendo `Game` con `best`/`plays` ya resueltos.

**Fuera de alcance (para specs futuros si llegan):**

- Auth real / `user_id` en `scores` — se guarda solo el nombre como texto (decisión ya tomada).
- CRUD/administración de juegos — `games` se puebla únicamente vía la migración seed; no hay pantalla para crear/editar juegos.
- Paginación más allá del top N mostrado (top 10 en detalle, top 12 en salón); no hay "ver más".
- Borrado o moderación de puntuaciones abusivas.
- Realtime (suscripciones a cambios en vivo) — cada página hace fetch normal en su carga.
- Cambiar la lógica interna de los 7 juegos decorativos o la física real de "rocas" — solo cambia el destino del guardado.
- Migrar puntuaciones que ya existieran en `av_scores` del navegador de cada usuario — la tabla `scores` arranca vacía.
- Rate limiting / anti-spam en el `INSERT` público de `scores` — riesgo aceptado y documentado.

## Modelo de datos

**Esquema Supabase** (aplicado vía migración con `mcp__supabase__apply_migration` al proyecto remoto):

```sql
create table public.games (
  id text primary key,              -- mismo slug usado hoy en la URL: /games/[id]
  title text not null,
  short text not null,
  long text not null,
  cat text not null check (cat in ('ARCADE','PUZZLE','SHOOTER','VERSUS')),
  cover text not null,              -- clase CSS de portada, p. ej. "cover-bricks"
  color text not null check (color in ('cyan','magenta','yellow','green')),
  created_at timestamptz not null default now()
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id),
  player_name text not null check (char_length(player_name) between 1 and 10),
  score integer not null check (score >= 0 and score <= 100000000),
  created_at timestamptz not null default now()
);

create index scores_game_id_score_idx on public.scores (game_id, score desc);

alter table public.games enable row level security;
alter table public.scores enable row level security;

create policy "games_select_public" on public.games for select using (true);
create policy "scores_select_public" on public.scores for select using (true);
create policy "scores_insert_public" on public.scores for insert with check (true);
```

- El `check` de `player_name` (≤10 chars) y `score` (rango razonable) son la única barrera anti-abuso de este spec — documentado como riesgo aceptado, no reemplaza rate limiting real.
- Seed: la misma migración inserta los 8 juegos actuales de `app/data.ts` (mismo `id`/contenido) en `games`.

**Contrato TypeScript** (nuevo módulo de acceso a datos, p. ej. `lib/supabase/games.ts`):

```ts
export interface GameRow {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Category;
  cover: string;
  color: GameColor;
}

export interface Game extends GameRow {
  best: number; // MAX(score) en scores para ese game_id; 0 si no hay partidas
  plays: number; // COUNT(*) en scores para ese game_id
}

export interface ScoreRow {
  rank: number;
  name: string; // player_name
  score: number;
  date: string; // created_at formateado "DD/MM/AAAA"
}

export async function getGames(): Promise<Game[]>;
export async function getGame(id: string): Promise<Game | null>;
export async function getTopScores(
  gameId: string,
  limit?: number,
): Promise<ScoreRow[]>; // limit por defecto 10
export async function getAllTopScores(
  limit?: number,
): Promise<Record<string, ScoreRow[]>>; // usado por /salon para traer todo de una vez y evitar refetch al cambiar de tab
```

- `app/data.ts` conserva solo los tipos que ya no vienen de la DB pero siguen usándose en cliente (`GameColor`, `Category`); se eliminan `GAMES`, `PLAYERS`, `seededScores`, `ScoreRow` (ahora vive en `lib/supabase/games.ts`).
- `game-player.tsx`: `saveScore` pasa a insertar en `scores` vía `lib/supabase/client.ts` (cliente de navegador), y ya no toca `localStorage`/`av_scores`.
- `plays` se muestra formateado como número entero (`toLocaleString("es-ES")`), no como abreviatura "12.4K" — ahora es un conteo real, no una cifra ficticia grande.

## Plan de implementación

1. **Migración de esquema y seed.** Crear las tablas `games` y `scores` con sus `check`/RLS, y sembrar los 8 juegos actuales, vía `mcp__supabase__apply_migration`. Prueba: `mcp__supabase__list_tables` muestra ambas tablas; `select * from games` devuelve las 8 filas esperadas.
2. **Capa de acceso a datos.** Crear `lib/supabase/games.ts` con `getGames`, `getGame`, `getTopScores`, `getAllTopScores` (usan `lib/supabase/server.ts`). Prueba: `npm run build` pasa; el módulo aún no se usa en ninguna página.
3. **Biblioteca (`/games`).** Convertir `app/games/page.tsx` en Server Component que llama `getGames()` y pasa los juegos a un nuevo client component con el buscador/chips existentes. Prueba: `/games` carga los 8 juegos reales desde Supabase; buscar y filtrar sigue funcionando igual que antes.
4. **Detalle (`/games/[id]`).** Reemplazar `GAMES.find` + `seededScores` por `getGame(id)` + `getTopScores(id, 10)`; `notFound()` si no existe el juego; estado vacío si aún no hay partidas guardadas. Prueba: `/games/rocas` muestra datos reales y el leaderboard lateral refleja partidas guardadas (o el estado vacío si no hay ninguna).
5. **Reproductor: juego real desde la DB.** `app/games/[id]/jugar/page.tsx` usa `getGame(id)` en vez de `GAMES.find`. Prueba: `/games/rocas/jugar` sigue cargando el juego igual que antes.
6. **Guardado de puntuación real.** En `game-player.tsx`, `saveScore` inserta en `scores` vía `lib/supabase/client.ts`; se elimina toda lectura/escritura de `av_scores`; si el insert falla se muestra un mensaje de error en el modal en vez del toast de éxito. Prueba: jugar y pulsar "GUARDAR PUNTUACIÓN" crea una fila real en `scores` (verificable recargando el detalle o vía `execute_sql`).
7. **Salón de la fama real.** `app/salon/page.tsx` pasa a Server Component: llama `getGames()` + `getAllTopScores(12)` y entrega los datos a un client component con tabs/podio/tabla, más la fila "TU MEJOR MARCA" (match exacto por `av_user.name`). Prueba: cambiar de tab muestra el top real de cada juego sin refetch; guardar una puntuación con tu nombre de sesión y recargar `/salon` la muestra en "TU MEJOR MARCA".
8. **Cierre.** `npm run build` sin errores ni warnings; playtest manual completo de biblioteca, detalle, reproductor (rocas y un juego decorativo), y salón, confirmando que `best`/`plays` reflejan partidas reales guardadas durante la prueba.

Nota para `/spec-impl`: los pasos 1, 2, 5 y 6 son infraestructura/datos sin decisiones visuales nuevas. Los estados vacíos de los pasos 4 y 7 (juego sin partidas aún) son la única superficie que podría necesitar `/frontend-design` — un mensaje breve, no un rediseño.

## Criterios de aceptación

- [ ] `npm run build` termina sin errores ni warnings de TypeScript.
- [ ] Las tablas `games` y `scores` existen en Supabase con las columnas, `check` constraints y políticas RLS descritas en el modelo de datos.
- [ ] La tabla `games` contiene las 8 filas sembradas por la migración, con el mismo `id`/contenido que tenía `app/data.ts`.
- [ ] `app/data.ts` ya no exporta `GAMES`, `PLAYERS`, `seededScores` ni `ScoreRow`; solo conserva los tipos `GameColor`/`Category` que aún se usan en cliente.
- [ ] `/games` carga los 8 juegos reales desde Supabase; el buscador por nombre y los chips de categoría siguen filtrando correctamente.
- [ ] `/games/[id]` muestra el juego real (título, descripción, tags, `best`/`plays` calculados) y el leaderboard lateral con las puntuaciones reales de `scores` para ese juego (o el estado vacío si no hay ninguna).
- [ ] Un `id` de juego inexistente en `/games/[id]` sigue devolviendo 404.
- [ ] `/games/[id]/jugar` sigue cargando el juego correcto (incluyendo `rocas` con el juego real de Asteroids) buscándolo en Supabase en vez de en el array estático.
- [ ] "GUARDAR PUNTUACIÓN" en el modal de fin de partida inserta una fila real en `scores` (game_id, player_name, score) en Supabase, en cualquier juego (rocas o los 7 decorativos).
- [ ] Si el insert a `scores` falla, el modal muestra un mensaje de error en vez del toast "▸ PUNTUACIÓN GUARDADA_".
- [ ] `av_scores` ya no se lee ni se escribe en ningún lugar del código.
- [ ] `/salon` muestra, por cada juego (tabs), el podio (top 3) y la tabla (top 12) con puntuaciones reales de `scores`; cambiar de tab no dispara una nueva petición de red (los datos ya vienen cargados).
- [ ] Guardar una puntuación con el nombre de la sesión activa (`av_user.name`) y recargar `/salon` en ese juego muestra la fila "TU MEJOR MARCA" con esa puntuación; si no hay coincidencia de nombre, la fila no aparece.
- [ ] `best` (mejor puntuación) y `plays` (partidas) mostrados en biblioteca/detalle reflejan `MAX(score)`/`COUNT(*)` reales de `scores`, no números fijos.
- [ ] Toda la navegación existente (`/`, `/games`, `/games/[id]`, `/games/[id]/jugar`, `/salon`, `/about`, `/auth`) sigue funcionando sin errores en consola.

## Decisiones

- **Sí:** un solo spec combinado para tabla de juegos + leaderboard, en vez de separarlos en dos. Decisión explícita del usuario pese a que toca varias áreas del sistema.
- **Sí:** sin auth real — las puntuaciones se identifican solo por un nombre de texto (`player_name`), igual que hoy con `av_user`. No se bloquea este spec esperando un spec futuro de auth real.
- **Sí:** la tabla `games` en Supabase reemplaza totalmente a `app/data.ts` como fuente de verdad (título, descripciones, categoría, portada, color). `app/data.ts` queda solo con los tipos de UI que no vienen de la DB.
- **Sí:** `best` y `plays` se calculan dinámicamente desde `scores` (`MAX`/`COUNT`) en vez de quedar como columnas fijas ficticias. Elimina datos duplicados y desincronizados.
- **Sí:** el leaderboard lateral del detalle (`/games/[id]`) usa datos reales de `scores` en vez de `seededScores`, con estado vacío si aún no hay partidas.
- **Sí:** "TU MEJOR MARCA" en `/salon` se resuelve por match exacto de nombre (`av_user.name` contra `player_name`); si no hay coincidencia, se omite la fila en vez de inventar un número.
- **Sí:** RLS pública simple (`INSERT` público en `scores`, `SELECT` público en ambas tablas) en vez de una Server Action intermediaria. Mismo nivel de confianza que tenía `localStorage`; riesgo documentado hasta que exista auth real y/o validación server-side.
- **Sí:** nombres de tabla `games`/`scores` sin prefijo `av_`. El prefijo en `localStorage` evitaba colisiones en el navegador compartido; en el proyecto Supabase (dedicado a Arcade Vault) no hace falta.
- **Sí:** se elimina `av_scores` de `localStorage` por completo; Supabase pasa a ser la única fuente de verdad para puntuaciones. Si el insert falla, se muestra un error simple en vez de guardar localmente — evita duplicación/desincronización sin resolver en este spec.
- **Sí:** los 7 juegos decorativos siguen permitiendo guardar su score simulado (ahora en Supabase), igual que hoy. No se restringe el guardado solo a "rocas" — evita tocar comportamiento fuera del alcance de este spec.
- **No:** migrar las puntuaciones que ya existieran en `av_scores` del navegador de cada usuario — la tabla `scores` arranca vacía; el dato viejo en `localStorage` se pierde.
- **No:** rate limiting o anti-spam real en el `INSERT` público — solo hay `check` constraints básicos (longitud de nombre, rango de score) como barrera mínima.
- **No:** Realtime, paginación más allá del top N, CRUD de administración de juegos, ni borrado/moderación de puntuaciones — quedan para specs futuros si llegan a necesitarse.

## Riesgos

| Riesgo                                                                                                                                                                                                 | Mitigación                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El `INSERT` público en `scores` permite que cualquiera con la publishable key escriba puntuaciones arbitrarias o en volumen (spam) directamente desde el navegador, sin pasar por ninguna partida real | Aceptado como riesgo documentado: mismo nivel de confianza que tenía `localStorage` (que ya era manipulable por el propio usuario). Los `check` de rango de score y longitud de nombre son una barrera mínima, no una solución real. Rate limiting/validación server-side queda para un spec futuro si el abuso se vuelve un problema. |
| Dos jugadores distintos usando el mismo alias (`player_name`) pueden pisarse el "TU MEJOR MARCA" en `/salon`, ya que el match es por nombre exacto sin identidad real                                  | Aceptado por decisión explícita (ver Decisiones) — es el mismo nivel de identidad que ya existía con `av_user` simulado; se resuelve cuando exista auth real.                                                                                                                                                                          |
| Al eliminar `av_scores`, cualquier puntuación que un usuario tuviera guardada localmente antes de este spec deja de ser visible en ningún lugar de la app                                              | Aceptado como decisión explícita; es dato de demo/ficticio de specs anteriores, no hay usuarios reales en producción todavía.                                                                                                                                                                                                          |
| Calcular `best`/`plays` con agregados sobre `scores` en cada carga de biblioteca/detalle/salón añade cómputo en cada request (sin caché)                                                               | Aceptado: el volumen de datos es bajo (8 juegos, pocas partidas por ahora); si se vuelve un problema de rendimiento, cachear o desnormalizar es una optimización de un spec futuro.                                                                                                                                                    |
| Si la migración de RLS queda mal configurada (p. ej. `SELECT` bloqueado por error), las páginas fallarían en mostrar datos sin aviso claro para el usuario final                                       | El paso de cierre del plan incluye playtest manual de las 4 páginas afectadas; los estados de error del guardado de puntuación (paso 6) dan una señal visible si algo falla.                                                                                                                                                           |
