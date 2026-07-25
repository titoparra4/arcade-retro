"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GameComponentHandle, GameComponentProps } from "./registry";

// ── Cuadrícula ──────────────────────────────────────────────────────────────
// El mapa es vertical: la rana arranca abajo y avanza hacia arriba. 16 columnas
// × 14 filas de 40 px → canvas de 640 × 560 px, escalado por CSS al contenedor.
const COLS = 16;
const ROWS = 14;
const CELL = 40; // px
const CANVAS_W = COLS * CELL; // 640
const CANVAS_H = ROWS * CELL; // 560

// Zonas (índice de fila, 0 = arriba)
const ROW_GOALS = 0; // 5 bocas destino
const ROW_RIVER_TOP = 1; // río: filas 1–6 (6 carriles)
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7; // franja segura entre río y carretera
const ROW_ROAD_TOP = 8; // carretera: filas 8–12 (5 carriles)
const ROW_ROAD_BOT = 12;
const ROW_START = 13; // base de inicio

// ── Reglas ──────────────────────────────────────────────────────────────────
const START_COL = Math.floor(COLS / 2); // columna central de arranque
const JUMP_MS = 120; // duración de la animación de salto
const START_LIVES = 3;

const GOAL_COUNT = 5;
const GOAL_WIDTH = 2; // cada boca ocupa 2 columnas de las 16
// Bocas repartidas con hueco entre ellas: columnas 1, 4, 7, 10, 13.
const GOAL_COLS = Array.from(
  { length: GOAL_COUNT },
  (_, i) => 1 + i * (GOAL_WIDTH + 1),
);

// Temporizador de ronda: 15 s iniciales, 1 s menos por nivel, con suelo de 8 s.
const ROUND_TIME_BASE = 15;
const ROUND_TIME_MIN = 8;
const roundTimeFor = (level: number) =>
  Math.max(ROUND_TIME_MIN, ROUND_TIME_BASE - (level - 1));

// Cada nivel incrementa todas las velocidades un 15 %.
const LEVEL_SPEED_STEP = 1.15;
const speedFactorFor = (level: number) => LEVEL_SPEED_STEP ** (level - 1);

// Puntuación
const PTS_ROW_ADVANCE = 10; // por celda avanzada hacia arriba, primera vez en la ronda
const PTS_GOAL = 50; // por ocupar una boca destino
const PTS_ROUND = 200; // por completar la ronda (5 bocas)
const PTS_TIME_BONUS = 10; // × segundos restantes al ocupar una boca

// Ciclo de inmersión de las tortugas
const TURTLE_VISIBLE_MS = 3000;
const TURTLE_SUBMERGED_MS = 1500;

const CONTROL_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

// ── Tipos ───────────────────────────────────────────────────────────────────
type Direction = "up" | "down" | "left" | "right";

interface Entity {
  col: number; // posición en columnas (fraccionaria: se mueve en continuo)
  width: number; // ancho en columnas
  type: "car" | "truck" | "log" | "turtle";
  submerged?: boolean; // solo tortugas: mientras es true no dan soporte
  cycleT?: number; // solo tortugas: reloj del ciclo de inmersión (ms)
  variant?: number; // índice de color/estilo, para que el carril no sea monótono
}

interface Lane {
  row: number;
  speed: number; // px/frame a 60 fps
  dir: 1 | -1;
  entities: Entity[];
}

interface Frog {
  col: number;
  row: number;
  animating: boolean;
  animT: number;
  targetCol: number;
  targetRow: number;
  fromCol: number; // origen del salto, para interpolar el dibujo
  fromRow: number;
  facing: Direction;
}

interface GameData {
  frog: Frog;
  lanes: Lane[];
  goals: boolean[]; // true = boca ya ocupada en esta ronda
  pendingDir: Direction | null;
  score: number;
  lives: number;
  level: number;
  timeLeft: number; // segundos restantes de la ronda
  maxRow: number; // fila más alta alcanzada en la ronda (para +10 por avance)
  state: "playing" | "gameover";
}

// ── Construcción del mapa ───────────────────────────────────────────────────
// Cada carril tiene entidades de un único ancho: así todas recorren el mismo
// ciclo (COLS + width) y el reparto inicial equiespaciado se conserva intacto
// tras reaparecer por el lado opuesto, sin que los huecos se cierren con el
// tiempo. El hueco resultante es `period - width` columnas, siempre ≥ 1.
interface LaneBlueprint {
  row: number;
  type: Entity["type"];
  width: number; // en columnas
  count: number; // entidades del carril (≥ 2)
  speed: number; // px/frame a 60 fps, antes de escalar por nivel
  dir: 1 | -1;
}

