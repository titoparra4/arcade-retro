import { redirect } from "next/navigation";
import { getUserWithoutProfile } from "@/lib/supabase/profiles";
import { AuthShell } from "../auth-shell";
import { PerfilForm } from "./perfil-form";

/**
 * Onboarding de quien llega por Google o GitHub: ningún proveedor aporta un
 * nombre de jugador, y el salón necesita uno.
 *
 * Solo tiene sentido en el hueco entre tener sesión y tener perfil. Sin sesión
 * o con el perfil ya creado, aquí no hay nada que hacer.
 */
export default async function CompletarPerfil() {
  const pending = await getUserWithoutProfile();

  if (!pending) {
    redirect("/games");
  }

  return (
    <AuthShell subtitle="NUEVO JUGADOR · ELIGE TU NOMBRE">
      <PerfilForm email={pending.email} suggestedName={pending.suggestedName} />
    </AuthShell>
  );
}
