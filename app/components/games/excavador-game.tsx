"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GameComponentHandle, GameComponentProps } from "./registry";
import {
  CELL,
  COLS,
  LEVELS,
  ROWS,
  SKY_ROWS,
  type GridPos,
  type LevelLayout,
} from "./excavador-levels";

const W = COLS * CELL; // 800
const H = ROWS * CELL; // 600

// ── Constantes de juego (SPEC excavador-01-clasico) ─────────────────────────
const LIVES_START = 3;
const ENEMY_STEP_MS = 340; // paso inicial de los Pooka; se acelera al hacer loop de LEVELS
const TUNNEL_STEP_MS = 220; // recorrer una celda ya cavada
const DIG_STEP_MS = 480; // abrir una celda de tierra: la tensión central del juego
const RESPAWN_INVULN_MS = 1200; // gracia tras perder una vida
const PUMP_EXTEND_MS = 90; // por celda de manguera
const PUMP_MAX_RANGE = 5; // alcance máximo en celdas
const INFLATE_STAGE_MS = 550; // por etapa de inflado (y el tic que revienta)
const POP_SCORE = 250; // Pooka reventado con la bomba

const CONTROL_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

// ── Modelo de datos ─────────────────────────────────────────────────────────

type Direction = "up" | "down" | "left" | "right";
type CellKind = "sky" | "dirt" | "empty";

interface Rock extends GridPos {
  falling: boolean;
  fallAccum: number; // ms acumulados desde el último paso de caída
}

interface Enemy extends GridPos {
  alive: boolean;
  stepAccum: number; // ms acumulados desde el último paso de grilla
  pumpStage: 0 | 1 | 2 | 3; // 0 = normal, 3 = a punto de reventar
  // `dir` no está en el bloque de tipos del spec, pero la conducta que sí exige
  // ("sin invertir de golpe salvo que sea la única opción") necesita recordar
  // por dónde vino. null = todavía no se ha movido.
  dir: Direction | null;
}

interface Pump {
  active: boolean;
  dir: Direction;
  cells: number; // celdas actuales de extensión, 0..PUMP_MAX_RANGE
  extendAccum: number;
  targetEnemyIndex: number | null; // índice en enemies[] si conectó con uno
  inflateAccum: number;
}

interface GameData {
  grid: CellKind[][]; // ROWS × COLS
  player: GridPos & { dir: Direction; moveAccum: number };
  pendingDir: Direction | null; // último input de teclado pendiente de aplicar
  enemies: Enemy[];
  rocks: Rock[];
  pump: Pump;
  score: number;
  lives: number;
  level: number; // acumulado, no reinicia al hacer loop de LEVELS
  enemyStepMs: number; // recalculado en cada loop de LEVELS
  invulnMs: number; // ms restantes de invulnerabilidad tras respawn
  state: "playing" | "gameover";
}

// ── Construcción del estado ─────────────────────────────────────────────────

/** Tierra sólida en las filas >= SKY_ROWS, cielo arriba, y los túneles del layout. */
function buildGrid(layout: LevelLayout): CellKind[][] {
  const grid: CellKind[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const line: CellKind[] = [];
    for (let col = 0; col < COLS; col++) {
      line.push(row < SKY_ROWS ? "sky" : "dirt");
    }
    grid.push(line);
  }
  for (const cell of layout.preCarved) {
    if (grid[cell.row][cell.col] === "dirt") grid[cell.row][cell.col] = "empty";
  }
  return grid;
}

function createInitialGameData(): GameData {
  const layout = LEVELS[0];
  return {
    grid: buildGrid(layout),
    player: {
      col: layout.startCell.col,
      row: layout.startCell.row,
      dir: "down",
      moveAccum: 0,
    },
    pendingDir: null,
    enemies: layout.enemies.map((cell) => ({
      col: cell.col,
      row: cell.row,
      alive: true,
      stepAccum: 0,
      pumpStage: 0 as const,
      dir: null,
    })),
    rocks: layout.rocks.map((cell) => ({
      col: cell.col,
      row: cell.row,
      falling: false,
      fallAccum: 0,
    })),
    pump: {
      active: false,
      dir: "down",
      cells: 0,
      extendAccum: 0,
      targetEnemyIndex: null,
      inflateAccum: 0,
    },
    score: 0,
    lives: LIVES_START,
    level: 1,
    enemyStepMs: ENEMY_STEP_MS,
    invulnMs: 0,
    state: "playing",
  };
}

