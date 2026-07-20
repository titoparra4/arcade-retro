// Página temporal de verificación (SPEC 04). Se retira cuando el spec de
// auth real la reemplace por un flujo de verdad.
import { createClient } from "@/lib/supabase/server";

export default async function DebugSupabasePage() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getClaims();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="font-mono text-xl">
        {error ? `ERROR: ${error.message}` : "CONECTADO A SUPABASE"}
      </p>
    </main>
  );
}
