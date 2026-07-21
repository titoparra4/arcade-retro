// ===== app/data.ts — tipos compartidos de UI =====
// Los datos de juegos/puntuaciones viven en Supabase (lib/supabase/games.ts).

export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type Category = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export const CATS: ("TODOS" | Category)[] = [
  "TODOS",
  "ARCADE",
  "PUZZLE",
  "SHOOTER",
  "VERSUS",
];