// ── Simulación ──────────────────────────────────────────────────────────────

const DIRECTION_DELTAS: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

const DIR_BY_CODE: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const ALL_DIRS: Direction[] = ["up", "down", "left", "right"];

/** El layout activo: `level` es acumulado, así que se cicla sobre LEVELS. */
function currentLayout(data: GameData): LevelLayout {
  return LEVELS[(data.level - 1) % LEVELS.length];
}

function inGrid(pos: GridPos) {
  return pos.col >= 0 && pos.col < COLS && pos.row >= 0 && pos.row < ROWS;
}

function rockAt(data: GameData, pos: GridPos) {
  return data.rocks.some((r) => r.col === pos.col && r.row === pos.row);
}

/**
 * El excavador puede entrar en cualquier celda de la grilla —la tierra la cava—
 * salvo que haya una roca o se salga del tablero.
 */
function canPlayerEnter(data: GameData, pos: GridPos) {
  return inGrid(pos) && !rockAt(data, pos);
}

/**
 * Avanza el paso de grilla del excavador. `carve` repinta la celda en el canvas
 * de terreno, para no tener que repintarlo entero cada vez que se abre un túnel.
 */
function stepPlayer(
  data: GameData,
  dt: number,
  carve: (col: number, row: number) => void,
) {
  const player = data.player;
  const want = data.pendingDir;

  if (!want) {
    player.moveAccum = 0;
    return;
  }

  const delta = DIRECTION_DELTAS[want];
  const target: GridPos = {
    col: player.col + delta.dc,
    row: player.row + delta.dr,
  };

  // Roca o borde: el movimiento no ocurre y `dir` no cambia — el spec define
  // `dir` como la última dirección de movimiento *válida*.
  if (!canPlayerEnter(data, target)) {
    player.moveAccum = 0;
    return;
  }

  // Cambiar de intención reinicia el acumulador: no se arrastra el progreso de
  // un paso hacia otra celda (que además puede costar el doble).
  if (want !== player.dir) {
    player.dir = want;
    player.moveAccum = 0;
  }

  const digging = data.grid[target.row][target.col] === "dirt";
  const cost = digging ? DIG_STEP_MS : TUNNEL_STEP_MS;

  player.moveAccum += dt;
  if (player.moveAccum < cost) return;

  player.moveAccum = 0;
  if (digging) {
    data.grid[target.row][target.col] = "empty";
    carve(target.col, target.row);
  }
  player.col = target.col;
  player.row = target.row;
}

/**
 * Los Pooka nunca cavan: solo circulan por celdas ya abiertas (`empty`/`sky`) y
 * las rocas les bloquean el paso igual que al excavador.
 */
function canEnemyEnter(data: GameData, pos: GridPos) {
  if (!inGrid(pos)) return false;
  if (data.grid[pos.row][pos.col] === "dirt") return false;
  return !rockAt(data, pos);
}

function manhattan(a: GridPos, b: GridPos) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** ¿Hay otro Pooka vivo en esa celda? (`self` se excluye del test). */
function enemyAt(data: GameData, pos: GridPos, self: Enemy) {
  return data.enemies.some(
    (e) => e !== self && e.alive && e.col === pos.col && e.row === pos.row,
  );
}

/**
 * Un paso de un Pooka: entre los vecinos transitables elige el que más reduce
 * la distancia Manhattan al excavador. No se da la vuelta de golpe salvo que
 * retroceder sea la única salida (callejón sin salida).
 *
 * Dos Pooka no pueden compartir celda: si el mejor movimiento está ocupado, coge
 * el siguiente vecino libre, y si no queda ninguno se planta este turno. Sin
 * esta regla todos convergen a la misma celda y los 4/5/6 monstruos de cada
 * nivel se juegan —y se ven— como uno solo.
 */
