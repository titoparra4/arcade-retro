"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPlayerNameTaken } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error: string | null;
  notice: string | null; // p. ej. "Revisa tu correo para confirmar la cuenta"
}

// Mismo formato que el check de public.profiles.
const PLAYER_NAME_RE = /^[A-Z0-9_-]{1,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8; // coincide con el mínimo del dashboard

const GENERIC_ERROR = "ALGO FALLÓ EN EL SISTEMA. INTENTA DE NUEVO.";

function fail(error: string): AuthFormState {
  return { error, notice: null };
}

/**
 * Traduce el error de Supabase (siempre en inglés) al mensaje que ve el jugador.
 * Se compara sobre el mensaje en minúsculas porque el texto exacto cambia entre
 * versiones de GoTrue.
 */
function translateAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "CREDENCIALES INVÁLIDAS. REVISA CORREO Y CONTRASEÑA.";
  }
  if (m.includes("email not confirmed")) {
    return "TU CUENTA AÚN NO ESTÁ CONFIRMADA. REVISA TU CORREO.";
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered")
  ) {
    return "ESE CORREO YA ESTÁ REGISTRADO. INICIA SESIÓN.";
  }
  if (m.includes("password should be at least")) {
    return `LA CONTRASEÑA NECESITA AL MENOS ${MIN_PASSWORD} CARACTERES.`;
  }
  if (m.includes("email rate limit") || m.includes("rate limit")) {
    return "DEMASIADOS INTENTOS. ESPERA UN MINUTO Y VUELVE A PROBAR.";
  }
  // Supabase valida el dominio: rechaza example.com y similares.
  if (m.includes("email address") && m.includes("invalid")) {
    return "SUPABASE NO ACEPTA ESE CORREO. USA UNO REAL.";
  }
  if (m.includes("error sending")) {
    return "NO PUDIMOS ENVIAR EL CORREO. INTÉNTALO EN UN MINUTO.";
  }

  console.error("auth: error sin traducir de Supabase:", message);
  return GENERIC_ERROR;
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // El player_name vive en mayúsculas en la base: normalizar aquí es lo que
  // hace que el unique de Postgres baste como garantía de unicidad.
  const playerName = String(formData.get("player_name") ?? "")
    .trim()
    .toUpperCase();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!playerName || !email || !password) {
    return fail("COMPLETA LOS TRES CAMPOS.");
  }
  if (!PLAYER_NAME_RE.test(playerName)) {
    return fail("EL USUARIO ADMITE LETRAS, NÚMEROS, _ Y - (MÁX. 10).");
  }
  if (!EMAIL_RE.test(email)) {
    return fail("ESE CORREO NO PARECE VÁLIDO.");
  }
  if (password.length < MIN_PASSWORD) {
    return fail(`LA CONTRASEÑA NECESITA AL MENOS ${MIN_PASSWORD} CARACTERES.`);
  }

  // El trigger handle_new_user garantiza la unicidad, pero su violación sale
  // como un 500 opaco: esta comprobación previa es la que da el mensaje bueno.
  try {
    if (await isPlayerNameTaken(playerName)) {
      return fail("ESE NOMBRE YA ESTÁ EN USO. ELIGE OTRO.");
    }
  } catch (err) {
    console.error("signUpAction: fallo comprobando el nombre:", err);
    return fail(GENERIC_ERROR);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { player_name: playerName } },
  });

  if (error) {
    return fail(translateAuthError(error.message));
  }

  // Con "Confirm email" activo, Supabase no revela si el correo ya existe:
  // devuelve un usuario simulado con identities vacío en vez de un error.
  if (data.user && data.user.identities?.length === 0) {
    return fail("ESE CORREO YA ESTÁ REGISTRADO. INICIA SESIÓN.");
  }

  return {
    error: null,
    notice: `CUENTA CREADA. REVISA ${email} Y ABRE EL ENLACE PARA CONFIRMARLA.`,
  };
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return fail("COMPLETA CORREO Y CONTRASEÑA.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return fail(translateAuthError(error.message));
  }

  // Los Server Components ya renderizados (nav, salón) conservarían la sesión
  // anterior sin esto.
  revalidatePath("/", "layout");
  redirect("/games");
}

