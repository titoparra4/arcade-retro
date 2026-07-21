import { getAllTopScores, getGames } from "@/lib/supabase/games";
import { HallOfFame } from "./hall-of-fame";

export default async function HallOfFamePage() {
  const [games, allTopScores] = await Promise.all([
    getGames(),
    getAllTopScores(12),
  ]);

  return <HallOfFame games={games} allTopScores={allTopScores} />;
}
