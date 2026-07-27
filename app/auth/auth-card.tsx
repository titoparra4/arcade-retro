"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction, signUpAction, type AuthFormState } from "./actions";
import { AuthMessage as Message, AuthShell } from "./auth-shell";

const EMPTY: AuthFormState = { error: null, notice: null };

const LINK_ERROR =
  "ESE ENLACE YA NO SIRVE. PIDE UNO NUEVO E INTÉNTALO OTRA VEZ.";

export default function AuthCard({ linkError }: { linkError: boolean }) {
  const [tab, setTab] = useState<"in" | "up">("in");

  // Un estado por pestaña: así el error de una no aparece al cambiar a la otra.
  const [signIn, signInForm, signingIn] = useActionState(signInAction, EMPTY);
  const [signUp, signUpForm, signingUp] = useActionState(signUpAction, EMPTY);

  const state = tab === "in" ? signIn : signUp;

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

        {linkError && !state.error && !state.notice && (
          <Message text={LINK_ERROR} tone="err" />
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
        <div className="social">
          {/* Inertes hasta el SPEC 14 (OAuth). */}
          <button className="btn ghost" type="button">
            ◆ GOOGLE
          </button>
          <button className="btn ghost" type="button">
            ▣ GITHUB
          </button>
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