export type OAuthProvider = "google" | "github";

const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["google", "github"];

/**
 * Lanza el flujo OAuth: pide a Supabase la URL del proveedor y manda ahí al
 * jugador. La vuelta la atiende /auth/callback, que es quien canjea el ?code=.
 *
 * Es una Server Action y no una llamada desde el cliente para que los botones
 * funcionen aunque el JavaScript aún no haya hidratado.
 */
export async function signInWithProviderAction(
  formData: FormData,
): Promise<void> {
  const provider = String(formData.get("provider") ?? "") as OAuthProvider;

  if (!OAUTH_PROVIDERS.includes(provider)) {
    console.error("signInWithProviderAction: proveedor desconocido:", provider);
    redirect("/auth?error=oauth");
  }

  // El redirectTo tiene que ser absoluto y estar en las Redirect URLs de
  // Supabase. En este spec eso significa http://localhost:3000.
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    console.error(
      "signInWithProviderAction: signInWithOAuth falló:",
      error?.message ?? "sin URL de proveedor",
    );
    redirect("/auth?error=oauth");
  }

  redirect(data.url);
}

/**
 * Crea la fila de profiles de quien llegó por OAuth: ningún proveedor aporta
 * player_name, así que lo elige aquí. El trigger handle_new_user no ha
 * insertado nada porque la metadata del proveedor no lo trae.
 */
export async function completeProfileAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const playerName = String(formData.get("player_name") ?? "")
    .trim()
    .toUpperCase();

  if (!playerName) {
    return fail("ELIGE UN NOMBRE DE JUGADOR.");
  }
  if (!PLAYER_NAME_RE.test(playerName)) {
    return fail("EL USUARIO ADMITE LETRAS, NÚMEROS, _ Y - (MÁX. 10).");
  }

  const supabase = await createClient();

  // La policy profiles_insert_own solo deja crear la fila propia, así que el id
  // sale de la sesión y nunca del formulario.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("TU SESIÓN HA CADUCADO. VUELVE A ENTRAR DESDE /AUTH.");
  }

  // Redundante a propósito con el unique de la tabla: esta comprobación da el
  // mensaje bueno, el unique es lo que de verdad decide.
  try {
    if (await isPlayerNameTaken(playerName)) {
      return fail("ESE NOMBRE YA ESTÁ EN USO. ELIGE OTRO.");
    }
  } catch (err) {
    console.error("completeProfileAction: fallo comprobando el nombre:", err);
    return fail(GENERIC_ERROR);
  }

  const { error } = await supabase
    .from("profiles")
    .insert({ id: user.id, player_name: playerName });

  if (error) {
    // 23505 = unique_violation: dos jugadores eligiendo el mismo nombre a la vez.
    if (error.code === "23505") {
      return fail("ESE NOMBRE YA ESTÁ EN USO. ELIGE OTRO.");
    }
    console.error("completeProfileAction: el insert falló:", error.message);
    return fail(GENERIC_ERROR);
  }

  // El layout y la nav ya se renderizaron viendo a este usuario como invitado.
  revalidatePath("/", "layout");
  redirect("/games");
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!EMAIL_RE.test(email)) {
    return fail("ESE CORREO NO PARECE VÁLIDO.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    return fail(translateAuthError(error.message));
  }

  // Mismo mensaje exista o no la cuenta: decir "ese correo no está registrado"
  // convertiría esta pantalla en un detector de cuentas.
  return {
    error: null,
    notice: `SI HAY UNA CUENTA CON ${email}, EL ENLACE YA VA DE CAMINO.`,
  };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirm") ?? "");

  if (password.length < MIN_PASSWORD) {
    return fail(`LA CONTRASEÑA NECESITA AL MENOS ${MIN_PASSWORD} CARACTERES.`);
  }
  if (password !== confirmation) {
    return fail("LAS DOS CONTRASEÑAS NO COINCIDEN.");
  }

  const supabase = await createClient();

  // Sin sesión de recuperación no hay a quién cambiarle la contraseña.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("EL ENLACE YA NO VALE. PIDE UNO NUEVO DESDE RECUPERAR ACCESO.");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return fail(translateAuthError(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/games");
}
