"use client";

import { useActionState } from "react";
import { updatePasswordAction, type AuthFormState } from "../actions";
import { AuthMessage } from "../auth-shell";

const EMPTY: AuthFormState = { error: null, notice: null };

export function NuevaContrasenaForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    EMPTY,
  );

  return (
    <>
      {state.error && <AuthMessage text={state.error} tone="err" />}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="new-password">Contraseña nueva</label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
          <span className="field-hint">mínimo 8 caracteres</span>
        </div>
        <div className="field">
          <label htmlFor="new-password-confirm">Repite la contraseña</label>
          <input
            id="new-password-confirm"
            name="password_confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
        </div>
        <button
          className="btn lg"
          type="submit"
          disabled={pending}
          style={{ width: "100%", marginTop: 8 }}
        >
          {pending ? "GUARDANDO…" : "GUARDAR Y ENTRAR"}
        </button>
      </form>
    </>
  );
}
