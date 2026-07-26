"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
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

type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const COLORS: (string | null)[] = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#90caf9", // J - pale blue
  "#ffb74d", // L - orange
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
  const type = (Math.floor(Math.random() * 7) + 1) as Cell;
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

type SkinStyle = "outline" | "solid";

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawBlockAtPixel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  colorIndex: Cell,
  size: number,
  style: SkinStyle,
  alpha = 1,
) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex]!;
  if (style === "outline") {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = hexToRgba(color, 0.18);
    ctx.fillRect(px + 3, py + 3, size - 6, size - 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.strokeRect(px + 3, py + 3, size - 6, size - 6);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(px + 1, py + 1, size - 2, 4);
  ctx.globalAlpha = 1;
}

type Skin = "neon" | "clasico";

const SKIN_STYLES: Record<Skin, SkinStyle> = {
  neon: "outline",
  clasico: "solid",
};

const SKIN_OPTIONS: { value: Skin; label: string }[] = [
  { value: "neon", label: "Neón" },
  { value: "clasico", label: "Clásico" },
];

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

const NEXT_CANVAS_SIZE = 130;
const NEXT_BLOCK = 26;

function drawNextCanvas(
  ctx: CanvasRenderingContext2D,
  next: Piece,
  style: SkinStyle,
) {
  ctx.clearRect(0, 0, NEXT_CANVAS_SIZE, NEXT_CANVAS_SIZE);
  const { shape } = next;
  const offX = Math.floor(
    (NEXT_CANVAS_SIZE - shape[0].length * NEXT_BLOCK) / 2,
  );
  const offY = Math.floor((NEXT_CANVAS_SIZE - shape.length * NEXT_BLOCK) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlockAtPixel(
        ctx,
        offX + c * NEXT_BLOCK,
        offY + r * NEXT_BLOCK,
        shape[r][c],
        NEXT_BLOCK,
        style,
      );
}

// ── Caché de rasterizado ────────────────────────────────────────────────────
// Dos costes que el tablero pagaba en cada frame y no dependían del estado:
//   1. El fondo (negro + las 28 líneas de la rejilla) nunca cambia → se pinta
//      una vez en un canvas offscreen y el frame solo lo estampa.
//   2. Con el skin "neon" cada bloque hacía save() + shadowBlur + restore(); con
//      el tablero cargado eso son >100 shadowBlur por frame. El glow se hornea
//      una vez por color en un bitmap y el frame solo hace drawImage.
// La caché recuerda con qué skin se generó: si no coincide con el activo, se
// reconstruye entera (fondo y sprites) antes de dibujar nada.

// Un sprite por color de pieza, más su versión fantasma (la guía de caída, que
// se dibuja al 20 % de opacidad). El alpha va horneado en el bitmap: componer
// primero y atenuar después no da el mismo resultado que atenuar cada primitiva,
// y el "over" de canvas es asociativo, así que estampar el sprite ya atenuado sí
// es idéntico al dibujo original.
type SpriteKey = `block:${Cell}` | `ghost:${Cell}`;

const GHOST_ALPHA = 0.2;

// El bloom se sale de la caja del bloque, así que el bitmap lleva margen por los
// cuatro lados. El shadowBlur máximo de los skins es 8.
const SPRITE_PAD = 12;

// Rasteriza un bloque en su propio canvas. Dentro del sprite se dibuja en
// (SPRITE_PAD, SPRITE_PAD), así que drawBlockAtPixel se reutiliza tal cual, sin
// tocar su geometría: el aspecto queda idéntico por construcción.
function makeBlockSprite(
  colorIndex: Cell,
  style: SkinStyle,
  alpha: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = BLOCK + SPRITE_PAD * 2;
  canvas.height = BLOCK + SPRITE_PAD * 2;
  const ctx = canvas.getContext("2d");
  if (ctx)
    drawBlockAtPixel(
      ctx,
      SPRITE_PAD,
      SPRITE_PAD,
      colorIndex,
      BLOCK,
      style,
      alpha,
    );
  return canvas;
}

// El sprite se estampa desplazado por el padding, de forma que el bloque cae
// justo donde lo dibujaba el render antiguo. Si el margen se sale del canvas,
// drawImage recorta solo: el glow que se salía ya se perdía igual.
function stamp(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  col: number,
  row: number,
) {
  ctx.drawImage(sprite, col * BLOCK - SPRITE_PAD, row * BLOCK - SPRITE_PAD);
}

interface RenderCache {
  skin: Skin; // skin con el que se generó; si no coincide, se reconstruye
  bg: HTMLCanvasElement; // fondo estático completo, W × H
  sprites: Map<SpriteKey, HTMLCanvasElement>;
  nextKey: string; // pieza ya pintada en el canvas "Next"; "" = ninguna
}

function buildRenderCache(skin: Skin): RenderCache {
  const style = SKIN_STYLES[skin];

  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  // El fondo cubre el tablero entero, así que el offscreen tampoco necesita alfa.
  const bgCtx = bg.getContext("2d", { alpha: false });
  if (bgCtx) {
    bgCtx.fillStyle = "#000";
    bgCtx.fillRect(0, 0, W, H);
    drawGrid(bgCtx);
  }

  const sprites = new Map<SpriteKey, HTMLCanvasElement>();
  for (let i = 1; i < COLORS.length; i++) {
    const type = i as Cell;
    sprites.set(`block:${type}`, makeBlockSprite(type, style, 1));
    sprites.set(`ghost:${type}`, makeBlockSprite(type, style, GHOST_ALPHA));
  }

  return { skin, bg, sprites, nextKey: "" };
}

function draw(
  ctx: CanvasRenderingContext2D,
  data: GameData,
  cache: RenderCache,
) {
  ctx.drawImage(cache.bg, 0, 0);

  // Mismo orden que el render original —tablero, fantasma, pieza actual—, para
  // que los glows se solapen exactamente igual.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = data.board[r][c];
      if (cell) stamp(ctx, cache.sprites.get(`block:${cell}`)!, c, r);
    }

  const gy = ghostY(data);
  for (let r = 0; r < data.current.shape.length; r++)
    for (let c = 0; c < data.current.shape[r].length; c++) {
      const cell = data.current.shape[r][c];
      if (cell)
        stamp(
          ctx,
          cache.sprites.get(`ghost:${cell}`)!,
          data.current.x + c,
          gy + r,
        );
    }

  for (let r = 0; r < data.current.shape.length; r++)
    for (let c = 0; c < data.current.shape[r].length; c++) {
      const cell = data.current.shape[r][c];
      if (cell)
        stamp(
          ctx,
          cache.sprites.get(`block:${cell}`)!,
          data.current.x + c,
          data.current.y + r,
        );
    }
}

// ── Medidor de FPS (herramienta de desarrollo) ──────────────────────────────
// Solo se instancia si la URL trae ?fps=1, leído una vez al montar. Buffer
// circular con la duración de los últimos 120 frames (≈2 s); de ahí salen el
// instantáneo, la mediana y el mínimo. Se dibuja dentro del canvas: un <div>
// superpuesto refrescándose 60 veces por segundo sería justo el coste que este
// trabajo ataca.
const FPS_WINDOW = 120;

interface FpsMeter {
  durations: number[]; // ms del frame, longitud fija FPS_WINDOW
  index: number;
  count: number; // frames acumulados, tope FPS_WINDOW
}

function createFpsMeter(): FpsMeter {
  return {
    durations: new Array<number>(FPS_WINDOW).fill(0),
    index: 0,
    count: 0,
  };
}

function pushFrameTime(meter: FpsMeter, ms: number) {
  if (ms <= 0) return;
  meter.durations[meter.index] = ms;
  meter.index = (meter.index + 1) % FPS_WINDOW;
  if (meter.count < FPS_WINDOW) meter.count += 1;
}

// Scratch reutilizado: ordenar la ventana sin asignar un array por frame.
const fpsScratch = new Float64Array(FPS_WINDOW);
const msToFps = (ms: number) => Math.round(1000 / ms);

function drawFpsMeter(ctx: CanvasRenderingContext2D, meter: FpsMeter) {
  if (meter.count === 0) return;
  for (let i = 0; i < meter.count; i++) fpsScratch[i] = meter.durations[i];
  const sorted = fpsScratch.subarray(0, meter.count);
  sorted.sort();
  // El frame más largo de la ventana son los FPS mínimos.
  const text = `${msToFps(
    meter.durations[(meter.index + FPS_WINDOW - 1) % FPS_WINDOW],
  )} fps · med ${msToFps(sorted[meter.count >> 1])} · mín ${msToFps(
    sorted[meter.count - 1],
  )}`;

  ctx.save();
  ctx.font = "700 12px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(4, H - 24, w + 12, 20);
  ctx.fillStyle = "#4dd0e1";
  ctx.fillText(text, 10, H - 14);
  ctx.restore();
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
    const nextCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const dataRef = useRef<GameData>(createInitialGameData());
    const pausedRef = useRef(paused);
    const [skin, setSkin] = useState<Skin>("neon");
    const skinRef = useRef<Skin>(skin);
    skinRef.current = skin;
    // Bitmaps pre-renderizados. Se construye en el primer frame (ya en cliente)
    // y se reemplaza entero en cuanto el skin deja de coincidir.
    const cacheRef = useRef<RenderCache | null>(null);
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
      // Sin capa alfa: el tablero repinta el 100 % de su canvas cada frame, así
      // que la transparencia solo añadiría trabajo de composición. El canvas de
      // "Next" sí la necesita: se ve el fondo de .tetris-next por detrás.
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      const nextCtx = nextCanvasRef.current?.getContext("2d") ?? null;

      canvas.focus();
      callbacksRef.current.onLivesChange(1);

      // Herramienta de desarrollo: se lee una sola vez al montar. Sin el query
      // param no se instancia nada y el juego no paga ningún coste.
      const fpsMeter =
        new URLSearchParams(window.location.search).get("fps") === "1"
          ? createFpsMeter()
          : null;

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
        const elapsed = lastTime === null ? 0 : ts - lastTime;
        // El motor recorta el paso a 50 ms para que un frame perdido no
        // acelere la caída; el medidor mide el frame real, sin recortar.
        const dt = Math.min(elapsed, 50);
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

        // En pausa se congela el dibujo: el canvas conserva el último frame y el
        // overlay "EN PAUSA" del player va encima. El primer frame tras reanudar
        // vuelve a pintarlo todo. El medidor solo cuenta frames que dibujan.
        if (!pausedRef.current) {
          if (fpsMeter) pushFrameTime(fpsMeter, elapsed);
          const activeSkin = skinRef.current;
          // Cambiar de skin en caliente invalida la caché entera: se regenera en
          // este mismo frame, antes de dibujar nada con el estilo nuevo.
          let cache = cacheRef.current;
          if (!cache || cache.skin !== activeSkin) {
            cache = buildRenderCache(activeSkin);
            cacheRef.current = cache;
          }
          draw(ctx!, data, cache);
          // La vista previa solo cambia al bloquear una pieza (o al cambiar de
          // skin): repintarla 60 veces por segundo era trabajo tirado.
          const nextKey = `${data.next.type}:${activeSkin}`;
          if (nextCtx && cache.nextKey !== nextKey) {
            cache.nextKey = nextKey;
            drawNextCanvas(nextCtx, data.next, SKIN_STYLES[activeSkin]);
          }
          if (fpsMeter) drawFpsMeter(ctx!, fpsMeter);
        }
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
      <div className="tetris-layout">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          tabIndex={0}
          className="tetris-board"
        />
        <div className="tetris-side">
          <div className="tetris-side-block tetris-side-block--next">
            <div className="tetris-label">Next</div>
            <div className="tetris-next">
              <canvas
                ref={nextCanvasRef}
                width={NEXT_CANVAS_SIZE}
                height={NEXT_CANVAS_SIZE}
              />
            </div>
          </div>

          <div className="tetris-side-block tetris-side-block--skin">
            <div className="tetris-label">Skin</div>
            <div className="tetris-select-wrap">
              <select
                className="tetris-select"
                value={skin}
                onChange={(e) => setSkin(e.target.value as Skin)}
              >
                {SKIN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="tetris-side-block tetris-side-block--controls">
            <div className="tetris-label">Controls</div>
            <div className="tetris-controls">
              <div className="tetris-control-row">
                <span className="tetris-key">←</span>
                <span className="tetris-key">→</span>
                <span>mover</span>
              </div>
              <div className="tetris-control-row">
                <span className="tetris-key">↑</span>
                <span>rotar</span>
              </div>
              <div className="tetris-control-row">
                <span className="tetris-key">↓</span>
                <span>bajar</span>
              </div>
              <div className="tetris-control-row">
                <span className="tetris-key tetris-key--wide">Space</span>
                <span>caída</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
