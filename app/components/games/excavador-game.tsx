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
      pumpStage: 0,
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

function draw(
  ctx: CanvasRenderingContext2D,
  terrain: HTMLCanvasElement,
  data: GameData,
) {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(terrain, 0, 0);
  for (const rock of data.rocks) drawRock(ctx, rock);
  drawDigger(ctx, data.player);
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

    function loop(ts: number) {
      // dt capado a 50ms: convención de la casa, evita saltos tras un tab inactivo.
      const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
      lastTime = ts;
      void dt; // la simulación entra en los pasos 4–8 del plan

      draw(ctx!, terrain, dataRef.current);
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
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
