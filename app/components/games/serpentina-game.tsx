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
import {
  FRUIT_KINDS,
  FRUIT_SPRITE_SOURCE,
  FRUIT_SPRITES,
  type FruitKind,
} from "./serpentina-sprites";

// ── Skins ───────────────────────────────────────────────────────────────────
// Cada paleta se diseña contra el fondo oscuro (--bg #0a0a0f). Ningún color
// clave puede fundirse con el fondo: cabeza, cuerpo y rejilla mantienen
// luminancia real sobre negro. Las frutas son sprites fotográficos y no cambian.
interface Palette {
  bg: string; // fondo del canvas del juego
  head: string; // cabeza de la serpiente
  body: string; // cuerpo de la serpiente
  grid: string; // líneas de la rejilla (rgba, ya con alpha)
  glow: number; // shadowBlur de la cabeza; el cuerpo usa la mitad; 0 = sin glow
}

const SKIN_PALETTES: Record<SkinId, Palette> = {
  // Serpiente verde clásica sobre negro, como el arcade original.
  clasico: {
    bg: "#000000",
    head: "#39ff14",
    body: "#00b140",
    grid: "rgba(255,255,255,0.05)",
    glow: 4,
  },
  // Neón saturado con glow fuerte y una paleta distinta (amarillo/cyan de la app).
  neon: {
    bg: "#05060a",
    head: "#f5ff00", // amarillo
    body: "#00f5ff", // cyan
    grid: "rgba(0,245,255,0.09)",
    glow: 14,
  },
  // CRT vintage: fósforo ámbar cálido con bloom suave.
  retro: {
    bg: "#080600",
    head: "#ffc04a", // ámbar brillante
    body: "#c9922b", // ámbar/bronce más apagado pero claramente visible
    grid: "rgba(255,176,0,0.06)",
    glow: 6,
  },
};

const COLS = 40;
const ROWS = 30;
const CELL = 20;
const W = COLS * CELL;
const H = ROWS * CELL;

const CONTROL_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

type Direction = "up" | "down" | "left" | "right";

interface Cell {
  col: number;
  row: number;
}

interface Fruit {
  cell: Cell;
  kind: FruitKind;
}

interface GameData {
  snake: Cell[]; // snake[0] = cabeza
  direction: Direction;
  pendingDirection: Direction | null;
  fruit: Fruit;
  score: number;
  level: number;
  fruitsEaten: number;
  moveInterval: number;
  moveAccum: number;
  state: "playing" | "gameover";
}

const DIRECTION_DELTAS: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function cellKey(c: Cell) {
  return `${c.col},${c.row}`;
}

function randomFruitKind(): FruitKind {
  return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
}

function randomFreeCell(snake: Cell[]): Cell {
  const occupied = new Set(snake.map(cellKey));
  for (let attempt = 0; attempt < 200; attempt++) {
    const cell: Cell = {
      col: Math.floor(Math.random() * COLS),
      row: Math.floor(Math.random() * ROWS),
    };
    if (!occupied.has(cellKey(cell))) return cell;
  }
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      if (!occupied.has(cellKey({ col, row }))) return { col, row };
  return { col: 0, row: 0 };
}

function spawnFruit(data: GameData) {
  data.fruit = {
    cell: randomFreeCell(data.snake),
    kind: randomFruitKind(),
  };
}

function createInitialGameData(): GameData {
  const startCol = Math.floor(COLS / 2);
  const startRow = Math.floor(ROWS / 2);
  const snake: Cell[] = [
    { col: startCol, row: startRow },
    { col: startCol - 1, row: startRow },
    { col: startCol - 2, row: startRow },
  ];
  const data: GameData = {
    snake,
    direction: "right",
    pendingDirection: null,
    fruit: { cell: { col: 0, row: 0 }, kind: "apple" },
    score: 0,
    level: 1,
    fruitsEaten: 0,
    moveInterval: 150,
    moveAccum: 0,
    state: "playing",
  };
  spawnFruit(data);
  return data;
}

function stepGrid(data: GameData) {
  if (data.state !== "playing") return;

  if (
    data.pendingDirection &&
    data.pendingDirection !== OPPOSITE[data.direction]
  ) {
    data.direction = data.pendingDirection;
  }
  data.pendingDirection = null;

  const delta = DIRECTION_DELTAS[data.direction];
  const head = data.snake[0];
  const newHead: Cell = { col: head.col + delta.dc, row: head.row + delta.dr };

  if (
    newHead.col < 0 ||
    newHead.col >= COLS ||
    newHead.row < 0 ||
    newHead.row >= ROWS
  ) {
    data.state = "gameover";
    return;
  }

  const willGrow =
    newHead.col === data.fruit.cell.col && newHead.row === data.fruit.cell.row;
  const bodyToCheck = willGrow ? data.snake : data.snake.slice(0, -1);
  if (bodyToCheck.some((c) => c.col === newHead.col && c.row === newHead.row)) {
    data.state = "gameover";
    return;
  }

  data.snake.unshift(newHead);
  if (willGrow) {
    data.score += 10;
    data.fruitsEaten += 1;
    data.level = Math.floor(data.fruitsEaten / 5) + 1;
    data.moveInterval = Math.max(60, 150 - (data.level - 1) * 10);
    spawnFruit(data);
  } else {
    data.snake.pop();
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, pal: Palette) {
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, H);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(W, r * CELL);
    ctx.stroke();
  }
}

