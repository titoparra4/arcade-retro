"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type AuthFormState } from "../actions";
import { AuthMessage, AuthShell } from "../auth-shell";

const EMPTY: AuthFormState = { error: null, notice: null };

export default function Recuperar() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    EMPTY,
  );

  return (
    <AuthShell subtitle="RECUPERAR ACCESO">
      <>
        <p
          className="mono"
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--ink-dim)",
            margin: "0 0 16px",
          }}
        >
          Escribe el correo de tu cuenta y te mandamos un enlace para elegir una
          contraseña nueva.
        </p>

        {state.error && <AuthMessage text={state.error} tone="err" />}
        {state.notice && <AuthMessage text={state.notice} tone="ok" />}

        <form action={formAction}>
          <div className="field">
            <label htmlFor="rec-email">Correo electrónico</label>
            <input
              id="rec-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="jugador@vault.gg"
              required
            />
          </div>
          <button
            className="btn lg"
            type="submit"
            disabled={pending}
            style={{ width: "100%", marginTop: 8 }}
          >
            {pending ? "ENVIANDO…" : "ENVIAR ENLACE"}
          </button>
        </form>

        <div className="auth-aside">
          <Link href="/auth">Volver a iniciar sesión</Link>
        </div>
      </>
    </AuthShell>
  );
}