// Carretera (filas 8–12) y río (filas 1–6), con sentidos alternos por carril.
const LANE_BLUEPRINTS: LaneBlueprint[] = [
  // Río: de la orilla lejana (fila 1) a la cercana (fila 6).
  { row: 1, type: "log", width: 3, count: 3, speed: 2.4, dir: -1 },
  { row: 2, type: "turtle", width: 3, count: 3, speed: 1.4, dir: 1 },
  { row: 3, type: "log", width: 2, count: 4, speed: 2.0, dir: -1 },
  { row: 4, type: "log", width: 4, count: 2, speed: 1.0, dir: 1 },
  { row: 5, type: "turtle", width: 2, count: 4, speed: 1.6, dir: -1 },
  { row: 6, type: "log", width: 3, count: 3, speed: 1.2, dir: 1 },
  // Carretera: de la más lejana (fila 8) a la más cercana al inicio (fila 12).
  { row: 8, type: "car", width: 1, count: 3, speed: 3.4, dir: -1 },
  { row: 9, type: "truck", width: 3, count: 2, speed: 1.8, dir: 1 },
  { row: 10, type: "car", width: 1, count: 4, speed: 2.8, dir: -1 },
  { row: 11, type: "truck", width: 2, count: 2, speed: 2.2, dir: 1 },
  { row: 12, type: "car", width: 1, count: 3, speed: 1.6, dir: -1 },
];

const TURTLE_CYCLE_MS = TURTLE_VISIBLE_MS + TURTLE_SUBMERGED_MS;

function buildLane(bp: LaneBlueprint, factor: number): Lane {
  // Ciclo completo de una entidad: cruza el carril y vuelve a entrar.
  const period = (COLS + bp.width) / bp.count;
  const entities: Entity[] = Array.from({ length: bp.count }, (_, i) => {
    const entity: Entity = {
      col: -bp.width + i * period,
      width: bp.width,
      type: bp.type,
      variant: i,
    };
    if (bp.type === "turtle") {
      // Fases escalonadas: los grupos de un mismo carril nunca se sumergen a la
      // vez, así que siempre queda alguno donde apoyarse.
      entity.cycleT = (i * TURTLE_CYCLE_MS) / bp.count;
      entity.submerged = false;
    }
    return entity;
  });
  return { row: bp.row, speed: bp.speed * factor, dir: bp.dir, entities };
}

function buildLanes(level: number): Lane[] {
  const factor = speedFactorFor(level);
  return LANE_BLUEPRINTS.map((bp) => buildLane(bp, factor));
}

// ── Estado inicial ──────────────────────────────────────────────────────────
function createFrog(): Frog {
  return {
    col: START_COL,
    row: ROW_START,
    animating: false,
    animT: 0,
    targetCol: START_COL,
    targetRow: ROW_START,
    fromCol: START_COL,
    fromRow: ROW_START,
    facing: "up",
  };
}

function createInitialGameData(): GameData {
  return {
    frog: createFrog(),
    lanes: buildLanes(1),
    goals: Array.from({ length: GOAL_COUNT }, () => false),
    pendingDir: null,
    score: 0,
    lives: START_LIVES,
    level: 1,
    timeLeft: roundTimeFor(1),
    maxRow: ROW_START,
    state: "playing",
  };
}

// Centro de la rana en columnas: la rana ocupa [col, col + 1).
const frogCenter = (frog: Frog) => frog.col + 0.5;

const isRiverRow = (row: number) =>
  row >= ROW_RIVER_TOP && row <= ROW_RIVER_BOT;
const isRoadRow = (row: number) => row >= ROW_ROAD_TOP && row <= ROW_ROAD_BOT;

// ── Colisiones y soporte ────────────────────────────────────────────────────
// Todas las pruebas usan el centro de la rana contra el rango [col, col+width)
// de la entidad: el atropello o el apoyo se deciden por dónde está el cuerpo,
// no por un roce de bordes.
function covers(entity: Entity, center: number) {
  return center >= entity.col && center < entity.col + entity.width;
}

function checkRoadCollision(frog: Frog, lanes: Lane[]): boolean {
  if (!isRoadRow(frog.row)) return false;
  const center = frogCenter(frog);
  for (const lane of lanes) {
    if (lane.row !== frog.row) continue;
    if (!isRoadRow(lane.row)) continue;
    for (const entity of lane.entities) {
      if (entity.type !== "car" && entity.type !== "truck") continue;
      if (covers(entity, center)) return true;
    }
  }
  return false;
}

