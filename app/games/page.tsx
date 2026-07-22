import { getGames } from "@/lib/supabase/games";
import { GamesLibrary } from "./games-library";

export default async function Library() {
  const games = await getGames();

  return <GamesLibrary games={games} />;
}
