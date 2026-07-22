import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { AsteroidsGame } from "./asteroids-game";
import { BloqueBusterGame } from "./bloque-buster-game";
import { CaidaGame } from "./caida-game";
import { SerpentinaGame } from "./serpentina-game";

// Contrato compartido: todo componente de juego real se registra aquí para que
// game-player.tsx lo monte sin necesitar un if/else dedicado por juego.
export interface GameComponentProps {
  paused: boolean; // el padre controla la pausa vía prop
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
}

export const GAME_REGISTRY: Partial<Record<string, GameRegistryEntry>> = {
  rocas: { Component: AsteroidsGame, extraStatLabel: "Triple disparo" },
  caida: { Component: CaidaGame },
  "bloque-buster": { Component: BloqueBusterGame },
  serpentina: { Component: SerpentinaGame },
};
