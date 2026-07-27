import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string; // = auth.users.id
  playerName: string; // player_name, mayúsculas, 1–10
}

/** Perfil + el correo, que vive en auth.users y no en la tabla profiles. */
export interface SessionUser extends Profile {
  email: string;
}

/**
 * Usuario de la sesión actual con su perfil, o null si no hay sesión.
 * Es lo que el layout pasa como initialUser al UserProvider.
 *
 * Usa getUser() y no getSession(): getUser() revalida el token contra el
 * servidor de Auth, mientras que getSession() se fía de la cookie.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, player_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { id: data.id, playerName: data.player_name, email: user.email ?? "" };
}

/** Perfil del usuario de la sesión actual, o null si no hay sesión. */
export async function getProfile(): Promise<Profile | null> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  return { id: sessionUser.id, playerName: sessionUser.playerName };
}

/**
 * Comprueba si un player_name ya está registrado. La tabla los guarda siempre
 * en mayúsculas, así que se normaliza antes de comparar.
 *
 * El unique de profiles es lo que garantiza la integridad; esta comprobación
 * previa existe solo para dar un mensaje de error decente antes del signUp.
 */
export async function isPlayerNameTaken(name: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("player_name", name.trim().toUpperCase())
    .maybeSingle();

  if (error) throw error;

  return data !== null;
}