function getSupport(frog: Frog, lanes: Lane[]): Entity | null {
  if (!isRiverRow(frog.row)) return null;
  const center = frogCenter(frog);
  for (const lane of lanes) {
    if (lane.row !== frog.row) continue;
    for (const entity of lane.entities) {
      if (!covers(entity, center)) continue;
      // Una tortuga sumergida deja de ser apoyo.
      if (entity.type === "turtle" && entity.submerged) return null;
      return entity;
    }
  }
  return null;
}

// Resultado de aterrizar en la fila de metas.
type GoalOutcome = "filled" | "death";

function checkGoal(data: GameData): GoalOutcome {
  const center = frogCenter(data.frog);
  const index = GOAL_COLS.findIndex(
    (col) => center >= col && center < col + GOAL_WIDTH,
  );
  // Fuera de boca (la orilla entre bocas) o boca ya ocupada: muerte.
  if (index === -1 || data.goals[index]) return "death";

  data.goals[index] = true;
  data.score +=
    PTS_GOAL + Math.floor(Math.max(0, data.timeLeft)) * PTS_TIME_BONUS;
  return "filled";
}

// ── Motor ───────────────────────────────────────────────────────────────────
const DIRECTION_DELTAS: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

function startJump(data: GameData, dir: Direction) {
  const frog = data.frog;
  const { dc, dr } = DIRECTION_DELTAS[dir];
  // Sobre un tronco la rana lleva desplazamiento fraccionario: el salto parte
  // de la celda en la que está apoyada, para que siempre caiga alineada.
  const baseCol = Math.round(frog.col);
  const targetCol = baseCol + dc;
  const targetRow = frog.row + dr;

  frog.facing = dir;
  // Bordes laterales y verticales: el salto que saldría del mapa se ignora.
  if (targetCol < 0 || targetCol > COLS - 1) return;
  if (targetRow < ROW_GOALS || targetRow > ROW_START) return;

  frog.fromCol = frog.col;
  frog.fromRow = frog.row;
  frog.targetCol = targetCol;
  frog.targetRow = targetRow;
  frog.animating = true;
  frog.animT = 0;
}

function killFrog(data: GameData) {
  // Paso 7: por ahora la muerte termina la partida directamente.
  if (data.state !== "playing") return;
  data.state = "gameover";
}

function onGoalFilled(data: GameData) {
  // Paso 6: reinicio de rana/temporizador y cierre de ronda al llenar las 5.
}

// Resolución de la celda de destino al aterrizar: puntuación por avance,
// meta alcanzada y las muertes que dependen de dónde cae la rana.
function resolveLanding(data: GameData) {
  const frog = data.frog;
  if (frog.row < data.maxRow) {
    data.score += PTS_ROW_ADVANCE * (data.maxRow - frog.row);
    data.maxRow = frog.row;
  }

  if (frog.row === ROW_GOALS) {
    if (checkGoal(data) === "death") killFrog(data);
    else onGoalFilled(data);
    return;
  }

  if (checkRoadCollision(frog, data.lanes)) {
    killFrog(data);
    return;
  }

  // Caer al agua: fila de río sin tronco ni tortugas visibles debajo.
  if (isRiverRow(frog.row) && !getSupport(frog, data.lanes)) killFrog(data);
}