function moveEnemy(data: GameData, enemy: Enemy) {
  const options = ALL_DIRS.map((dir) => {
    const delta = DIRECTION_DELTAS[dir];
    return {
      dir,
      pos: { col: enemy.col + delta.dc, row: enemy.row + delta.dr },
    };
  }).filter((o) => canEnemyEnter(data, o.pos) && !enemyAt(data, o.pos, enemy));

  if (options.length === 0) return;

  const back = enemy.dir ? OPPOSITE[enemy.dir] : null;
  const forward = options.filter((o) => o.dir !== back);
  const candidates = forward.length > 0 ? forward : options;

  let best = candidates[0];
  let bestDist = manhattan(best.pos, data.player);
  for (const option of candidates.slice(1)) {
    const dist = manhattan(option.pos, data.player);
    // Empate: se mantiene el rumbo actual, para que no tiemblen en los cruces.
    if (dist < bestDist || (dist === bestDist && option.dir === enemy.dir)) {
      best = option;
      bestDist = dist;
    }
  }

  enemy.col = best.pos.col;
  enemy.row = best.pos.row;
  enemy.dir = best.dir;
}

function stepEnemies(data: GameData, dt: number) {
  for (const [index, enemy] of data.enemies.entries()) {
    if (!enemy.alive) continue;
    // Un Pooka enganchado a la manguera queda sujeto: no se mueve mientras la
    // bomba lo tenga cogido. Sin esto no habría forma de reventarlo —los 2200 ms
    // de inflado son 6 pasos suyos— y el criterio de aceptación del spec
    // ("lo infla en 3 etapas y lo revienta en la cuarta") sería inalcanzable.
    if (data.pump.targetEnemyIndex === index) continue;
    enemy.stepAccum += dt;
    if (enemy.stepAccum < data.enemyStepMs) continue;
    enemy.stepAccum -= data.enemyStepMs;
    moveEnemy(data, enemy);
  }
}

// ── Bomba de aire ───────────────────────────────────────────────────────────

/**
 * Celdas que ocupa la manguera ahora mismo, desde el excavador hacia `pump.dir`.
 * Se recalcula cada frame porque el excavador puede moverse mientras bombea: la
 * manguera solo pasa por celdas ya cavadas, así que se corta sola al primer
 * obstáculo.
 */
function hoseCells(data: GameData): GridPos[] {
  const pump = data.pump;
  const delta = DIRECTION_DELTAS[pump.dir];
  const cells: GridPos[] = [];
  for (let n = 1; n <= pump.cells; n++) {
    const cell: GridPos = {
      col: data.player.col + delta.dc * n,
      row: data.player.row + delta.dr * n,
    };
    if (!inGrid(cell)) break;
    if (data.grid[cell.row][cell.col] === "dirt") break;
    if (rockAt(data, cell)) break;
    cells.push(cell);
  }
  return cells;
}

/** Suelta el Pooka enganchado (si lo hay) y recoge la manguera. */
function detachPump(data: GameData) {
  const pump = data.pump;
  if (pump.targetEnemyIndex !== null) {
    const target = data.enemies[pump.targetEnemyIndex];
    if (target) target.pumpStage = 0; // vuelve a la etapa 0, sin daño
  }
  pump.targetEnemyIndex = null;
  pump.cells = 0;
  pump.extendAccum = 0;
  pump.inflateAccum = 0;
}

