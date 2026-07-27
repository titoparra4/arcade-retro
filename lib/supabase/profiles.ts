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

/** Usuario con sesión iniciada pero sin fila en profiles. */
export interface PendingUser {
  id: string;
  email: string;
  suggestedName: string; // ya normalizado: mayúsculas, 1–10, ^[A-Z0-9_-]{1,10}$
}

/** Lo que propone suggestPlayerName cuando no queda nada aprovechable. */
const FALLBACK_PLAYER_NAME = "JUGADOR";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Deriva un player_name a partir de la metadata del proveedor.
 * Orden: user_name · preferred_username · primera palabra de full_name · parte
 * local del correo. Se pasa a mayúsculas, se descarta lo que no case con
 * [A-Z0-9_-], se recorta a 10 y, si queda vacío, devuelve "JUGADOR".
 * Es solo una sugerencia: la unicidad la sigue garantizando el unique de la tabla.
 */
export function suggestPlayerName(
  metadata: Record<string, unknown>,
  email: string,
): string {
  // GitHub manda full_name; Google manda name. Son el mismo dato.
  const fullName = asString(metadata.full_name) || asString(metadata.name);

  const candidates = [
    asString(metadata.user_name),
    asString(metadata.preferred_username),
    fullName.trim().split(/\s+/)[0] ?? "",
    email.split("@")[0] ?? "",
  ];

  for (const candidate of candidates) {
    const normalized = candidate
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 10);

    if (normalized) return normalized;
  }

  return FALLBACK_PLAYER_NAME;
}

/**
 * Devuelve el usuario si tiene sesión y NO tiene perfil; null en cualquier otro
 * caso. Es lo que distingue a quien acaba de llegar por OAuth —y debe pasar por
 * /auth/completar-perfil— de quien ya eligió nombre.
 */
export async function getUserWithoutProfile(): Promise<PendingUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return null; // ya tiene perfil: no hay nada pendiente

  const email = user.email ?? "";

  return {
    id: user.id,
    email,
    suggestedName: suggestPlayerName(user.user_metadata ?? {}, email),
  };
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