function update(data: GameData, dt: number) {
  if (data.state !== "playing") return;

  // 1. Entidades: avance horizontal y reaparición por el lado opuesto.
  //    `speed` está en px/frame a 60 fps → columnas = px / CELL.
  for (const lane of data.lanes) {
    const step = ((lane.speed / CELL) * lane.dir * dt) / 16;
    const cycle = COLS + lane.entities[0].width;
    for (const entity of lane.entities) {
      entity.col += step;
      if (entity.col >= COLS) entity.col -= cycle;
      else if (entity.col <= -entity.width) entity.col += cycle;

      if (entity.type === "turtle") {
        entity.cycleT = ((entity.cycleT ?? 0) + dt) % TURTLE_CYCLE_MS;
        entity.submerged = entity.cycleT >= TURTLE_VISIBLE_MS;
      }
    }
  }

  // 2. Rana: animación de salto o input pendiente.
  const frog = data.frog;
  if (frog.animating) {
    frog.animT += dt;
    if (frog.animT >= JUMP_MS) {
      frog.col = frog.targetCol;
      frog.row = frog.targetRow;
      frog.animating = false;
      frog.animT = 0;
      resolveLanding(data);
    }
  } else if (data.pendingDir) {
    const dir = data.pendingDir;
    data.pendingDir = null;
    startJump(data, dir);
  }

  if (data.state !== "playing") return;

  // 3. Peligros continuos: mientras la rana está posada, el mundo se le echa
  //    encima (un coche la alcanza, o la tortuga que la sostiene se sumerge).
  if (!frog.animating) {
    if (checkRoadCollision(frog, data.lanes)) {
      killFrog(data);
      return;
    }

    if (isRiverRow(frog.row)) {
      const support = getSupport(frog, data.lanes);
      if (!support) {
        killFrog(data);
        return;
      }
      // Río: la rana viaja con la entidad que la sostiene.
      const lane = data.lanes.find((l) => l.row === frog.row);
      if (lane) frog.col += ((lane.speed / CELL) * lane.dir * dt) / 16;
      // Arrastrada fuera por un borde del río.
      const center = frogCenter(frog);
      if (center < 0 || center > COLS) {
        killFrog(data);
        return;
      }
    }
  }

  // 4. Temporizador de ronda.
  data.timeLeft = Math.max(0, data.timeLeft - dt / 1000);
  if (data.timeLeft <= 0) killFrog(data);
}

// ── Dibujo ──────────────────────────────────────────────────────────────────
const COLORS = {
  road: "#0d0d12",
  roadLine: "rgba(255,255,255,0.16)",
  river: "#0a2a4a",
  riverWave: "rgba(120,200,255,0.08)",
  safe: "#123d1a",
  goalRow: "#0e2f16",
  goalMouth: "#1f6b2e",
  goalBorder: "#ffcc33",
  log: "#6b4423",
  logLine: "#4a2f18",
  turtle: "#3ddc6b",
  turtleShell: "#2a9e4d",
  truckBody: "#9aa3ad",
  truckCab: "#5b6570",
  frog: "#5cff5c",
  frogDark: "#2fbf2f",
  hud: "#ffffff",
};

const CAR_COLORS = ["#ff3b3b", "#ffd23b", "#3b9bff", "#ff7ad9"];

const HUD_BAND_H = 18; // franja translúcida del HUD sobre la fila de metas
const TIME_BAR_H = 6; // barra de tiempo, al pie de la fila 0

function drawZones(ctx: CanvasRenderingContext2D) {
  // Metas
  ctx.fillStyle = COLORS.goalRow;
  ctx.fillRect(0, ROW_GOALS * CELL, CANVAS_W, CELL);
  // Río
  ctx.fillStyle = COLORS.river;
  ctx.fillRect(
    0,
    ROW_RIVER_TOP * CELL,
    CANVAS_W,
    (ROW_RIVER_BOT - ROW_RIVER_TOP + 1) * CELL,
  );
  ctx.fillStyle = COLORS.riverWave;
  for (let r = ROW_RIVER_TOP; r <= ROW_RIVER_BOT; r++) {
    ctx.fillRect(0, r * CELL + CELL - 3, CANVAS_W, 2);
  }
  // Franjas seguras
  ctx.fillStyle = COLORS.safe;
  ctx.fillRect(0, ROW_SAFE_MID * CELL, CANVAS_W, CELL);
  ctx.fillRect(0, ROW_START * CELL, CANVAS_W, CELL);
  // Carretera
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(
    0,
    ROW_ROAD_TOP * CELL,
    CANVAS_W,
    (ROW_ROAD_BOT - ROW_ROAD_TOP + 1) * CELL,
  );
  ctx.fillStyle = COLORS.roadLine;
  for (let r = ROW_ROAD_TOP + 1; r <= ROW_ROAD_BOT; r++) {
    for (let x = 0; x < CANVAS_W; x += 40) {
      ctx.fillRect(x + 6, r * CELL - 1, 20, 2);
    }
  }
}

