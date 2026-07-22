"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GameComponentHandle, GameComponentProps } from "./registry";

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

type BlockColor =
  "red" | "yellow" | "cyan" | "magenta" | "hotpink" | "green" | "gray";

interface SpriteRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// Coordenadas del spritesheet, portadas tal cual desde
// references/started-games/04-arkanoid/assets/spritesheet.js
const SPRITES: {
  paddle: SpriteRect;
  ball: SpriteRect;
  blocks: Record<BlockColor, SpriteRect>;
} = {
  paddle: { sx: 32, sy: 112, sw: 162, sh: 14 },
  ball: { sx: 32, sy: 32, sw: 16, sh: 16 },
  blocks: {
    gray: { sx: 32, sy: 288, sw: 32, sh: 16 },
    red: { sx: 32, sy: 176, sw: 32, sh: 16 },
    yellow: { sx: 32, sy: 240, sw: 32, sh: 16 },
    cyan: { sx: 32, sy: 192, sw: 32, sh: 16 },
    magenta: { sx: 32, sy: 224, sw: 32, sh: 16 },
    hotpink: { sx: 32, sy: 256, sw: 32, sh: 16 },
    green: { sx: 32, sy: 208, sw: 32, sh: 16 },
  },
};

const EXPLOSION_FRAMES: Record<BlockColor, SpriteRect[]> = {
  red: [
    { sx: 256, sy: 176, sw: 32, sh: 16 },
    { sx: 288, sy: 176, sw: 32, sh: 16 },
    { sx: 320, sy: 176, sw: 32, sh: 16 },
    { sx: 352, sy: 176, sw: 32, sh: 16 },
  ],
  cyan: [
    { sx: 256, sy: 192, sw: 32, sh: 16 },
    { sx: 288, sy: 192, sw: 32, sh: 16 },
    { sx: 320, sy: 192, sw: 32, sh: 16 },
    { sx: 352, sy: 192, sw: 32, sh: 16 },
  ],
  green: [
    { sx: 256, sy: 208, sw: 32, sh: 16 },
    { sx: 288, sy: 208, sw: 32, sh: 16 },
    { sx: 320, sy: 208, sw: 32, sh: 16 },
    { sx: 352, sy: 208, sw: 32, sh: 16 },
  ],
  magenta: [
    { sx: 256, sy: 224, sw: 32, sh: 16 },
    { sx: 288, sy: 224, sw: 32, sh: 16 },
    { sx: 320, sy: 224, sw: 32, sh: 16 },
    { sx: 352, sy: 224, sw: 32, sh: 16 },
  ],
  yellow: [
    { sx: 256, sy: 240, sw: 32, sh: 16 },
    { sx: 288, sy: 240, sw: 32, sh: 16 },
    { sx: 320, sy: 240, sw: 32, sh: 16 },
    { sx: 352, sy: 240, sw: 32, sh: 16 },
  ],
  hotpink: [
    { sx: 256, sy: 256, sw: 32, sh: 16 },
    { sx: 288, sy: 256, sw: 32, sh: 16 },
    { sx: 320, sy: 256, sw: 32, sh: 16 },
    { sx: 352, sy: 256, sw: 32, sh: 16 },
  ],
  gray: [
    { sx: 256, sy: 176, sw: 32, sh: 16 },
    { sx: 288, sy: 176, sw: 32, sh: 16 },
    { sx: 320, sy: 176, sw: 32, sh: 16 },
    { sx: 352, sy: 176, sw: 32, sh: 16 },
  ],
};

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

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sprite: SpriteRect,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.drawImage(img, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x, y, w, h);
}

function draw(
  ctx: CanvasRenderingContext2D,
  data: GameData,
  img: HTMLImageElement,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  for (const block of data.blocks) {
    if (block.alive)
      drawSprite(
        ctx,
        img,
        SPRITES.blocks[block.color],
        block.x,
        block.y,
        block.w,
        block.h,
      );
  }

  for (const exp of data.explosions) {
    const frameIndex = Math.min(
      Math.floor((exp.elapsed / EXPLOSION_DURATION) * 4),
      3,
    );
    drawSprite(
      ctx,
      img,
      EXPLOSION_FRAMES[exp.color][frameIndex],
      exp.x,
      exp.y,
      exp.w,
      exp.h,
    );
  }

  drawSprite(
    ctx,
    img,
    SPRITES.paddle,
    data.paddle.x,
    data.paddle.y,
    data.paddle.w,
    data.paddle.h,
  );
  drawSprite(
    ctx,
    img,
    SPRITES.ball,
    data.ball.x,
    data.ball.y,
    data.ball.w,
    data.ball.h,
  );
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

    let cancelled = false;
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

    function loop(ts: number, img: HTMLImageElement) {
      const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      const data = dataRef.current;
      if (!pausedRef.current) update(data, dt, keys);
      draw(ctx!, data, img);
      reportChanges();

      if (data.state === "gameover" || data.state === "win") {
        if (!wasOver) {
          wasOver = true;
          callbacksRef.current.onGameOver(data.score, data.state === "win");
        }
      } else {
        wasOver = false;
      }

      rafId = requestAnimationFrame((t) => loop(t, img));
    }

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      rafId = requestAnimationFrame((t) => loop(t, img));
    };
    img.onerror = () => {
      console.error("No se pudo cargar el spritesheet de Bloque Buster");
    };
    img.src = "/spritesheet-breakout.png";

    return () => {
      cancelled = true;
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