function stepPump(data: GameData, dt: number) {
  const pump = data.pump;
  if (!pump.active) return;

  // El excavador se movió y la manguera ya no cabe: se recoge hasta donde llega.
  const reach = hoseCells(data);
  if (reach.length < pump.cells) pump.cells = reach.length;

  // ── Enganchado: inflar ────────────────────────────────────────────────────
  if (pump.targetEnemyIndex !== null) {
    const target = data.enemies[pump.targetEnemyIndex];
    const stillOnLine =
      target &&
      target.alive &&
      reach.some((c) => c.col === target.col && c.row === target.row);

    // Se salió de la línea (o murió aplastado): se corta la conexión.
    if (!stillOnLine) {
      detachPump(data);
      return;
    }

    pump.inflateAccum += dt;
    while (pump.inflateAccum >= INFLATE_STAGE_MS) {
      pump.inflateAccum -= INFLATE_STAGE_MS;
      if (target.pumpStage < 3) {
        target.pumpStage = (target.pumpStage + 1) as 1 | 2 | 3;
      } else {
        // Un tic más tras la etapa 3: revienta.
        target.alive = false;
        target.pumpStage = 0;
        data.score += POP_SCORE;
        detachPump(data);
        return;
      }
    }
    return;
  }

  // ── Libre: extender la manguera celda a celda ─────────────────────────────
  pump.extendAccum += dt;
  while (pump.extendAccum >= PUMP_EXTEND_MS && pump.cells < PUMP_MAX_RANGE) {
    pump.extendAccum -= PUMP_EXTEND_MS;
    const delta = DIRECTION_DELTAS[pump.dir];
    const next: GridPos = {
      col: data.player.col + delta.dc * (pump.cells + 1),
      row: data.player.row + delta.dr * (pump.cells + 1),
    };
    if (
      !inGrid(next) ||
      data.grid[next.row][next.col] === "dirt" ||
      rockAt(data, next)
    ) {
      break; // topa con tierra sin cavar, una roca o el borde
    }
    pump.cells += 1;
  }

  // Engancha con el Pooka vivo más cercano que esté sobre la manguera. Se
  // comprueba cada frame, no solo al extender: un Pooka puede meterse en la
  // línea con la manguera ya desplegada del todo.
  for (const cell of hoseCells(data)) {
    const index = data.enemies.findIndex(
      (e) => e.alive && e.col === cell.col && e.row === cell.row,
    );
    if (index >= 0) {
      pump.targetEnemyIndex = index;
      pump.inflateAccum = 0;
      break;
    }
  }
}

/**
 * Resta una vida y respawnea al excavador en la celda de inicio del nivel. Los
 * túneles ya cavados y las rocas se quedan como estaban.
 */
function loseLife(data: GameData) {
  if (data.invulnMs > 0 || data.state !== "playing") return;

  data.lives -= 1;
  if (data.lives <= 0) {
    data.lives = 0;
    data.state = "gameover";
    return;
  }

  const start = currentLayout(data).startCell;
  data.player.col = start.col;
  data.player.row = start.row;
  data.player.dir = "down";
  data.player.moveAccum = 0;
  data.pendingDir = null;
  data.invulnMs = RESPAWN_INVULN_MS;
  detachPump(data); // el excavador reaparece lejos: la manguera se recoge
}

/** Contacto con un Pooka vivo: cuesta una vida (salvo en la gracia del respawn). */
function checkEnemyContact(data: GameData) {
  if (data.invulnMs > 0) return;
  const hit = data.enemies.some(
    (e) => e.alive && e.col === data.player.col && e.row === data.player.row,
  );
  if (hit) loseLife(data);
}

// ── Paleta ──────────────────────────────────────────────────────────────────
// Este juego no adopta el sistema de skins compartido (el spec no lo pide), así
// que la paleta es única. Todos los tonos se eligen contra el fondo oscuro de la
// app (--bg #0a0a0f): la tierra tiene que leerse como tierra, y el túnel cavado
// tiene que distinguirse del negro del marco sin brillar.

const SKY_TOP = "#0b1024";
const SKY_BOTTOM = "#16233d";
const HORIZON = "#2c4a70";
const TUNNEL = "#08080e";
const TUNNEL_EDGE = "rgba(0,0,0,0.55)";

// Estratos de tierra por profundidad, al estilo del arcade original: cada par de
// filas cambia de color y va oscureciendo a medida que se baja.
const STRATA: { base: string; speck: string }[] = [
  { base: "#8a4a1c", speck: "#a86230" }, // filas 2–3, tierra ocre
  { base: "#1d5c74", speck: "#2c7b96" }, // filas 4–5, arcilla azul
  { base: "#6b2a5e", speck: "#8c3c7b" }, // filas 6–7, veta magenta
  { base: "#2a5c30", speck: "#3b7c43" }, // filas 8–9, estrato verde
  { base: "#4a3372", speck: "#65479a" }, // filas 10–11, roca violeta
];

function strata(row: number) {
  const band = Math.floor((row - SKY_ROWS) / 2);
  return STRATA[Math.min(Math.max(band, 0), STRATA.length - 1)];
}