function drawGoals(ctx: CanvasRenderingContext2D, goals: boolean[]) {
  const top = ROW_GOALS * CELL + HUD_BAND_H;
  const h = CELL - HUD_BAND_H - TIME_BAR_H;
  GOAL_COLS.forEach((col, i) => {
    const x = col * CELL;
    const w = GOAL_WIDTH * CELL;
    ctx.fillStyle = COLORS.goalMouth;
    ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = COLORS.goalBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, top + 1, w - 2, h - 2);
    if (goals[i]) {
      // Silueta de rana en la boca ya ocupada.
      ctx.fillStyle = COLORS.frogDark;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, top + h / 2, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + w / 2 - 13, top + h / 2 - 7, 5, 4);
      ctx.fillRect(x + w / 2 + 8, top + h / 2 - 7, 5, 4);
    }
  });
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  v: number,
) {
  const w = CELL - 6;
  const h = CELL - 14;
  const top = y + 7;
  ctx.fillStyle = CAR_COLORS[v % CAR_COLORS.length];
  ctx.fillRect(x + 3, top, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x + 8, top + 4, w - 10, 5);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 10, top + h, 4, 0, Math.PI * 2);
  ctx.arc(x + w - 4, top + h, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTruck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) {
  const w = width * CELL - 6;
  const h = CELL - 12;
  const top = y + 6;
  ctx.fillStyle = COLORS.truckBody;
  ctx.fillRect(x + 3, top, w, h);
  ctx.fillStyle = COLORS.truckCab;
  ctx.fillRect(x + 3, top, CELL - 8, h);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 8, top + 4, CELL - 18, 6);
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 14, top + h, 4, 0, Math.PI * 2);
  ctx.arc(x + w - 8, top + h, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawLog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) {
  const w = width * CELL - 4;
  const h = CELL - 10;
  const top = y + 5;
  ctx.fillStyle = COLORS.log;
  ctx.fillRect(x + 2, top, w, h);
  ctx.strokeStyle = COLORS.logLine;
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 6, top + (h * i) / 4);
    ctx.lineTo(x + w - 2, top + (h * i) / 4);
    ctx.stroke();
  }
  // Anillos de los extremos
  ctx.strokeStyle = COLORS.logLine;
  ctx.beginPath();
  ctx.ellipse(x + 4, top + h / 2, 3, h / 2 - 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTurtles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  submerged: boolean,
) {
  for (let i = 0; i < width; i++) {
    const cx = x + i * CELL + CELL / 2;
    const cy = y + CELL / 2;
    if (submerged) {
      ctx.strokeStyle = "rgba(61,220,107,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 5, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = COLORS.turtle;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.turtleShell;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL / 2 - 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.turtle;
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 4; s++) {
      const a = (Math.PI / 2) * s + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(a) * (CELL / 2 - 9),
        cy + Math.sin(a) * (CELL / 2 - 9),
      );
      ctx.stroke();
    }
  }
}

function drawEntities(ctx: CanvasRenderingContext2D, lanes: Lane[]) {
  for (const lane of lanes) {
    const y = lane.row * CELL;
    for (const entity of lane.entities) {
      const x = entity.col * CELL;
      switch (entity.type) {
        case "car":
          drawCar(ctx, x, y, entity.variant ?? 0);
          break;
        case "truck":
          drawTruck(ctx, x, y, entity.width);
          break;
        case "log":
          drawLog(ctx, x, y, entity.width);
          break;
        case "turtle":
          drawTurtles(ctx, x, y, entity.width, entity.submerged === true);
          break;
      }
    }
  }
}

const FACING_ANGLE: Record<Direction, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

