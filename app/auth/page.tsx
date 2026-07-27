import AuthCard from "./auth-card";

// Server Component: lee el ?error=enlace con el que redirige /auth/confirm
// cuando el enlace del correo ya no vale.
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <AuthCard linkError={error === "enlace"} />;
}
