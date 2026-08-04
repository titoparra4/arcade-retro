import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { AsteroidsGame } from "./asteroids-game";
import { BloqueBusterGame } from "./bloque-buster-game";
import { CaidaGame } from "./caida-game";
import { ExcavadorGame } from "./excavador-game";
import { RanariaGame } from "./ranaria-game";
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

// Controles táctiles: cada botón on-screen se traduce a KeyboardEvent sintéticos
// sobre `window`. Los 4 juegos ya escuchan window keydown/keyup con e.code, así
// que reciben el input sin cambio alguno. El `mode` define la traducción:
// - "hold":   keydown al tocar, keyup al soltar. Para juegos que sondean
//             keys[code] cada frame (rocas: giro/empuje; bloque-buster: pala).
// - "tap":    keydown + keyup inmediato, una acción por toque. Para juegos que
//             actúan en el evento keydown (serpentina: dirección; caida: rotar/soltar).
// - "repeat": como "tap" pero mientras el dedo siga presionado re-emite keydown
//             a intervalo fijo (auto-repetición). Para caida: mover izq/der y bajar.
export type TouchButtonMode = "hold" | "tap" | "repeat";

export interface TouchButton {
  code: string; // e.code sintetizado, p. ej. "ArrowLeft", "Space"
  label: string; // ícono/etiqueta corta mostrada en el botón, p. ej. "◄", "▲", "FUEGO"
  mode: TouchButtonMode;
  group: "pad" | "action"; // "pad" = esquina inf. izq (mover); "action" = esquina inf. der
}

export interface GameRegistryEntry {
  Component: ForwardRefExoticComponent<
    GameComponentProps & RefAttributes<GameComponentHandle>
  >;
  extraStatLabel?: string; // etiqueta del stat extra en el HUD, solo si el juego lo usa
  supportsSkins?: boolean; // true si el juego consume la prop `skin` del sistema compartido → el player muestra el selector
  touchControls?: TouchButton[]; // si está definido, el player monta <TouchControls>
}

export const GAME_REGISTRY: Partial<Record<string, GameRegistryEntry>> = {
  rocas: {
    Component: AsteroidsGame,
    extraStatLabel: "Triple disparo",
    supportsSkins: true,
    touchControls: [
      { code: "ArrowLeft", label: "◄", mode: "hold", group: "pad" },
      { code: "ArrowRight", label: "►", mode: "hold", group: "pad" },
      { code: "ArrowUp", label: "▲ EMPUJE", mode: "hold", group: "action" },
      { code: "Space", label: "● FUEGO", mode: "tap", group: "action" },
    ],
  },
  caida: {
    Component: CaidaGame,
    touchControls: [
      { code: "ArrowLeft", label: "◄", mode: "repeat", group: "pad" },
      { code: "ArrowRight", label: "►", mode: "repeat", group: "pad" },
      { code: "ArrowDown", label: "▼", mode: "repeat", group: "pad" },
      { code: "ArrowUp", label: "↻ ROTAR", mode: "tap", group: "action" },
      { code: "Space", label: "⤓ SOLTAR", mode: "tap", group: "action" },
    ],
  },
  "bloque-buster": {
    Component: BloqueBusterGame,
    supportsSkins: true,
    touchControls: [
      { code: "ArrowLeft", label: "◄", mode: "hold", group: "pad" },
      { code: "ArrowRight", label: "►", mode: "hold", group: "pad" },
    ],
  },
  ranaria: {
    Component: RanariaGame,
    extraStatLabel: "Tiempo",
    supportsSkins: true,
    // Frogger salta una celda por pulsación: handleKeyDown guarda la dirección en
    // `pendingDir` y el loop la consume en el frame siguiente. No sondea teclas por
    // frame → "tap". No se usa "repeat" a propósito: la animación de salto dura
    // 120 ms, justo el intervalo de auto-repetición, así que mantener el dedo
    // encadenaría saltos y cruzaría la carretera sin poder frenar en los huecos.
    touchControls: [
      { code: "ArrowUp", label: "▲", mode: "tap", group: "pad" },
      { code: "ArrowDown", label: "▼", mode: "tap", group: "pad" },
      { code: "ArrowLeft", label: "◄", mode: "tap", group: "pad" },
      { code: "ArrowRight", label: "►", mode: "tap", group: "pad" },
    ],
  },
  // Sin extraStatLabel: la SPEC excavador-01-clasico reserva el slot de stat
  // extra para el aviso de fuego de Fygar, que va en excavador-02-modo-fygar.
  excavador: {
    Component: ExcavadorGame,
  },
  serpentina: {
    Component: SerpentinaGame,
    supportsSkins: true,
    touchControls: [
      { code: "ArrowUp", label: "▲", mode: "tap", group: "pad" },
      { code: "ArrowDown", label: "▼", mode: "tap", group: "pad" },
      { code: "ArrowLeft", label: "◄", mode: "tap", group: "pad" },
      { code: "ArrowRight", label: "►", mode: "tap", group: "pad" },
    ],
  },
};
