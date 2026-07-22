# Contrato del componente de juego + checklist de integración

Esto es la referencia que usa `/add-game` en su Fase 4. Documenta, en un solo lugar, el patrón que ya se probó al portar Asteroids (SPEC 05) y al migrar juegos/leaderboard a Supabase (SPEC 06), para no tener que re-derivarlo cada vez que se agrega un juego nuevo.

## 1. Los tipos compartidos (fuente de verdad: `app/components/games/registry.ts`)

```ts
export interface GameComponentProps {
  paused: boolean; // el padre (GamePlayer) controla la pausa vía prop
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number) => void;
  onExtraStatChange: (value: number) => void; // stat extra opcional en el HUD; 0 = inactivo
}

export interface GameComponentHandle {
  reset: () => void; // reinicia el juego real (usado por "JUGAR DE NUEVO")
  forceGameOver: () => void; // usado por el botón FIN ("abandonar partida")
}

export interface GameRegistryEntry {
  Component: React.ForwardRefExoticComponent<
    GameComponentProps & React.RefAttributes<GameComponentHandle>
  >;
  extraStatLabel?: string; // etiqueta del stat extra en el HUD, solo si el juego lo usa
}
```

Todo componente de juego nuevo debe implementar exactamente `GameComponentProps` (vía `forwardRef`) y exponer `GameComponentHandle` (vía `useImperativeHandle`). `GamePlayer` no sabe nada de la lógica interna de cada juego — solo llama estas props/métodos genéricos.

**Un solo slot de stat extra.** Hoy solo hay lugar para un stat adicional en el HUD (`onExtraStatChange`/`extraStatLabel`), usado por Asteroids para el contador del triple disparo. Si un juego futuro necesita más de un stat adicional, no lo hardcodees en `game-player.tsx` — es una decisión a marcar con el usuario (extender el contrato compartido).

## 2. Convenciones de implementación (ver `app/components/games/asteroids-game.tsx` como referencia viva)

- **Canvas de resolución fija** (p. ej. 800×600), escalado por CSS al 100%/100% dentro de `.crt-screen` (que ya tiene `aspect-ratio: 4/3`).
- **Estado mutable en un `useRef`**, nunca en variables globales de módulo ni en estado de React. Los juegos de referencia en `references/started-games/` (Tetris, Arkanoid) usan variables `let` sueltas a nivel de módulo — **hay que consolidarlas primero en un único objeto de estado dentro de un ref** (igual que `dataRef`/`GameData` en Asteroids) antes de portar la lógica. Un `ref` de módulo real rompería con `React.StrictMode` (doble montaje) y con HMR.
- **Loop `requestAnimationFrame` con `dt` capado** (~50ms máximo) para evitar el "spiral of death" cuando la pestaña pierde foco. Es la convención de la casa — estandarizá a esto aunque el original no lo capee (Tetris/Arkanoid no lo hacen).
- **Teclado vía `e.code`** + un `Set` de "control codes" (`CONTROL_CODES`) con `preventDefault()` en keydown/keyup, para evitar que las flechas/espacio scrolleen la página. Arkanoid usa `e.key` en el original — normalizá a `e.code` al portar.
- **Mouse/puntero (si aplica):** si el juego original usa mouse (p. ej. Arkanoid: arrastre de paleta, botones clicables dentro del canvas), escalá las coordenadas vía `canvas.getBoundingClientRect()`, igual que ya hace `references/started-games/04-arkanoid/game.js`.
- **Assets externos (si aplica):** si el juego depende de una spritesheet, audio, o un archivo tipo `levels.js` (como Arkanoid), los assets estáticos van a `public/`, y el loop debe esperar su carga async (gate) antes de arrancar — no empezar a dibujar/actualizar con una imagen todavía sin cargar.
- **Sin HUD/pausa/game-over interno.** El juego original puede dibujar su propio HUD en canvas (Asteroids, Arkanoid) o en el DOM (Tetris) — se elimina siempre. El HUD/modal de `GamePlayer` es la única fuente visual de score/vidas/nivel/stat-extra; el componente portado solo dibuja el campo de juego.
- **Callbacks solo al cambiar**, nunca en cada frame — usá un patrón de diffing tipo `reportedRef` (comparar el valor actual contra el último reportado, y solo entonces llamar al callback). Esto evita re-renders de React a 60fps.
- **`forwardRef` + `useImperativeHandle`** exponiendo exactamente `{ reset(), forceGameOver() }`. `reset()` reconstruye el estado inicial y reporta los valores iniciales a los callbacks; `forceGameOver()` fuerza la transición a estado game-over (la detección de esa transición, y el disparo de `onGameOver`, vive en el loop — no en `forceGameOver` directamente).
- **Cleanup del `useEffect`** que arranca el loop: cancelar el `requestAnimationFrame` y remover todos los listeners al desmontar.

