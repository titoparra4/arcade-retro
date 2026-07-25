"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type {
  GameComponentHandle,
  GameComponentProps,
  SkinId,
} from "./registry";

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
  if (data.state !== "playing") return;
  data.lives -= 1;
  if (data.lives <= 0) {
    // El loop emite onLivesChange(0) en reportChanges() y, en ese mismo frame,
    // onGameOver(score) al ver el estado "gameover": ese es el orden del spec.
    data.lives = 0;
    data.state = "gameover";
    return;
  }
  respawnFrog(data);
}

// Devuelve la rana a la base de inicio y reinicia el temporizador de la ronda.
// Se usa tanto al ocupar una boca como al perder una vida.
function respawnFrog(data: GameData) {
  data.frog = createFrog();
  data.pendingDir = null;
  data.maxRow = ROW_START;
  data.timeLeft = roundTimeFor(data.level);
}

function completeRound(data: GameData) {
  data.score += PTS_ROUND;
  data.goals.fill(false);
  data.level += 1;
  // Carriles nuevos: mismo trazado, un 15 % más rápido por nivel.
  data.lanes = buildLanes(data.level);
  respawnFrog(data);
}

function onGoalFilled(data: GameData) {
  if (data.goals.every(Boolean)) completeRound(data);
  else respawnFrog(data);
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
// ── Skins ───────────────────────────────────────────────────────────────────
// Cada paleta se diseña contra el fondo oscuro (--bg #0a0a0f). Dos contrastes
// son información de juego, no decoración, y se respetan en los tres skins:
//   1. tronco/tortuga (apoyo) frente al agua → el apoyo siempre es mucho más
//      luminoso y de tono opuesto al del río.
//   2. tortuga visible frente a sumergida → la visible es un disco relleno; la
//      sumergida, solo un aro translúcido del mismo tono.
interface Palette {
  // Zonas
  goalRow: string; // franja de las bocas destino
  goalMouth: string; // interior de cada boca
  goalBorder: string; // borde de cada boca
  goalFilled: string; // silueta de rana en la boca ya ocupada
  river: string;
  riverWave: string; // líneas de corriente (rgba, ya con alpha)
  safe: string; // franjas seguras (inicio y mediana)
  road: string;
  roadLine: string; // marcas viales discontinuas (rgba)
  // Vehículos
  carBodies: string[]; // 4 variantes de coche
  carGlass: string; // parabrisas del coche (rgba)
  truckBody: string;
  truckCab: string;
  truckGlass: string; // parabrisas del camión (rgba)
  wheel: string; // ruedas de coches y camiones
  // Río
  log: string;
  logLine: string; // vetas y anillos del tronco
  turtle: string; // aletas/contorno de la tortuga
  turtleShell: string; // caparazón
  turtleSubmerged: string; // aro de la tortuga sumergida (rgba, ya con alpha)
  // Rana
  frog: string;
  frogDark: string; // patas y partes oscuras
  frogEye: string;
  frogPupil: string;
  // HUD interno
  hudBand: string; // franja translúcida superior (rgba)
  hud: string; // texto del HUD
  timeTrack: string; // fondo de la barra de tiempo (rgba)
  timeHigh: string; // > 50 % de tiempo
  timeMid: string; // 25–50 %
  timeLow: string; // < 25 %
  glow: number; // shadowBlur de rana, vehículos y apoyos; 0 = sin glow
}

const SKIN_PALETTES: Record<SkinId, Palette> = {
  // Los colores del arcade original: asfalto negro, río azul, orilla verde,
  // troncos marrones, tortugas verdes y coches de colores planos.
  clasico: {
    goalRow: "#0e2f16",
    goalMouth: "#1f6b2e",
    goalBorder: "#ffcc33",
    goalFilled: "#2fbf2f",
    river: "#0a2a4a",
    riverWave: "rgba(120,200,255,0.08)",
    safe: "#123d1a",
    road: "#0d0d12",
    roadLine: "rgba(255,255,255,0.16)",
    carBodies: ["#ff3b3b", "#ffd23b", "#3b9bff", "#ff7ad9"],
    carGlass: "rgba(255,255,255,0.35)",
    truckBody: "#9aa3ad",
    truckCab: "#5b6570",
    truckGlass: "rgba(255,255,255,0.25)",
    wheel: "#111111",
    log: "#6b4423",
    logLine: "#4a2f18",
    turtle: "#3ddc6b",
    turtleShell: "#2a9e4d",
    turtleSubmerged: "rgba(61,220,107,0.35)",
    frog: "#5cff5c",
    frogDark: "#2fbf2f",
    frogEye: "#ffffff",
    frogPupil: "#0a0a0f",
    hudBand: "rgba(0,0,0,0.62)",
    hud: "#ffffff",
    timeTrack: "rgba(255,255,255,0.12)",
    timeHigh: "#39ff14",
    timeMid: "#ffd23b",
    timeLow: "#ff3b3b",
    glow: 0,
  },
  // Neón saturado sobre la paleta de la app (cyan/magenta/amarillo/verde) con
  // glow. El río queda azul profundo y los troncos naranja neón: el apoyo salta
  // a la vista. La rana es amarilla para no confundirse con las tortugas verdes.
  neon: {
    goalRow: "#0a1220",
    goalMouth: "#062b22",
    goalBorder: "#00ff88",
    goalFilled: "#00f5ff",
    river: "#071a33",
    riverWave: "rgba(0,245,255,0.16)",
    safe: "#1a0b2e",
    road: "#0a0a12",
    roadLine: "rgba(245,255,0,0.30)",
    // 4 tonos de hue bien separados para que los carriles no se confundan.
    carBodies: ["#ff2d7e", "#00f5ff", "#ff3b00", "#00ff88"],
    carGlass: "rgba(255,255,255,0.42)",
    truckBody: "#d8b4fe",
    truckCab: "#8b5cf6",
    truckGlass: "rgba(255,255,255,0.30)",
    wheel: "#05050a",
    // Naranja quemado: contrasta con el azul del río y deja un salto de
    // luminancia claro respecto a la rana amarilla que va encima.
    log: "#f26a00",
    logLine: "#8f3300",
    turtle: "#00ff88",
    turtleShell: "#00b45f",
    turtleSubmerged: "rgba(0,255,136,0.30)",
    frog: "#f5ff00",
    frogDark: "#b8c400",
    frogEye: "#ffffff",
    frogPupil: "#0a0a0f",
    hudBand: "rgba(0,0,0,0.66)",
    hud: "#00f5ff",
    timeTrack: "rgba(0,245,255,0.14)",
    timeHigh: "#00ff88",
    timeMid: "#f5ff00",
    timeLow: "#ff2d7e",
    glow: 10,
  },
  // CRT vintage de doble fósforo: ámbar cálido para asfalto, vehículos y
  // troncos; verde apagado para río, orilla y rana. Saturación baja, pero
  // con luminancia real: el tronco ámbar destaca sobre el agua verde oscura y
  // la tortuga (verde azulado) no se confunde con la rana (verde amarillento).
  retro: {
    goalRow: "#12180d",
    goalMouth: "#2a3a18",
    goalBorder: "#ffb000",
    goalFilled: "#c9922b",
    river: "#0a1a14",
    riverWave: "rgba(140,255,200,0.07)",
    safe: "#33290f", // oliva cálido: subido de luminancia para no fundirse con el asfalto
    road: "#0b0906",
    roadLine: "rgba(255,190,90,0.20)",
    carBodies: ["#ff9e3d", "#d9b44a", "#a8c46a", "#e0663d"],
    carGlass: "rgba(255,220,160,0.28)",
    truckBody: "#cbb894",
    truckCab: "#8a7350",
    truckGlass: "rgba(255,220,160,0.20)",
    wheel: "#100c06",
    log: "#c98b3a", // bronce ámbar sobre agua verde oscura
    logLine: "#8a5a1e",
    turtle: "#5fbf9e", // verde azulado, distinto del verde de la rana
    turtleShell: "#3a8068",
    turtleSubmerged: "rgba(95,191,158,0.30)",
    frog: "#a6f06a",
    frogDark: "#4f9440",
    frogEye: "#f5e6c8",
    frogPupil: "#0a0a0f",
    hudBand: "rgba(10,6,0,0.68)",
    hud: "#ffd28a",
    timeTrack: "rgba(255,200,120,0.12)",
    timeHigh: "#a6f06a",
    timeMid: "#ffb000",
    timeLow: "#e0663d",
    glow: 5,
  },
};

// Aplica el bloom del skin a un dibujo puntual. Con glow = 0 (clásico) no
// toca el contexto, así que el render clásico es idéntico al original.
function withGlow(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  color: string,
  draw: () => void,
) {
  if (pal.glow <= 0) {
    draw();
    return;
  }
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = pal.glow;
  draw();
  ctx.restore();
}

const HUD_BAND_H = 18; // franja translúcida del HUD sobre la fila de metas
const TIME_BAR_H = 6; // barra de tiempo, al pie de la fila 0

function drawZones(ctx: CanvasRenderingContext2D, pal: Palette) {
  // Metas
  ctx.fillStyle = pal.goalRow;
  ctx.fillRect(0, ROW_GOALS * CELL, CANVAS_W, CELL);
  // Río
  ctx.fillStyle = pal.river;
  ctx.fillRect(
    0,
    ROW_RIVER_TOP * CELL,
    CANVAS_W,
    (ROW_RIVER_BOT - ROW_RIVER_TOP + 1) * CELL,
  );
  ctx.fillStyle = pal.riverWave;
  for (let r = ROW_RIVER_TOP; r <= ROW_RIVER_BOT; r++) {
    ctx.fillRect(0, r * CELL + CELL - 3, CANVAS_W, 2);
  }
  // Franjas seguras
  ctx.fillStyle = pal.safe;
  ctx.fillRect(0, ROW_SAFE_MID * CELL, CANVAS_W, CELL);
  ctx.fillRect(0, ROW_START * CELL, CANVAS_W, CELL);
  // Carretera
  ctx.fillStyle = pal.road;
  ctx.fillRect(
    0,
    ROW_ROAD_TOP * CELL,
    CANVAS_W,
    (ROW_ROAD_BOT - ROW_ROAD_TOP + 1) * CELL,
  );
  ctx.fillStyle = pal.roadLine;
  for (let r = ROW_ROAD_TOP + 1; r <= ROW_ROAD_BOT; r++) {
    for (let x = 0; x < CANVAS_W; x += 40) {
      ctx.fillRect(x + 6, r * CELL - 1, 20, 2);
    }
  }
}

function drawGoals(
  ctx: CanvasRenderingContext2D,
  goals: boolean[],
  pal: Palette,
) {
  const top = ROW_GOALS * CELL + HUD_BAND_H;
  const h = CELL - HUD_BAND_H - TIME_BAR_H;
  GOAL_COLS.forEach((col, i) => {
    const x = col * CELL;
    const w = GOAL_WIDTH * CELL;
    ctx.fillStyle = pal.goalMouth;
    ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = pal.goalBorder;
    ctx.lineWidth = 2;
    withGlow(ctx, pal, pal.goalBorder, () =>
      ctx.strokeRect(x + 1, top + 1, w - 2, h - 2),
    );
    if (goals[i]) {
      // Silueta de rana en la boca ya ocupada.
      ctx.fillStyle = pal.goalFilled;
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
  pal: Palette,
) {
  const w = CELL - 6;
  const h = CELL - 14;
  const top = y + 7;
  const body = pal.carBodies[v % pal.carBodies.length];
  ctx.fillStyle = body;
  withGlow(ctx, pal, body, () => ctx.fillRect(x + 3, top, w, h));
  ctx.fillStyle = pal.carGlass;
  ctx.fillRect(x + 8, top + 4, w - 10, 5);
  ctx.fillStyle = pal.wheel;
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
  pal: Palette,
) {
  const w = width * CELL - 6;
  const h = CELL - 12;
  const top = y + 6;
  ctx.fillStyle = pal.truckBody;
  withGlow(ctx, pal, pal.truckBody, () => ctx.fillRect(x + 3, top, w, h));
  ctx.fillStyle = pal.truckCab;
  ctx.fillRect(x + 3, top, CELL - 8, h);
  ctx.fillStyle = pal.truckGlass;
  ctx.fillRect(x + 8, top + 4, CELL - 18, 6);
  ctx.fillStyle = pal.wheel;
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
  pal: Palette,
) {
  const w = width * CELL - 4;
  const h = CELL - 10;
  const top = y + 5;
  // El tronco es el apoyo: se dibuja lleno y luminoso para que nunca se
  // confunda con el agua de debajo.
  ctx.fillStyle = pal.log;
  withGlow(ctx, pal, pal.log, () => ctx.fillRect(x + 2, top, w, h));
  ctx.strokeStyle = pal.logLine;
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 6, top + (h * i) / 4);
    ctx.lineTo(x + w - 2, top + (h * i) / 4);
    ctx.stroke();
  }
  // Anillos de los extremos
  ctx.strokeStyle = pal.logLine;
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
  pal: Palette,
) {
  for (let i = 0; i < width; i++) {
    const cx = x + i * CELL + CELL / 2;
    const cy = y + CELL / 2;
    if (submerged) {
      // Sumergida = solo un aro translúcido, sin relleno ni glow: la
      // diferencia con la tortuga visible tiene que leerse de un vistazo.
      ctx.strokeStyle = pal.turtleSubmerged;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 5, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = pal.turtle;
    withGlow(ctx, pal, pal.turtle, () => {
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = pal.turtleShell;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL / 2 - 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.turtle;
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

function drawEntities(
  ctx: CanvasRenderingContext2D,
  lanes: Lane[],
  pal: Palette,
) {
  for (const lane of lanes) {
    const y = lane.row * CELL;
    for (const entity of lane.entities) {
      const x = entity.col * CELL;
      switch (entity.type) {
        case "car":
          drawCar(ctx, x, y, entity.variant ?? 0, pal);
          break;
        case "truck":
          drawTruck(ctx, x, y, entity.width, pal);
          break;
        case "log":
          drawLog(ctx, x, y, entity.width, pal);
          break;
        case "turtle":
          drawTurtles(ctx, x, y, entity.width, entity.submerged === true, pal);
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

function drawFrog(ctx: CanvasRenderingContext2D, frog: Frog, pal: Palette) {
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
  ctx.fillStyle = pal.frogDark;
  const legOut = frog.animating ? 5 : 2;
  ctx.fillRect(-15 - legOut, -8, 8, 5);
  ctx.fillRect(7 + legOut, -8, 8, 5);
  ctx.fillRect(-15 - legOut, 4, 8, 5);
  ctx.fillRect(7 + legOut, 4, 8, 5);

  // Cuerpo 28 × 24
  ctx.fillStyle = pal.frog;
  withGlow(ctx, pal, pal.frog, () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ojos
  ctx.fillStyle = pal.frogEye;
  ctx.beginPath();
  ctx.arc(-6, -7, 4, 0, Math.PI * 2);
  ctx.arc(6, -7, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.frogPupil;
  ctx.beginPath();
  ctx.arc(-6, -8, 2, 0, Math.PI * 2);
  ctx.arc(6, -8, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, data: GameData, pal: Palette) {
  // Franja translúcida: el HUD interno comparte fila con las bocas destino,
  // así que se reserva el borde superior de la fila 0 para no taparlas.
  ctx.fillStyle = pal.hudBand;
  ctx.fillRect(0, 0, CANVAS_W, HUD_BAND_H);

  ctx.font = "700 13px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillStyle = pal.hud;
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${data.score}`, 8, HUD_BAND_H / 2);
  ctx.textAlign = "center";
  ctx.fillText(`NIVEL ${data.level}`, CANVAS_W / 2, HUD_BAND_H / 2);

  // Vidas: un círculo verde por vida restante, arriba a la derecha.
  for (let i = 0; i < data.lives; i++) {
    ctx.fillStyle = pal.frog;
    ctx.beginPath();
    ctx.arc(CANVAS_W - 12 - i * 16, HUD_BAND_H / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.frogPupil;
    ctx.beginPath();
    ctx.arc(CANVAS_W - 14 - i * 16, HUD_BAND_H / 2 - 2, 1.4, 0, Math.PI * 2);
    ctx.arc(CANVAS_W - 10 - i * 16, HUD_BAND_H / 2 - 2, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Barra de tiempo al pie de la fila 0: verde → amarillo → rojo.
  const total = roundTimeFor(data.level);
  const ratio = Math.max(0, Math.min(1, data.timeLeft / total));
  const y = CELL - TIME_BAR_H;
  ctx.fillStyle = pal.timeTrack;
  ctx.fillRect(0, y, CANVAS_W, TIME_BAR_H);
  ctx.fillStyle =
    ratio > 0.5 ? pal.timeHigh : ratio > 0.25 ? pal.timeMid : pal.timeLow;
  ctx.fillRect(0, y, CANVAS_W * ratio, TIME_BAR_H);
}

function draw(ctx: CanvasRenderingContext2D, data: GameData, pal: Palette) {
  drawZones(ctx, pal);
  drawEntities(ctx, data.lanes, pal);
  drawGoals(ctx, data.goals, pal);
  drawFrog(ctx, data.frog, pal);
  drawHud(ctx, data, pal);
}

export type RanariaGameProps = GameComponentProps;
export type RanariaGameHandle = GameComponentHandle;

interface ReportedState {
  score: number;
  lives: number;
  level: number;
  time: number; // temporizador de ronda, con 1 decimal (stat extra del HUD)
}

export const RanariaGame = forwardRef<RanariaGameHandle, RanariaGameProps>(
  function RanariaGame(
    {
      paused,
      skin,
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
      onExtraStatChange,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const dataRef = useRef<GameData>(createInitialGameData());
    const pausedRef = useRef(paused);
    // skinRef: el loop de canvas lee el skin activo sin re-suscribir el efecto.
    const skinRef = useRef<SkinId>(skin);
    skinRef.current = skin;
    const callbacksRef = useRef({
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
      onExtraStatChange,
    });
    const reportedRef = useRef<ReportedState>({
      score: 0,
      lives: START_LIVES,
      level: 1,
      time: roundTimeFor(1),
    });

    pausedRef.current = paused;
    callbacksRef.current = {
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
      onExtraStatChange,
    };

    const reset = useCallback(() => {
      dataRef.current = createInitialGameData();
      reportedRef.current = {
        score: 0,
        lives: START_LIVES,
        level: 1,
        time: roundTimeFor(1),
      };
      callbacksRef.current.onScoreChange(0);
      callbacksRef.current.onLivesChange(START_LIVES);
      callbacksRef.current.onLevelChange(1);
      callbacksRef.current.onExtraStatChange(roundTimeFor(1));
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

      canvas.focus();
      callbacksRef.current.onLivesChange(START_LIVES);
      callbacksRef.current.onExtraStatChange(dataRef.current.timeLeft);

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
        // Stat extra del HUD de la plataforma: el reloj de la ronda. Se emite
        // con 1 decimal (la resolución que muestra el player) para no disparar
        // un setState por frame.
        const time = Math.round(data.timeLeft * 10) / 10;
        if (time !== reported.time) {
          reported.time = time;
          cb.onExtraStatChange(time);
        }
      }

      function loop(ts: number) {
        const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
        lastTime = ts;

        const data = dataRef.current;
        // En pausa se congela update() pero se sigue dibujando.
        if (!pausedRef.current) update(data, dt);

        draw(ctx!, data, SKIN_PALETTES[skinRef.current]);
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