function drawSnake(ctx: CanvasRenderingContext2D, snake: Cell[], pal: Palette) {
  snake.forEach((segment, i) => {
    const isHead = i === 0;
    const color = isHead ? pal.head : pal.body;
    const x = segment.col * CELL;
    const y = segment.row * CELL;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = isHead ? pal.glow : pal.glow * 0.6;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.restore();
  });
}

const FRUIT_DRAW_SCALE_BOOST = 1.6;

function drawFruit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fruit: Fruit,
) {
  const sprite = FRUIT_SPRITES[fruit.kind];
  const scale =
    Math.min(CELL / sprite.w, CELL / sprite.h) * FRUIT_DRAW_SCALE_BOOST;
  const dw = sprite.w * scale;
  const dh = sprite.h * scale;
  const dx = fruit.cell.col * CELL + (CELL - dw) / 2;
  const dy = fruit.cell.row * CELL + (CELL - dh) / 2;
  ctx.drawImage(img, sprite.x, sprite.y, sprite.w, sprite.h, dx, dy, dw, dh);
}

function draw(
  ctx: CanvasRenderingContext2D,
  data: GameData,
  fruitImg: HTMLImageElement,
  pal: Palette,
) {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, pal);
  drawFruit(ctx, fruitImg, data.fruit);
  drawSnake(ctx, data.snake, pal);
}

export type SerpentinaGameProps = GameComponentProps;
export type SerpentinaGameHandle = GameComponentHandle;

interface ReportedState {
  score: number;
  level: number;
}

export const SerpentinaGame = forwardRef<
  SerpentinaGameHandle,
  SerpentinaGameProps
>(function SerpentinaGame(
  { paused, skin, onScoreChange, onLivesChange, onLevelChange, onGameOver },
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
  });
  const reportedRef = useRef<ReportedState>({ score: 0, level: 1 });

  pausedRef.current = paused;
  callbacksRef.current = {
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
  };

  const reset = useCallback(() => {
    dataRef.current = createInitialGameData();
    reportedRef.current = { score: 0, level: 1 };
    callbacksRef.current.onScoreChange(0);
    callbacksRef.current.onLevelChange(1);
    callbacksRef.current.onLivesChange(1);
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
    callbacksRef.current.onLivesChange(1);

    let cancelled = false;
    let rafId = 0;

    function handleKeyDown(e: KeyboardEvent) {
      if (!CONTROL_CODES.has(e.code)) return;
      e.preventDefault();
      if (pausedRef.current) return;
      const data = dataRef.current;
      if (data.state !== "playing") return;

      let newDir: Direction | null = null;
      switch (e.code) {
        case "ArrowUp":
          newDir = "up";
          break;
        case "ArrowDown":
          newDir = "down";
          break;
        case "ArrowLeft":
          newDir = "left";
          break;
        case "ArrowRight":
          newDir = "right";
          break;
      }
      if (newDir && newDir !== OPPOSITE[data.direction]) {
        data.pendingDirection = newDir;
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
      if (data.level !== reported.level) {
        reported.level = data.level;
        cb.onLevelChange(data.level);
      }
    }

    let lastTime: number | null = null;
    let wasGameOver = false;

    function loop(ts: number, fruitImg: HTMLImageElement) {
      const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
      lastTime = ts;

      const data = dataRef.current;
      if (!pausedRef.current && data.state === "playing") {
        data.moveAccum += dt;
        if (data.moveAccum >= data.moveInterval) {
          data.moveAccum -= data.moveInterval;
          stepGrid(data);
        }
      }

      draw(ctx!, data, fruitImg, SKIN_PALETTES[skinRef.current]);
      reportChanges();

      if (data.state === "gameover") {
        if (!wasGameOver) {
          wasGameOver = true;
          callbacksRef.current.onGameOver(data.score);
        }
      } else {
        wasGameOver = false;
      }

      rafId = requestAnimationFrame((t) => loop(t, fruitImg));
    }

    const fruitImg = new Image();
    fruitImg.onload = () => {
      if (cancelled) return;
      rafId = requestAnimationFrame((t) => loop(t, fruitImg));
    };
    fruitImg.onerror = () => {
      console.error("No se pudo cargar el atlas de frutas de Serpentina");
    };
    fruitImg.src = FRUIT_SPRITE_SOURCE;

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
