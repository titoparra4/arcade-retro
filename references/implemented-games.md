# Juegos implementados — Arcade Retro

> Datos consultados desde la base de datos de Supabase (tabla `games`, con `best`/`plays` derivados de `scores`) el **2026-07-23**.
>
> "Implementado" = tiene componente canvas registrado en `GAME_REGISTRY` (`app/components/games/registry.ts`) y es jugable. Los demás juegos existen como fila en la BD pero renderizan el placeholder decorativo del player.

## ✅ Jugables (4)

| ID              | Título        | Categoría | Referencia clásica | Cover          | Color   | Mejor score | Partidas |
| --------------- | ------------- | --------- | ------------------ | -------------- | ------- | ----------- | -------- |
| `rocas`         | ROCAS         | SHOOTER   | Asteroids          | `cover-rocas`  | yellow  | 2140        | 4        |
| `caida`         | CAÍDA         | PUZZLE    | Tetris             | `cover-tetro`  | magenta | 6231        | 4        |
| `bloque-buster` | BLOQUE BUSTER | ARCADE    | Arkanoid           | `cover-bricks` | cyan    | 550         | 2        |
| `serpentina`    | SERPENTINA    | ARCADE    | Snake              | `cover-snake`  | green   | 30          | 1        |

### Detalle

- **ROCAS** (`rocas`) — Pulveriza asteroides en gravedad cero.
  Tu nave triangular flota en vacío absoluto. Dispara y rota para dividir rocas en fragmentos cada vez más pequeños. Cuidado con los OVNIs en el horizonte.
  Componente: `AsteroidsGame` · Stat extra HUD: "Triple disparo".

- **CAÍDA** (`caida`) — Encaja las piezas antes de que el techo te aplaste.
  Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.
  Componente: `CaidaGame`.

- **BLOQUE BUSTER** (`bloque-buster`) — Rebota la pelota y destruye muros de neón.
  Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?
  Componente: `BloqueBusterGame`.

- **SERPENTINA** (`serpentina`) — Crece sin morder tu propia cola.
  Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.
  Componente: `SerpentinaGame`.

## ⏳ En la BD pero aún no portados (placeholder) (4)

Estos juegos tienen fila en la tabla `games` pero **no** están en `GAME_REGISTRY`, así que el player muestra el placeholder animado con score simulado.

| ID            | Título      | Categoría | Referencia clásica | Cover            | Color  |
| ------------- | ----------- | --------- | ------------------ | ---------------- | ------ |
| `duelo-pixel` | DUELO PIXEL | VERSUS    | Pong               | `cover-duelo`    | cyan   |
| `gloton`      | GLOTÓN      | ARCADE    | Pac-Man            | `cover-glot`     | yellow |
| `invasores`   | INVASORES   | SHOOTER   | Space Invaders     | `cover-invaders` | green  |
| `ranaria`     | RANARIA     | ARCADE    | Frogger            | `cover-rana`     | green  |