/** Ruido determinista por celda: la textura no puede bailar entre frames. */
function cellNoise(col: number, row: number, salt: number) {
  const n = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

// ── Pintado del terreno (canvas offscreen) ──────────────────────────────────
// El terreno es casi estático: solo cambia cuando el excavador cava una celda.
// Se pinta una vez en un canvas aparte y cada frame se vuelca con un solo
// drawImage, en vez de repintar 192 celdas con textura 60 veces por segundo.

function paintDirtCell(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
) {
  const x = col * CELL;
  const y = row * CELL;
  const pal = strata(row);
  ctx.fillStyle = pal.base;
  ctx.fillRect(x, y, CELL, CELL);

  // Granulado: motas fijas por celda para que la tierra no sea un plano liso.
  ctx.fillStyle = pal.speck;
  for (let i = 0; i < 5; i++) {
    const sx = x + cellNoise(col, row, i) * (CELL - 6) + 3;
    const sy = y + cellNoise(col, row, i + 10) * (CELL - 6) + 3;
    const size = 2 + cellNoise(col, row, i + 20) * 3;
    ctx.fillRect(sx, sy, size, size);
  }

  // Sombra interior en el borde inferior: da volumen a los estratos.
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x, y + CELL - 4, CELL, 4);
}

function paintTunnelCell(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
) {
  const x = col * CELL;
  const y = row * CELL;
  ctx.fillStyle = TUNNEL;
  ctx.fillRect(x, y, CELL, CELL);
  // Viñeta suave en el borde: el túnel parece excavado, no un agujero recortado.
  ctx.strokeStyle = TUNNEL_EDGE;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
}

function paintSky(ctx: CanvasRenderingContext2D) {
  const skyH = SKY_ROWS * CELL;
  const grad = ctx.createLinearGradient(0, 0, 0, skyH);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(1, SKY_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, skyH);

  // Estrellas fijas, para que el cielo no sea una banda plana.
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 40; i++) {
    const sx = cellNoise(i, 3, 1) * W;
    const sy = cellNoise(i, 7, 2) * (skyH - 10);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Línea de horizonte: separa el cielo de la primera capa de tierra.
  ctx.fillStyle = HORIZON;
  ctx.fillRect(0, skyH - 3, W, 3);
}

/** Repinta el terreno completo. Se llama al construir o reconstruir un nivel. */
function paintTerrain(ctx: CanvasRenderingContext2D, grid: CellKind[][]) {
  ctx.clearRect(0, 0, W, H);
  paintSky(ctx);
  for (let row = SKY_ROWS; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === "dirt") paintDirtCell(ctx, col, row);
      else paintTunnelCell(ctx, col, row);
    }
  }
}

// ── Dibujo de entidades ─────────────────────────────────────────────────────

