import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getUserWithoutProfile } from "@/lib/supabase/profiles";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta del flujo OAuth (Google y GitHub): el proveedor manda aquí un ?code=
 * que hay que canjear por una sesión.
 *
 * No tiene nada que ver con /auth/confirm, que verifica el token_hash de los
 * enlaces de correo. Son dos flujos distintos y comparten cero código.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  // El jugador canceló el consentimiento o denegó los permisos.
  const providerError = searchParams.get("error");

  if (providerError) {
    console.error("auth/callback: el proveedor devolvió:", providerError);
    redirect("/auth?error=oauth");
  }

  if (!code) {
    redirect("/auth?error=oauth");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      "auth/callback: exchangeCodeForSession falló:",
      error.message,
    );
    redirect("/auth?error=oauth");
  }

  // La sesión ya está en las cookies. Quien no tenga fila en profiles todavía
  // no ha elegido nombre de jugador: la tabla es la única fuente de verdad.
  const pending = await getUserWithoutProfile();

  redirect(pending ? "/auth/completar-perfil" : "/games");
}
