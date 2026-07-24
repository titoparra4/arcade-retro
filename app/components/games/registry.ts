import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { AsteroidsGame } from "./asteroids-game";
import { BloqueBusterGame } from "./bloque-buster-game";
import { CaidaGame } from "./caida-game";
import { SerpentinaGame } from "./serpentina-game";

// Sistema de skins compartido: fuente de verdad del tipo y de las opciones del
// selector. Cada juego que lo adopta define su propio SKIN_PALETTES y lee la
// prop `skin`. Todos los skins se diseñan contra el fondo oscuro (--bg #0a0a0f).
export type SkinId = "clasico" | "neon" | "retro";

export const SKINS: { value: SkinId; label: string }[] = [
  { value: "clasico", label: "Clásico" },
  { value: "neon", label: "Neón" },
  { value: "retro", label: "Retro" },
];

// Contrato compartido: todo componente de juego real se registra aquí para que
// game-player.tsx lo monte sin necesitar un if/else dedicado por juego.
export interface GameComponentProps {
  paused: boolean; // el padre controla la pausa vía prop
  skin: SkinId; // skin activo (default "clasico"); el player es dueño del estado
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onLevelChange: (level: number) => void;
  onGameOver: (finalScore: number, won?: boolean) => void; // won: true solo al completar el último nivel
  onExtraStatChange: (value: number) => void; // stat extra opcional en el HUD (p. ej. segundos de un power-up); 0 = inactivo
}

export interface GameComponentHandle {
  reset: () => void; // reinicia el juego real (usado por "JUGAR DE NUEVO")
  forceGameOver: () => void; // usado por el botón FIN ("abandonar partida")
}

export interface GameRegistryEntry {
  Component: ForwardRefExoticComponent<
    GameComponentProps & RefAttributes<GameComponentHandle>
  >;
  extraStatLabel?: string; // etiqueta del stat extra en el HUD, solo si el juego lo usa
  supportsSkins?: boolean; // true si el juego consume la prop `skin` del sistema compartido → el player muestra el selector
}

export const GAME_REGISTRY: Partial<Record<string, GameRegistryEntry>> = {
  rocas: {
    Component: AsteroidsGame,
    extraStatLabel: "Triple disparo",
    supportsSkins: true,
  },
  caida: { Component: CaidaGame },
  "bloque-buster": { Component: BloqueBusterGame, supportsSkins: true },
  serpentina: { Component: SerpentinaGame, supportsSkins: true },
};
