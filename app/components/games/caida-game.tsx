"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { GameComponentHandle, GameComponentProps } from "./registry";

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const W = COLS * BLOCK;
const H = ROWS * BLOCK;

const CONTROL_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const COLORS: (string | null)[] = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#90caf9", // J - pale blue
  "#ffb74d", // L - orange
  "#9e9e9e", // N - tuerca (gris metálico)
];

const PIECES: (Cell[][] | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

interface Piece {
  type: Cell;
  shape: Cell[][];
  x: number;
  y: number;
}

interface GameData {
  board: Cell[][];
  current: Piece;
  next: Piece;
  score: number;
  lines: number;
  level: number;
  dropInterval: number;
  dropAccum: number;
  state: "playing" | "gameover";
}

function createBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0) as Cell[]);
}

function randomPiece(): Piece {
  const type = (Math.floor(Math.random() * 8) + 1) as Cell;
  const base = PIECES[type]!;
  const shape = base.map((row) => [...row]) as Cell[][];
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
  };
}

function collide(board: Cell[][], shape: Cell[][], ox: number, oy: number) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape: Cell[][]): Cell[][] {
  const rows = shape.length;
  const cols = shape[0].length;
  const result: Cell[][] = Array.from({ length: cols }, () =>
    new Array(rows).fill(0),
  );
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate(data: GameData) {
  const rotated = rotateCW(data.current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(data.board, rotated, data.current.x + kick, data.current.y)) {
      data.current.shape = rotated;
      data.current.x += kick;
      return;
    }
  }
}

function merge(data: GameData) {
  const { board, current } = data;
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines(data: GameData) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (data.board[r].every((v) => v !== 0)) {
      data.board.splice(r, 1);
      data.board.unshift(new Array(COLS).fill(0) as Cell[]);
      cleared++;
      r++;
    }
  }
  if (cleared) {
    data.lines += cleared;
    data.score += (LINE_SCORES[cleared] || 0) * data.level;
    data.level = Math.floor(data.lines / 10) + 1;
    data.dropInterval = Math.max(100, 1000 - (data.level - 1) * 90);
  }
}

function ghostY(data: GameData) {
  let gy = data.current.y;
  while (!collide(data.board, data.current.shape, data.current.x, gy + 1)) gy++;
  return gy;
}

function spawn(data: GameData) {
  data.current = data.next;
  data.next = randomPiece();
  if (collide(data.board, data.current.shape, data.current.x, data.current.y)) {
    data.state = "gameover";
  }
}

function lockPiece(data: GameData) {
  merge(data);
  clearLines(data);
  spawn(data);
}

function hardDrop(data: GameData) {
  const gy = ghostY(data);
  data.score += (gy - data.current.y) * 2;
  data.current.y = gy;
  lockPiece(data);
}

function softDrop(data: GameData) {
  if (
    !collide(data.board, data.current.shape, data.current.x, data.current.y + 1)
  ) {
    data.current.y++;
    data.score += 1;
  } else {
    lockPiece(data);
  }
}

function createInitialGameData(): GameData {
  return {
    board: createBoard(),
    current: randomPiece(),
    next: randomPiece(),
    score: 0,
    lines: 0,
    level: 1,
    dropInterval: 1000,
    dropAccum: 0,
    state: "playing",
  };
}

