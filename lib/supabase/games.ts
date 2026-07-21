import type { Category, GameColor } from "@/app/data";
import { createClient } from "@/lib/supabase/server";

export interface GameRow {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Category;
  cover: string;
  color: GameColor;
}

export interface Game extends GameRow {
  best: number; // MAX(score) en scores para ese game_id; 0 si no hay partidas
  plays: number; // COUNT(*) en scores para ese game_id
}

export interface ScoreRow {
  rank: number;
  name: string; // player_name
  score: number;
  date: string; // created_at formateado "DD/MM/AAAA"
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function toScoreRows(
  rows: { player_name: string; score: number; created_at: string }[],
): ScoreRow[] {
  return rows.map((row, i) => ({
    rank: i + 1,
    name: row.player_name,
    score: row.score,
    date: formatDate(row.created_at),
  }));
}

export async function getGames(): Promise<Game[]> {
  const supabase = await createClient();

  const [
    { data: games, error: gamesError },
    { data: scores, error: scoresError },
  ] = await Promise.all([
    supabase.from("games").select("*").order("id"),
    supabase.from("scores").select("game_id, score"),
  ]);

  if (gamesError) throw gamesError;
  if (scoresError) throw scoresError;

  const stats = new Map<string, { best: number; plays: number }>();
  for (const row of scores ?? []) {
    const current = stats.get(row.game_id) ?? { best: 0, plays: 0 };
    current.plays += 1;
    current.best = Math.max(current.best, row.score);
    stats.set(row.game_id, current);
  }

  return (games ?? []).map((game) => ({
    ...game,
    ...(stats.get(game.id) ?? { best: 0, plays: 0 }),
  }));
}

export async function getGame(id: string): Promise<Game | null> {
  const supabase = await createClient();

  const [
    { data: game, error: gameError },
    { data: scores, error: scoresError },
  ] = await Promise.all([
    supabase.from("games").select("*").eq("id", id).maybeSingle(),
    supabase.from("scores").select("score").eq("game_id", id),
  ]);

  if (gameError) throw gameError;
  if (scoresError) throw scoresError;
  if (!game) return null;

  const plays = scores?.length ?? 0;
  const best = plays > 0 ? Math.max(...scores!.map((row) => row.score)) : 0;

  return { ...game, best, plays };
}

export async function getTopScores(
  gameId: string,
  limit = 10,
): Promise<ScoreRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scores")
    .select("player_name, score, created_at")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return toScoreRows(data ?? []);
}

export async function getAllTopScores(
  limit = 12,
): Promise<Record<string, ScoreRow[]>> {
  const supabase = await createClient();

  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id");

  if (gamesError) throw gamesError;

  const entries = await Promise.all(
    (games ?? []).map(async (game) => {
      const { data, error } = await supabase
        .from("scores")
        .select("player_name, score, created_at")
        .eq("game_id", game.id)
        .order("score", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return [game.id, toScoreRows(data ?? [])] as const;
    }),
  );

  return Object.fromEntries(entries);
}
