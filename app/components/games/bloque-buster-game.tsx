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

const W = 800;
const H = 600;

const PADDLE_SPEED = 400;
const PADDLE_W = 81;
const PADDLE_H = 14;
const PADDLE_Y = 560;
const BALL_W = 16;
const BALL_H = 16;

const BLOCK_COLS = 10;
const BLOCK_ROWS = 6;
const BLOCK_W = 64;
const BLOCK_H = 24;
const BLOCKS_ORIGIN_X = (W - BLOCK_COLS * BLOCK_W) / 2;
const BLOCKS_ORIGIN_Y = 80;

const BASE_BALL_VX = 200;
const BASE_BALL_VY = -300;

const CONTROL_CODES = new Set(["ArrowLeft", "ArrowRight"]);

// Colores lógicos de los bloques (heredados del spritesheet original). Ya no
// son sprites: cada skin los mapea a su propia paleta en SKIN_PALETTES.
type BlockColor =
  "red" | "yellow" | "cyan" | "magenta" | "hotpink" | "green" | "gray";

// ── Skins ───────────────────────────────────────────────────────────────────
// Cada paleta se diseña contra el fondo oscuro (--bg #0a0a0f). Ningún color
// clave puede fundirse con el fondo: todos tienen luminancia real sobre negro.
interface Palette {
  bg: string; // fondo del canvas del juego
  paddle: string; // relleno de la paleta (nave)
  ball: string; // relleno de la bola
  blocks: Record<BlockColor, string>; // color por tipo de bloque
  glow: number; // shadowBlur; 0 = sin glow (clásico), >0 = fósforo/neón
}

const SKIN_PALETTES: Record<SkinId, Palette> = {
  // Bloques sólidos y saturados sobre negro, como el arcade original.
  clasico: {
    bg: "#000000",
    paddle: "#d6d6d6",
    ball: "#ffffff",
    blocks: {
      red: "#ff5555",
      yellow: "#ffd93b",
      cyan: "#3bd6ff",
      magenta: "#c24bff",
      hotpink: "#ff5bb0",
      green: "#5bd94b",
      gray: "#b8b8b8",
    },
    glow: 0,
  },
  // Neón saturado con glow, apoyado en la paleta de la app (cyan/magenta/
  // amarillo/verde). Cada tipo de bloque tiene un tono brillante distinto.
  neon: {
    bg: "#05060a",
    paddle: "#00f5ff", // cyan
    ball: "#f5ff00", // amarillo, máximo contraste contra los bloques
    blocks: {
      red: "#ff2d55",
      yellow: "#f5ff00",
      cyan: "#00f5ff",
      magenta: "#ff3d9a", // subido en luminancia vs --magenta para no lavarse
      hotpink: "#ff7bd0",
      green: "#00ff88",
      gray: "#8be3ff",
    },
    glow: 12,
  },
  // CRT vintage: monitor de fósforo ámbar con acento verde y bloom suave.
  // Tonos cálidos y algo apagados, pero con luminancia real para distinguir filas.
  retro: {
    bg: "#080600",
    paddle: "#ffc04a", // ámbar brillante
    ball: "#ffe8a0", // ámbar pálido
    blocks: {
      red: "#ff7a2c", // naranja cálido
      yellow: "#ffcf5a", // ámbar
      cyan: "#a8c94a", // amarillo-verde
      magenta: "#d98f3a", // bronce
      hotpink: "#e8a94a", // ámbar claro
      green: "#7fbf3a", // fósforo verde
      gray: "#c0902e", // bronce oscuro
    },
    glow: 5,
  },
};

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const EXPLOSION_DURATION = 150; // ms

interface LevelBlock {
  col: number;
  row: number;
  color: BlockColor;
}

interface Level {
  speed: number;
  blocks: LevelBlock[];
}

