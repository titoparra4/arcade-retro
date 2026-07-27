"use client";

import { useActionState } from "react";
import { completeProfileAction, type AuthFormState } from "../actions";
import { AuthMessage } from "../auth-shell";

const EMPTY: AuthFormState = { error: null, notice: null };

/**
 * Un solo campo, así que el campo es la pantalla: se presenta como el registro
 * de iniciales de una recreativa, no como un input más del formulario de alta.
 */
export function PerfilForm({
  email,
  suggestedName,
}: {
  email: string;
  suggestedName: string;
}) {
  const [state, formAction, pending] = useActionState(
    completeProfileAction,
    EMPTY,
  );

  return (
    <>
      <div
        className="mono"
        style={{
          marginBottom: 16,
          textAlign: "center",
          fontSize: 11,
          color: "var(--ink-faint)",
          letterSpacing: "0.08em",
          wordBreak: "break-all",
        }}
      >
        {email}
      </div>

      {state.error && <AuthMessage text={state.error} tone="err" />}

      <form action={formAction}>
        <div className="field name-entry">
          <label htmlFor="player-name">Tu nombre en el salón</label>
          <input
            id="player-name"
            name="player_name"
            type="text"
            autoComplete="username"
            defaultValue={suggestedName}
            maxLength={10}
            autoFocus
            required
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className="field-hint">
            1–10 caracteres · letras, números, _ y - · no se puede cambiar
            después
          </span>
        </div>
        <button
          className="btn lg"
          type="submit"
          disabled={pending}
          style={{ width: "100%", marginTop: 8 }}
        >
          {pending ? "GUARDANDO…" : "ENTRAR AL ARCADE"}
        </button>
      </form>
    </>
  );
}
