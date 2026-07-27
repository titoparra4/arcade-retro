import AuthCard from "./auth-card";

// Server Component: lee el ?error= con el que vuelven los dos flujos que pueden
// fallar fuera de esta pantalla — "enlace" desde /auth/confirm cuando el enlace
// del correo ya no vale, y "oauth" desde /auth/callback.
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <AuthCard error={error ?? null} />;
}