## 3. Registro

Agregar (o crear si es el primer juego portado después de Asteroids) una entrada en `app/components/games/registry.ts`:

```ts
export const GAME_REGISTRY: Partial<Record<string, GameRegistryEntry>> = {
  rocas: { Component: AsteroidsGame, extraStatLabel: "Triple disparo" },
  "<id-del-juego-nuevo>": {
    Component: <Nombre>Game /*, extraStatLabel: "..." si aplica */,
  },
};
```

No hay que tocar `game-player.tsx` para esto — ya resuelve el componente a mostrar (o el `.game-arena` decorativo, si `game.id` no está en el registro) buscando en `GAME_REGISTRY`.

## 4. Alta en Supabase (tabla `games`)

Esquema (definido en SPEC 06, ya aplicado en el proyecto remoto):

```sql
create table public.games (
  id text primary key,              -- mismo slug usado en la URL: /games/[id]
  title text not null,
  short text not null,
  long text not null,
  cat text not null check (cat in ('ARCADE','PUZZLE','SHOOTER','VERSUS')),
  cover text not null,              -- clase CSS de portada, p. ej. "cover-bricks"
  color text not null check (color in ('cyan','magenta','yellow','green')),
  created_at timestamptz not null default now()
);
```

`scores.game_id` tiene una FK a `games.id` — **el juego tiene que existir en `games` antes de poder guardar cualquier puntuación**. El `insert` propuesto se muestra al usuario, se pide confirmación explícita, y recién entonces se ejecuta vía `mcp__supabase__execute_sql`. Ejemplo:

```sql
insert into public.games (id, title, short, long, cat, cover, color)
values ('tetris', 'Tetris', '...', '...', 'PUZZLE', 'cover-tetro', 'cyan');
```

Para `cover`, revisá `app/globals.css` (clases `cover-*`, p. ej. `.cover-bricks`, `.cover-tetro`, `.cover-snake`, `.cover-rocas`) — reusá una existente si el juego decorativo ya tenía una portada apropiada, o creá una nueva siguiendo el mismo patrón visual (gradiente + pseudo-elementos `::before`/`::after`) si ninguna encaja.

## 5. Checklist final

- [ ] `npm run build` sin errores ni warnings de TypeScript.
- [ ] `/games/<id>/jugar` carga el juego real en canvas, sin HUD duplicado.
- [ ] El HUD exterior refleja en vivo puntuación/vidas/nivel (y el stat extra, si el juego lo usa).
- [ ] PAUSA congela el loop por completo; REANUDAR continúa donde quedó.
- [ ] FIN cierra la partida de inmediato con el score acumulado.
- [ ] GUARDAR PUNTUACIÓN inserta una fila real en `scores` (verificable con `execute_sql` o recargando `/games/<id>`).
- [ ] JUGAR DE NUEVO reinicia el juego real desde cero sin recargar la página.
- [ ] Los demás juegos (decorativos y cualquier otro ya registrado en `GAME_REGISTRY`) siguen sin cambios.