// Portado tal cual desde references/started-games/04-arkanoid/levels.js
const LEVELS: Level[] = (() => {
  const rowColors1: BlockColor[] = [
    "red",
    "yellow",
    "cyan",
    "magenta",
    "hotpink",
    "green",
  ];
  const rowColors2: BlockColor[] = [
    "gray",
    "cyan",
    "hotpink",
    "yellow",
    "magenta",
    "green",
  ];
  const rowColors4: BlockColor[] = [
    "cyan",
    "magenta",
    "green",
    "yellow",
    "hotpink",
    "red",
  ];

  const l1: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      l1.push({ col, row, color: rowColors1[row] });

  const l2: LevelBlock[] = [];
  const pyStart = [4, 3, 2, 1, 0, 0];
  const pyEnd = [5, 6, 7, 8, 9, 9];
  for (let row = 0; row < 6; row++)
    for (let col = pyStart[row]; col <= pyEnd[row]; col++)
      l2.push({ col, row, color: rowColors2[row] });

  const l3: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      if ((col + row) % 2 === 0)
        l3.push({ col, row, color: row < 3 ? "yellow" : "magenta" });

  const gaps4 = [
    [2, 5, 8],
    [0, 4, 7, 9],
    [1, 3, 6],
    [2, 5, 8, 9],
    [0, 4, 7],
    [1, 3, 6, 9],
  ];
  const l4: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      if (!gaps4[row].includes(col))
        l4.push({ col, row, color: rowColors4[row] });

  const l5: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++) {
      const isFrame = col === 0 || col === 9 || row === 0 || row === 5;
      const isCross = col === 4 || row === 2;
      if (isFrame || isCross)
        l5.push({
          col,
          row,
          color: isCross && !isFrame ? "hotpink" : "cyan",
        });
    }

  return [
    { speed: 1.0, blocks: l1 },
    { speed: 1.1, blocks: l2 },
    { speed: 1.21, blocks: l3 },
    { speed: 1.33, blocks: l4 },
    { speed: 1.46, blocks: l5 },
  ];
})();

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  color: BlockColor;
  alive: boolean;
}

interface Explosion {
  x: number;
  y: number;
  w: number;
  h: number;
  color: BlockColor;
  elapsed: number; // ms, hasta EXPLOSION_DURATION
}

interface GameData {
  paddle: { x: number; y: number; w: number; h: number };
  ball: { x: number; y: number; w: number; h: number; vx: number; vy: number };
  blocks: Block[];
  explosions: Explosion[];
  lives: number;
  score: number;
  currentLevel: number; // 1..5
  state: "playing" | "gameover" | "win";
}

function resetBallOnPaddle(data: GameData, speed: number) {
  data.ball.x = data.paddle.x + (data.paddle.w - data.ball.w) / 2;
  data.ball.y = data.paddle.y - data.ball.h;
  data.ball.vx = BASE_BALL_VX * speed;
  data.ball.vy = BASE_BALL_VY * speed;
}

function loadLevel(data: GameData, n: number) {
  data.currentLevel = n;
  const level = LEVELS[n - 1];
  data.blocks = level.blocks.map((b) => ({
    x: BLOCKS_ORIGIN_X + b.col * BLOCK_W,
    y: BLOCKS_ORIGIN_Y + b.row * BLOCK_H,
    w: BLOCK_W,
    h: BLOCK_H,
    color: b.color,
    alive: true,
  }));
  data.explosions = [];
  resetBallOnPaddle(data, level.speed);
}

function createInitialGameData(): GameData {
  const data: GameData = {
    paddle: { x: (W - PADDLE_W) / 2, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H },
    ball: { x: 0, y: 0, w: BALL_W, h: BALL_H, vx: 0, vy: 0 },
    blocks: [],
    explosions: [],
    lives: 3,
    score: 0,
    currentLevel: 1,
    state: "playing",
  };
  loadLevel(data, 1);
  return data;
}

function collideAABB(ball: GameData["ball"], block: Block) {
  return (
    ball.x < block.x + block.w &&
    ball.x + ball.w > block.x &&
    ball.y < block.y + block.h &&
    ball.y + ball.h > block.y
  );
}

function update(data: GameData, dt: number, keys: Record<string, boolean>) {
  if (data.state !== "playing") return;

  if (keys.ArrowLeft)
    data.paddle.x = Math.max(0, data.paddle.x - PADDLE_SPEED * dt);
  if (keys.ArrowRight)
    data.paddle.x = Math.min(
      W - data.paddle.w,
      data.paddle.x + PADDLE_SPEED * dt,
    );

  data.ball.x += data.ball.vx * dt;
  data.ball.y += data.ball.vy * dt;

  if (data.ball.x <= 0) {
    data.ball.x = 0;
    data.ball.vx = Math.abs(data.ball.vx);
  }
  if (data.ball.x + data.ball.w >= W) {
    data.ball.x = W - data.ball.w;
    data.ball.vx = -Math.abs(data.ball.vx);
  }
  if (data.ball.y <= 0) {
    data.ball.y = 0;
    data.ball.vy = Math.abs(data.ball.vy);
  }

  if (
    data.ball.vy > 0 &&
    data.ball.x + data.ball.w > data.paddle.x &&
    data.ball.x < data.paddle.x + data.paddle.w &&
    data.ball.y + data.ball.h >= data.paddle.y &&
    data.ball.y + data.ball.h <= data.paddle.y + data.paddle.h + 8
  ) {
    data.ball.y = data.paddle.y - data.ball.h;
    data.ball.vy = -Math.abs(data.ball.vy);
  }

  for (const block of data.blocks) {
    if (!block.alive) continue;
    if (collideAABB(data.ball, block)) {
      block.alive = false;
      data.explosions.push({
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h,
        color: block.color,
        elapsed: 0,
      });
      data.score += 10;
      data.ball.vy = -data.ball.vy;
      if (data.blocks.every((b) => !b.alive)) {
        if (data.currentLevel < 5) loadLevel(data, data.currentLevel + 1);
        else data.state = "win";
      }
      break; // un bloque por frame
    }
  }

  for (const exp of data.explosions) exp.elapsed += dt * 1000;
  data.explosions = data.explosions.filter(
    (exp) => exp.elapsed < EXPLOSION_DURATION,
  );

  if (data.ball.y > H) {
    data.lives--;
    if (data.lives <= 0) {
      data.lives = 0;
      data.state = "gameover";
    } else {
      resetBallOnPaddle(data, LEVELS[data.currentLevel - 1].speed);
    }
  }
}

function drawBlockRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  glow: number,
) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
  // Realce superior y sombra inferior para dar volumen (sin glow, para no
  // difuminar los bordes del bloque).
  ctx.fillStyle = "rgba(255,255,255,0.20)";
  ctx.fillRect(x + 1, y + 1, w - 2, 4);
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(x + 1, y + h - 4, w - 2, 3);
}

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  exp: Explosion,
  color: string,
  glow: number,
) {
  const p = exp.elapsed / EXPLOSION_DURATION; // 0..1
  const alpha = 1 - p;
  const grow = p * 10;
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = hexToRgba(color, 0.35);
  ctx.fillRect(exp.x - grow, exp.y - grow, exp.w + grow * 2, exp.h + grow * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    exp.x - grow,
    exp.y - grow,
    exp.w + grow * 2,
    exp.h + grow * 2,
  );
  ctx.restore();
}

function drawPaddle(
  ctx: CanvasRenderingContext2D,
  paddle: GameData["paddle"],
  color: string,
  glow: number,
) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 6);
  ctx.fill();
  ctx.restore();
  // Brillo superior
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.roundRect(paddle.x + 4, paddle.y + 2, paddle.w - 8, 4, 3);
  ctx.fill();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: GameData["ball"],
  color: string,
  glow: number,
) {
  const cx = ball.x + ball.w / 2;
  const cy = ball.y + ball.h / 2;
  const r = ball.w / 2;
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, data: GameData, pal: Palette) {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);

  for (const block of data.blocks) {
    if (block.alive)
      drawBlockRect(
        ctx,
        block.x,
        block.y,
        block.w,
        block.h,
        pal.blocks[block.color],
        pal.glow,
      );
  }

  for (const exp of data.explosions)
    drawExplosion(ctx, exp, pal.blocks[exp.color], pal.glow);

  drawPaddle(ctx, data.paddle, pal.paddle, pal.glow);
  drawBall(ctx, data.ball, pal.ball, pal.glow);
}

export type BloqueBusterGameProps = GameComponentProps;
export type BloqueBusterGameHandle = GameComponentHandle;

interface ReportedState {
  score: number;
  lives: number;
  level: number;
}

export const BloqueBusterGame = forwardRef<
  BloqueBusterGameHandle,
  BloqueBusterGameProps
>(function BloqueBusterGame(
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
  const reportedRef = useRef<ReportedState>({ score: 0, lives: 3, level: 1 });

  pausedRef.current = paused;
  callbacksRef.current = {
    onScoreChange,
    onLivesChange,
    onLevelChange,
    onGameOver,
  };

  const reset = useCallback(() => {
    dataRef.current = createInitialGameData();
    reportedRef.current = { score: 0, lives: 3, level: 1 };
    callbacksRef.current.onScoreChange(0);
    callbacksRef.current.onLivesChange(3);
    callbacksRef.current.onLevelChange(1);
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

    let rafId = 0;
    const keys: Record<string, boolean> = {};

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const scaleX = W / rect.width;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const data = dataRef.current;
      data.paddle.x = Math.max(
        0,
        Math.min(W - data.paddle.w, mouseX - data.paddle.w / 2),
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (CONTROL_CODES.has(e.code)) e.preventDefault();
      keys[e.code] = true;
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (CONTROL_CODES.has(e.code)) e.preventDefault();
      keys[e.code] = false;
    }

    canvas.addEventListener("mousemove", handleMouseMove);
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
      if (data.currentLevel !== reported.level) {
        reported.level = data.currentLevel;
        cb.onLevelChange(data.currentLevel);
      }
    }

    let lastTime: number | null = null;
    let wasOver = false;

    function loop(ts: number) {
      const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      const data = dataRef.current;
      if (!pausedRef.current) update(data, dt, keys);
      draw(ctx!, data, SKIN_PALETTES[skinRef.current]);
      reportChanges();

      if (data.state === "gameover" || data.state === "win") {
        if (!wasOver) {
          wasOver = true;
          callbacksRef.current.onGameOver(data.score, data.state === "win");
        }
      } else {
        wasOver = false;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousemove", handleMouseMove);
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