function drawBlockAtPixel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  colorIndex: Cell,
  size: number,
  alpha = 1,
) {
  if (!colorIndex) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS[colorIndex]!;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(px + 1, py + 1, size - 2, 4);
  ctx.globalAlpha = 1;
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colorIndex: Cell,
  size: number,
  alpha = 1,
) {
  drawBlockAtPixel(ctx, x * size, y * size, colorIndex, size, alpha);
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

const NEXT_BOX_W = 100;
const NEXT_BOX_H = 100;
const NEXT_BOX_MARGIN = 10;
const NEXT_BLOCK = 18;

function drawNextPreview(ctx: CanvasRenderingContext2D, next: Piece) {
  const boxX = W - NEXT_BOX_W - NEXT_BOX_MARGIN;
  const boxY = NEXT_BOX_MARGIN;

  ctx.fillStyle = "rgba(10,10,20,0.75)";
  ctx.fillRect(boxX, boxY, NEXT_BOX_W, NEXT_BOX_H);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, NEXT_BOX_W - 1, NEXT_BOX_H - 1);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "9px monospace";
  ctx.textBaseline = "top";
  ctx.fillText("SIG", boxX + 6, boxY + 5);

  const { shape } = next;
  const offX =
    boxX + Math.floor((NEXT_BOX_W - shape[0].length * NEXT_BLOCK) / 2);
  const offY =
    boxY + Math.floor((NEXT_BOX_H - shape.length * NEXT_BLOCK) / 2) + 6;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlockAtPixel(
        ctx,
        offX + c * NEXT_BLOCK,
        offY + r * NEXT_BLOCK,
        shape[r][c],
        NEXT_BLOCK,
      );
}

function draw(ctx: CanvasRenderingContext2D, data: GameData) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  drawGrid(ctx);

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, data.board[r][c], BLOCK);

  const gy = ghostY(data);
  for (let r = 0; r < data.current.shape.length; r++)
    for (let c = 0; c < data.current.shape[r].length; c++)
      if (data.current.shape[r][c])
        drawBlock(
          ctx,
          data.current.x + c,
          gy + r,
          data.current.shape[r][c],
          BLOCK,
          0.2,
        );

  for (let r = 0; r < data.current.shape.length; r++)
    for (let c = 0; c < data.current.shape[r].length; c++)
      drawBlock(
        ctx,
        data.current.x + c,
        data.current.y + r,
        data.current.shape[r][c],
        BLOCK,
      );

  drawNextPreview(ctx, data.next);
}

export type CaidaGameProps = GameComponentProps;
export type CaidaGameHandle = GameComponentHandle;

interface ReportedState {
  score: number;
  level: number;
}

export const CaidaGame = forwardRef<CaidaGameHandle, CaidaGameProps>(
  function CaidaGame(
    {
      paused,
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
    const callbacksRef = useRef({
      onScoreChange,
      onLivesChange,
      onLevelChange,
      onGameOver,
      onExtraStatChange,
    });
    const reportedRef = useRef<ReportedState>({ score: 0, level: 1 });

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
      reportedRef.current = { score: 0, level: 1 };
      callbacksRef.current.onScoreChange(0);
      callbacksRef.current.onLevelChange(1);
      callbacksRef.current.onLivesChange(1);
    }, []);

    const forceGameOver = useCallback(() => {
      const data = dataRef.current;
      if (data.state === "gameover") return;
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

      function handleKeyDown(e: KeyboardEvent) {
        if (CONTROL_CODES.has(e.code)) e.preventDefault();
        if (pausedRef.current) return;
        const data = dataRef.current;
        if (data.state === "gameover") return;

        switch (e.code) {
          case "ArrowLeft":
            if (
              !collide(
                data.board,
                data.current.shape,
                data.current.x - 1,
                data.current.y,
              )
            )
              data.current.x--;
            break;
          case "ArrowRight":
            if (
              !collide(
                data.board,
                data.current.shape,
                data.current.x + 1,
                data.current.y,
              )
            )
              data.current.x++;
            break;
          case "ArrowDown":
            softDrop(data);
            break;
          case "ArrowUp":
          case "KeyX":
            tryRotate(data);
            break;
          case "Space":
            hardDrop(data);
            break;
        }
      }

      window.addEventListener("keydown", handleKeyDown);

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
      let rafId = 0;
      let wasGameOver = false;

      function loop(ts: number) {
        const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 50);
        lastTime = ts;

        const data = dataRef.current;
        if (!pausedRef.current && data.state === "playing") {
          data.dropAccum += dt;
          if (data.dropAccum >= data.dropInterval) {
            data.dropAccum = 0;
            if (
              !collide(
                data.board,
                data.current.shape,
                data.current.x,
                data.current.y + 1,
              )
            ) {
              data.current.y++;
            } else {
              lockPiece(data);
            }
          }
        }

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
  },
);