function drawFrog(ctx: CanvasRenderingContext2D, frog: Frog) {
  // Interpolación del salto: la rana se desplaza entre celdas en JUMP_MS.
  const t = frog.animating ? Math.min(1, frog.animT / JUMP_MS) : 1;
  const col = frog.animating
    ? frog.fromCol + (frog.targetCol - frog.fromCol) * t
    : frog.col;
  const row = frog.animating
    ? frog.fromRow + (frog.targetRow - frog.fromRow) * t
    : frog.row;
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;
  // Pequeño "hop": la rana crece a mitad del salto.
  const hop = frog.animating ? 1 + Math.sin(Math.PI * t) * 0.18 : 1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(FACING_ANGLE[frog.facing]);
  ctx.scale(hop, hop);

  // Patas extendidas durante el salto
  ctx.fillStyle = COLORS.frogDark;
  const legOut = frog.animating ? 5 : 2;
  ctx.fillRect(-15 - legOut, -8, 8, 5);
  ctx.fillRect(7 + legOut, -8, 8, 5);
  ctx.fillRect(-15 - legOut, 4, 8, 5);
  ctx.fillRect(7 + legOut, 4, 8, 5);

  // Cuerpo 28 × 24
  ctx.fillStyle = COLORS.frog;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ojos
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-6, -7, 4, 0, Math.PI * 2);
  ctx.arc(6, -7, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a0f";
  ctx.beginPath();
  ctx.arc(-6, -8, 2, 0, Math.PI * 2);
  ctx.arc(6, -8, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, data: GameData) {
  // Franja translúcida: el HUD interno comparte fila con las bocas destino,
  // así que se reserva el borde superior de la fila 0 para no taparlas.
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, CANVAS_W, HUD_BAND_H);

  ctx.font = "700 13px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.hud;
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${data.score}`, 8, HUD_BAND_H / 2);
  ctx.textAlign = "center";
  ctx.fillText(`NIVEL ${data.level}`, CANVAS_W / 2, HUD_BAND_H / 2);

  // Vidas: un círculo verde por vida restante, arriba a la derecha.
  for (let i = 0; i < data.lives; i++) {
    ctx.fillStyle = COLORS.frog;
    ctx.beginPath();
    ctx.arc(CANVAS_W - 12 - i * 16, HUD_BAND_H / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0a0f";
    ctx.beginPath();
    ctx.arc(CANVAS_W - 14 - i * 16, HUD_BAND_H / 2 - 2, 1.4, 0, Math.PI * 2);
    ctx.arc(CANVAS_W - 10 - i * 16, HUD_BAND_H / 2 - 2, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Barra de tiempo al pie de la fila 0: verde → amarillo → rojo.
  const total = roundTimeFor(data.level);
  const ratio = Math.max(0, Math.min(1, data.timeLeft / total));
  const y = CELL - TIME_BAR_H;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, y, CANVAS_W, TIME_BAR_H);
  ctx.fillStyle =
    ratio > 0.5 ? "#39ff14" : ratio > 0.25 ? "#ffd23b" : "#ff3b3b";
  ctx.fillRect(0, y, CANVAS_W * ratio, TIME_BAR_H);
}

function draw(ctx: CanvasRenderingContext2D, data: GameData) {
  drawZones(ctx);
  drawEntities(ctx, data.lanes);
  drawGoals(ctx, data.goals);
  drawFrog(ctx, data.frog);
  drawHud(ctx, data);
}

export type RanariaGameProps = GameComponentProps;
export type RanariaGameHandle = GameComponentHandle;

interface ReportedState {
  score: number;
  lives: number;
  level: number;
}

export const RanariaGame = forwardRef<RanariaGameHandle, RanariaGameProps>(
  function RanariaGame(
    { paused, onScoreChange, onLivesChange, onLevelChange, onGameOver },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dataRef = useRef<GameData>(createInitialGameData());
    const pausedRef = useRef(paused);
    const callbacksRef = useRef({
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
    });
    const reportedRef = useRef<ReportedState>({
      score: 0,
      lives: START_LIVES,
      level: 1,
    });

    pausedRef.current = paused;
    callbacksRef.current = {
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
    };

    const reset = useCallback(() => {
      dataRef.current = createInitialGameData();
      reportedRef.current = { score: 0, lives: START_LIVES, level: 1 };
      callbacksRef.current.onScoreChange(0);
      callbacksRef.current.onLivesChange(START_LIVES);
      callbacksRef.current.onLevelChange(1);
    }, []);

    const forceGameOver = useCallback(() => {
      // Completado en el paso 7.
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

      canvas.focus();
      callbacksRef.current.onLivesChange(START_LIVES);

      let rafId = 0;
      let lastTime: number | null = null;
      let wasGameOver = false;

      function handleKeyDown(e: KeyboardEvent) {
        if (!CONTROL_CODES.has(e.code)) return;
        e.preventDefault();
        if (pausedRef.current) return;
        const data = dataRef.current;
        if (data.state !== "playing") return;
        switch (e.code) {
          case "ArrowUp":
            data.pendingDir = "up";
            break;
          case "ArrowDown":
            data.pendingDir = "down";
            break;
          case "ArrowLeft":
            data.pendingDir = "left";
            break;
          case "ArrowRight":
            data.pendingDir = "right";
            break;
        }
      }

      function handleKeyUp(e: KeyboardEvent) {
        if (CONTROL_CODES.has(e.code)) e.preventDefault();
      }

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      function reportChanges() {
        const data = dataRef.current;
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

      function loop(ts: number) {
        const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
        lastTime = ts;

        const data = dataRef.current;
        // En pausa se congela update() pero se sigue dibujando.
        if (!pausedRef.current) update(data, dt);

        draw(ctx!, data);
        reportChanges();

        if (data.state === "gameover") {
          if (!wasGameOver) {
            wasGameOver = true;
            callbacksRef.current.onGameOver(data.score);
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
      };
    }, []);

    return (
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
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
  },
);
