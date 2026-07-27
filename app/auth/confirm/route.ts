import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace de los correos de Supabase (plantillas "Confirm sign up" y
 * "Reset password", que apuntan aquí con ?token_hash=…&type=…).
 *
 * Tiene que ser un Route Handler y no un Server Component: verifyOtp escribe
 * las cookies de sesión, y durante el render de un Server Component no se
 * pueden escribir cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    redirect("/auth?error=enlace");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("auth/confirm: verifyOtp falló:", error.message);
    redirect("/auth?error=enlace");
  }

  // La sesión ya está en las cookies: recovery va a elegir contraseña nueva,
  // el resto (confirmación de alta) entra directo al arcade.
  redirect(type === "recovery" ? "/auth/nueva-contrasena" : "/games");
}
