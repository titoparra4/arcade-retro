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

export type RanariaGameProps = GameComponentProps;
export type RanariaGameHandle = GameComponentHandle;

export const RanariaGame = forwardRef<RanariaGameHandle, RanariaGameProps>(
  function RanariaGame(
    { paused, onScoreChange, onLivesChange, onLevelChange, onGameOver },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

    const reset = useCallback(() => {
      // Implementado en el paso 6 (gestión de ronda/partida).
    }, []);

    const forceGameOver = useCallback(() => {
      // Implementado en el paso 7 (gestión de muerte).
    }, []);

    useImperativeHandle(ref, () => ({ reset, forceGameOver }), [
      reset,
      forceGameOver,
    ]);

    useEffect(() => {
      // Game loop: pasos 3–7.
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
