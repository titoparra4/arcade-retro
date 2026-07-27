import type { ReactNode } from "react";

/** La cabina de acceso: misma tarjeta para entrar, recuperar y cambiar clave. */
export function AuthShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark"></div>
          <h2 className="neon-cyan">ARCADE RETRO</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            {subtitle}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Respuesta del sistema: magenta rechaza, verde confirma. */
export function AuthMessage({
  text,
  tone,
}: {
  text: string;
  tone: "err" | "ok";
}) {
  return (
    <div className={`auth-msg ${tone}`} role="alert">
      {text}
    </div>
  );
}