function drawRock(ctx: CanvasRenderingContext2D, rock: Rock) {
  const x = rock.col * CELL;
  const y = rock.row * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const r = CELL * 0.42;

  // Contorno irregular determinista: cada roca tiene su propia silueta.
  ctx.beginPath();
  const points = 8;
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const wobble = 0.78 + cellNoise(rock.col, rock.row, i) * 0.34;
    const px = cx + Math.cos(ang) * r * wobble;
    const py = cy + Math.sin(ang) * r * wobble;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#8e8e9c";
  ctx.fill();
  ctx.strokeStyle = "#3d3d4a";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Brillo superior izquierdo: le da peso y volumen.
  ctx.beginPath();
  ctx.ellipse(
    cx - r * 0.28,
    cy - r * 0.3,
    r * 0.3,
    r * 0.2,
    -0.5,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();
}

function drawDigger(ctx: CanvasRenderingContext2D, player: GameData["player"]) {
  const x = player.col * CELL;
  const y = player.row * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const body = CELL * 0.34;

  // Cuerpo: traje blanco del original.
  ctx.fillStyle = "#eaf2ff";
  ctx.beginPath();
  ctx.roundRect(cx - body, cy - body * 0.5, body * 2, body * 1.55, 6);
  ctx.fill();

  // Franja azul del traje.
  ctx.fillStyle = "#2f6fd0";
  ctx.fillRect(cx - body, cy + body * 0.45, body * 2, body * 0.6);

  // Casco/cabeza.
  ctx.beginPath();
  ctx.arc(cx, cy - body * 0.62, body * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = "#f5faff";
  ctx.fill();
  ctx.strokeStyle = "#2f6fd0";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor, orientado según la última dirección válida.
  const look: Record<Direction, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };
  const l = look[player.dir];
  ctx.beginPath();
  ctx.arc(
    cx + l.dx * body * 0.3,
    cy - body * 0.62 + l.dy * body * 0.26,
    body * 0.3,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "#0fd6f5";
  ctx.fill();
}

/** Pooka: bola roja con gafas amarillas. Se hincha con `pumpStage` (paso 6). */
function drawPooka(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const cx = enemy.col * CELL + CELL / 2;
  const cy = enemy.row * CELL + CELL / 2;
  const r = CELL * 0.34 * (1 + enemy.pumpStage * 0.22);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#e23b3b";
  ctx.fill();
  ctx.strokeStyle = "#7d1414";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gafas: dos lentes amarillas unidas, la firma visual del Pooka.
  const eyeR = r * 0.34;
  const eyeY = cy - r * 0.12;
  for (const sign of [-1, 1]) {
    const ex = cx + sign * r * 0.36;
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a22";
    ctx.fill();
  }
}

/** Manguera de la bomba: tubo desde el excavador hasta la punta, con arpón. */
function drawHose(ctx: CanvasRenderingContext2D, data: GameData) {
  const cells = hoseCells(data);
  if (cells.length === 0) return;

  const fromX = data.player.col * CELL + CELL / 2;
  const fromY = data.player.row * CELL + CELL / 2;
  const tip = cells[cells.length - 1];
  const toX = tip.col * CELL + CELL / 2;
  const toY = tip.row * CELL + CELL / 2;

  ctx.strokeStyle = "#d8dee9";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.strokeStyle = "#7c8798";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Punta del arpón.
  ctx.beginPath();
  ctx.arc(toX, toY, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd23f";
  ctx.fill();
}

function draw(
  ctx: CanvasRenderingContext2D,
  terrain: HTMLCanvasElement,
  data: GameData,
) {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(terrain, 0, 0);
  for (const rock of data.rocks) drawRock(ctx, rock);
  if (data.pump.active) drawHose(ctx, data);
  for (const enemy of data.enemies) if (enemy.alive) drawPooka(ctx, enemy);

  // Durante la invulnerabilidad el excavador parpadea, para que se vea que el
  // golpe todavía no cuenta.
  const blinking =
    data.invulnMs > 0 && Math.floor(data.invulnMs / 110) % 2 === 0;
  if (!blinking) drawDigger(ctx, data.player);
}

// ── Componente ──────────────────────────────────────────────────────────────

export type ExcavadorGameProps = GameComponentProps;
export type ExcavadorGameHandle = GameComponentHandle;

export const ExcavadorGame = forwardRef<
  ExcavadorGameHandle,
  ExcavadorGameProps
>(function ExcavadorGame(
  { paused, onScoreChange, onLivesChange, onLevelChange, onGameOver },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<GameData>(createInitialGameData());
  const pausedRef = useRef(paused);
  // Último valor comunicado al HUD: los callbacks solo se disparan al cambiar.
  const reportedRef = useRef({
    score: 0,
    lives: LIVES_START,
    level: 1,
  });
  const callbacksRef = useRef({
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
  });

  pausedRef.current = paused;
  callbacksRef.current = {
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
  };

  // reset()/forceGameOver() se completan en el paso 8 del plan; de momento
  // reconstruyen el nivel 1 y marcan el fin de partida.
  const reset = useCallback(() => {
    dataRef.current = createInitialGameData();
    const terrain = terrainRef.current;
    const tctx = terrain?.getContext("2d");
    if (tctx) paintTerrain(tctx, dataRef.current.grid);
    reportedRef.current = { score: 0, lives: LIVES_START, level: 1 };
    callbacksRef.current.onScoreChange(0);
    callbacksRef.current.onLevelChange(1);
    callbacksRef.current.onLivesChange(LIVES_START);
  }, []);

  const forceGameOver = useCallback(() => {
    const data = dataRef.current;
    if (data.state !== "playing") return;
    data.state = "gameover";
  }, []);

  useImperativeHandle(ref, () => ({ reset, forceGameOver }), [
    reset,
    forceGameOver,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const terrain = document.createElement("canvas");
    terrain.width = W;
    terrain.height = H;
    const tctx = terrain.getContext("2d");
    if (!tctx) return;
    terrainRef.current = terrain;
    paintTerrain(tctx, dataRef.current.grid);

    canvas.focus();
    callbacksRef.current.onScoreChange(0);
    callbacksRef.current.onLivesChange(LIVES_START);
    callbacksRef.current.onLevelChange(1);

    let rafId = 0;
    let lastTime: number | null = null;

    // Pila de flechas pulsadas todavía sin soltar. El excavador avanza mientras
    // se mantenga la tecla, y al soltar una vuelve a la anterior que siga
    // presionada (en vez de quedarse quieto), que es como se siente el arcade.
    let heldDirs: Direction[] = [];

    function syncPendingDir() {
      dataRef.current.pendingDir =
        heldDirs.length > 0 ? heldDirs[heldDirs.length - 1] : null;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!CONTROL_CODES.has(e.code)) return;
      e.preventDefault(); // ni las flechas ni el espacio hacen scroll de la página
      if (pausedRef.current) return;
      const data = dataRef.current;

      if (e.code === "Space") {
        // keydown se repite mientras la tecla sigue pulsada: solo el primero
        // despliega la manguera, en la dirección que mira el excavador.
        if (data.pump.active) return;
        data.pump.active = true;
        data.pump.dir = data.player.dir;
        data.pump.cells = 0;
        data.pump.extendAccum = 0;
        data.pump.inflateAccum = 0;
        data.pump.targetEnemyIndex = null;
        return;
      }

      const dir = DIR_BY_CODE[e.code];
      if (!dir) return;
      if (!heldDirs.includes(dir)) heldDirs.push(dir);
      syncPendingDir();
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (!CONTROL_CODES.has(e.code)) return;
      e.preventDefault();
      const data = dataRef.current;

      if (e.code === "Space") {
        // Soltar antes de reventarlo: la manguera se recoge y el Pooka se
        // desinfla sin daño.
        data.pump.active = false;
        detachPump(data);
        return;
      }

      const dir = DIR_BY_CODE[e.code];
      if (!dir) return;
      heldDirs = heldDirs.filter((d) => d !== dir);
      syncPendingDir();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    /** Abre una celda en el canvas de terreno sin repintar las otras 191. */
    function carveCell(col: number, row: number) {
      paintTunnelCell(tctx!, col, row);
    }

    function reportChanges(data: GameData) {
      const reported = reportedRef.current;
      const cb = callbacksRef.current;
      if (data.score !== reported.score) {
        reported.score = data.score;
        cb.onScoreChange(data.score);
      }
      if (data.lives !== reported.lives) {
        reported.lives = data.lives;
        cb.onLivesChange(data.lives);
      }
      if (data.level !== reported.level) {
        reported.level = data.level;
        cb.onLevelChange(data.level);
      }
    }

    let wasGameOver = false;

    function loop(ts: number) {
      // dt capado a 50ms: convención de la casa, evita saltos tras un tab inactivo.
      const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
      lastTime = ts;

      const data = dataRef.current;
      if (!pausedRef.current && data.state === "playing") {
        if (data.invulnMs > 0) data.invulnMs = Math.max(0, data.invulnMs - dt);
        stepPlayer(data, dt, carveCell);
        checkEnemyContact(data); // el excavador se metió en la celda de un Pooka
        stepEnemies(data, dt);
        checkEnemyContact(data); // …o un Pooka se metió en la suya
        stepPump(data, dt);
      }

      draw(ctx!, terrain, data);
      reportChanges(data);

      if (data.state === "gameover") {
        if (!wasGameOver) {
          wasGameOver = true;
          callbacksRef.current.onGameOver(data.score, false);
        }
      } else {
        wasGameOver = false;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      terrainRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      tabIndex={0}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        outline: "none",
      }}
    />
  );
});
