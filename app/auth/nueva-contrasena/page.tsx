import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthMessage, AuthShell } from "../auth-shell";
import { NuevaContrasenaForm } from "./nueva-contrasena-form";

/**
 * Destino del enlace de recuperación, al que /auth/confirm redirige después de
 * canjear el token. Sin esa sesión no hay a quién cambiarle la contraseña, así
 * que la pantalla ni siquiera muestra el formulario.
 */
export default async function NuevaContrasena() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthShell subtitle="CONTRASEÑA NUEVA">
        <>
          <AuthMessage
            text="ESTA PANTALLA SOLO SE ABRE DESDE EL ENLACE DEL CORREO."
            tone="err"
          />
          <Link
            className="btn lg"
            href="/auth/recuperar"
            style={{ width: "100%", marginTop: 8 }}
          >
            PEDIR UN ENLACE
          </Link>
        </>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="CONTRASEÑA NUEVA">
      <NuevaContrasenaForm />
    </AuthShell>
  );
}
