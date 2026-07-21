import { notFound } from "next/navigation";
import { GamePlayer } from "../../../components/game-player";
import { getGame } from "@/lib/supabase/games";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  return <GamePlayer game={game} />;
}
