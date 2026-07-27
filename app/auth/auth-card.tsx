"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  signInAction,
  signInWithProviderAction,
  signUpAction,
  type AuthFormState,
} from "./actions";
import { AuthMessage as Message, AuthShell } from "./auth-shell";

const EMPTY: AuthFormState = { error: null, notice: null };

// Errores que llegan por la URL, de vuelta de un flujo que ocurrió fuera de esta
// pantalla.
const ENTRY_ERRORS: Record<string, string> = {
  enlace: "ESE ENLACE YA NO SIRVE. PIDE UNO NUEVO E INTÉNTALO OTRA VEZ.",
  oauth: "NO PUDIMOS ENTRAR CON ESE PROVEEDOR. INTÉNTALO OTRA VEZ.",
};

export default function AuthCard({ error }: { error: string | null }) {
  const [tab, setTab] = useState<"in" | "up">("in");

  // Un estado por pestaña: así el error de una no aparece al cambiar a la otra.
  const [signIn, signInForm, signingIn] = useActionState(signInAction, EMPTY);
  const [signUp, signUpForm, signingUp] = useActionState(signUpAction, EMPTY);

  const state = tab === "in" ? signIn : signUp;
  const entryError = error ? ENTRY_ERRORS[error] : undefined;

  return (
    <AuthShell subtitle="ACCESO AL SISTEMA · v2.6">
      <>
        <div className="auth-tabs">
          <button
            className={tab === "in" ? "on" : ""}
            onClick={() => setTab("in")}
            type="button"
          >
            INICIAR SESIÓN
          </button>
          <button
            className={tab === "up" ? "on" : ""}
            onClick={() => setTab("up")}
            type="button"
          >
            CREAR CUENTA
          </button>
        </div>

        {entryError && !state.error && !state.notice && (
          <Message text={entryError} tone="err" />
        )}
        {state.error && <Message text={state.error} tone="err" />}
        {state.notice && <Message text={state.notice} tone="ok" />}

        {tab === "in" ? (
          <form action={signInForm} key="in">
            <div className="field">
              <label htmlFor="in-email">Correo electrónico</label>
              <input
                id="in-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="jugador@vault.gg"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="in-password">Contraseña</label>
              <input
                id="in-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              className="btn lg"
              type="submit"
              disabled={signingIn}
              style={{ width: "100%", marginTop: 8 }}
            >
              {signingIn ? "ENTRANDO…" : "ENTRAR AL ARCADE"}
            </button>
            <div className="auth-aside">
              <Link href="/auth/recuperar">¿Olvidaste tu contraseña?</Link>
            </div>
          </form>
        ) : (
          <form action={signUpForm} key="up">
            <div className="field">
              <label htmlFor="up-name">Usuario</label>
              <input
                id="up-name"
                name="player_name"
                type="text"
                autoComplete="username"
                placeholder="PX_KAI"
                maxLength={10}
                style={{ textTransform: "uppercase" }}
                required
              />
              <span className="field-hint">
                1–10 caracteres · letras, números, _ y -
              </span>
            </div>
            <div className="field slide-in">
              <label htmlFor="up-email">Correo electrónico</label>
              <input
                id="up-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="jugador@vault.gg"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="up-password">Contraseña</label>
              <input
                id="up-password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={8}
                required
              />
              <span className="field-hint">mínimo 8 caracteres</span>
            </div>
            <button
              className="btn lg"
              type="submit"
              disabled={signingUp}
              style={{ width: "100%", marginTop: 8 }}
            >
              {signingUp ? "CREANDO…" : "CREAR Y JUGAR"}
            </button>
          </form>
        )}

        <Link
          className="btn ghost"
          href="/games"
          style={{ width: "100%", marginTop: 10 }}
        >
          JUGAR COMO INVITADO
        </Link>

        <div className="auth-divider">O CONTINÚA CON</div>
        {/* Un form por proveedor: la Server Action pide la URL a Supabase y
            redirige, así que funcionan aunque el JavaScript no haya hidratado. */}
        <div className="social">
          <form action={signInWithProviderAction}>
            <input type="hidden" name="provider" value="google" />
            <button className="btn ghost" type="submit">
              ◆ GOOGLE
            </button>
          </form>
          <form action={signInWithProviderAction}>
            <input type="hidden" name="provider" value="github" />
            <button className="btn ghost" type="submit">
              ▣ GITHUB
            </button>
          </form>
        </div>

        <div
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ink-faint)",
            letterSpacing: "0.1em",
          }}
        >
          AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
        </div>
      </>
    </AuthShell>
  );
}
